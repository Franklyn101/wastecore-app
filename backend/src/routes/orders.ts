import { Router } from "express"
import { z } from "zod"
import { currentUser, requireCustomer, requireUser } from "../auth.ts"
import { BAG_SIZES, bagSizeIds, INSTANT_PICKUP, MAX_BAG_PACKS, SCHEDULED_PICKUP } from "../catalog.ts"
import { pickupPrice, pricing } from "../pricing.ts"
import { prisma } from "../db.ts"
import { assertRoom, firstDayWithRoom } from "../capacity.ts"
import { assertInStock } from "../stock.ts"
import { locationFields, resolveLocation } from "./areas.ts"
import type { Order, OrderType } from "../generated/prisma/client.ts"
import { TimeWindow } from "../generated/prisma/enums.ts"
import { HttpError } from "../http.ts"
import { withUniqueReference } from "../references.ts"
import { events } from "../events.ts"
import { customerOrder } from "../serializers.ts"
import { imageUpload, looksLikeImage, saveImage } from "../storage.ts"
import { addDays, toDay, ymd } from "../dates.ts"
import { futureDateSchema, hourInLagos, todayInLagos, trimmed } from "../validation.ts"

const wasteType = trimmed(100, "Waste type")
const timeWindow = z.enum(TimeWindow, "Choose morning or afternoon.").nullable().optional()

// One-off services. Weekly and premium plans are subscriptions (routes/subscriptions.ts).
const createOrderSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("INSTANT_PICKUP"),
      ...locationFields,
      wasteType,
      bags: z.coerce
        .number()
        .int("Number of bags must be a whole number.")
        .min(1, "Add at least 1 bag.")
        .max(INSTANT_PICKUP.maxBags, `For more than ${INSTANT_PICKUP.maxBags} bags, please contact support.`)
        .default(1),
      // WasteCore bags for the collector to bring.
      wastecoreBags: z.coerce
        .number()
        .int("Number of WasteCore bags must be a whole number.")
        .min(0)
        .max(INSTANT_PICKUP.maxWastecoreBags, `You can ask for at most ${INSTANT_PICKUP.maxWastecoreBags} WasteCore bags.`)
        .default(0),
      // Either "as soon as possible" (instant price) or a chosen date (scheduled price).
      asap: z.boolean().default(false),
      pickupDate: futureDateSchema.optional(),
      timeWindow,
    })
    .refine((b) => b.asap || b.pickupDate, { message: "Choose a pickup date.", path: ["pickupDate"] }),
  z.object({
    type: z.literal("WASTE_BAGS"),
    bagSize: z.enum(bagSizeIds, "Choose a bag size."),
    quantity: z.coerce
      .number()
      .int("Quantity must be a whole number.")
      .min(1, "Order at least 1 pack.")
      .max(MAX_BAG_PACKS, `You can order at most ${MAX_BAG_PACKS} packs.`),
    ...locationFields,
  }),
])

type CreateOrder = z.infer<typeof createOrderSchema>

/** Same day if booked before the cutoff (Lagos time), otherwise the next day. */
/** How far ahead a one-off pickup can be moved. */
const RESCHEDULE_MAX_DAYS = 30

export function asapDate(now = new Date()): string {
  const day = todayInLagos(now)
  return hourInLagos(now) < INSTANT_PICKUP.asapCutoffHour ? day : ymd(addDays(toDay(day), 1))
}

/** Prices the order from the catalog and pricing. The client never sends an amount. */
function orderData(body: CreateOrder) {
  if (body.type === "INSTANT_PICKUP") {
    return {
      type: body.type as OrderType,
      // Which price applies; kept even if the pickup is later moved to another day.
      plan: body.asap ? INSTANT_PICKUP.id : SCHEDULED_PICKUP.id,
      wasteType: body.wasteType,
      scheduledDate: body.asap ? asapDate() : body.pickupDate!,
      asap: body.asap,
      // "As soon as possible" means the next free slot, so no time window.
      timeWindow: body.asap ? null : (body.timeWindow ?? null),
      quantity: body.bags,
      wastecoreBags: body.wastecoreBags,
      amount: pickupPrice(body.bags, body.asap) + body.wastecoreBags * pricing().wastecoreBag,
    }
  }
  return {
    type: body.type as OrderType,
    plan: body.bagSize,
    wasteType: null,
    scheduledDate: todayInLagos(),
    quantity: body.quantity,
    amount: BAG_SIZES.find((b) => b.id === body.bagSize)!.price * body.quantity,
  }
}

async function findOwnOrder(id: string | string[], userId: string) {
  const order = await prisma.order.findFirst({ where: { id: String(id), userId } })
  if (!order) throw new HttpError(404, "Order not found.")
  return order
}

export const ordersRouter = Router()
ordersRouter.use("/orders", requireUser, requireCustomer)

ordersRouter.post("/orders", async (req, res) => {
  const user = currentUser(req)
  const body = createOrderSchema.parse(req.body)
  const location = await resolveLocation(body, user.id)
  const data = orderData(body)
  if (body.type === "INSTANT_PICKUP") {
    // "As soon as possible" takes the first day with room; a chosen day must have room.
    if (body.asap) data.scheduledDate = await firstDayWithRoom(location.areaId, data.scheduledDate)
    else await assertRoom(location.areaId, data.scheduledDate)
  } else {
    await assertInStock(body.bagSize, body.quantity)
  }
  const order = await withUniqueReference("WC", (reference) =>
    prisma.order.create({
      data: { ...data, ...location, scheduledDate: toDay(data.scheduledDate), reference, userId: user.id },
    }),
  )
  // Remember the address for next time, like the bot's returning-customer flow.
  if (!user.address) await prisma.user.update({ where: { id: user.id }, data: { address: location.address } })
  res.status(201).json({ order: customerOrder(order) })
})

ordersRouter.get("/orders", async (req, res) => {
  // Plan pickups are listed under the plan (GET /subscriptions/:id), not here.
  const orders = await prisma.order.findMany({
    where: { userId: currentUser(req).id, type: { not: "PLAN_PICKUP" } },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  res.json({ orders: orders.map(customerOrder) })
})

ordersRouter.get("/orders/:id", async (req, res) => {
  const order = await findOwnOrder(req.params.id, currentUser(req).id)
  const refunds = await prisma.refund.findMany({ where: { orderId: order.id, status: { not: "FAILED" } }, orderBy: { createdAt: "asc" } })
  res.json({
    order: customerOrder(order),
    refunds: refunds.map((r) => ({ amount: r.amount, reason: r.reason, method: r.method, status: r.status, createdAt: r.createdAt })),
  })
})

// Upload (or replace) the bank-transfer receipt. Moves the order to PENDING for an admin to verify.
ordersRouter.post("/orders/:id/receipt", imageUpload.single("receipt"), async (req, res) => {
  const order = await findOwnOrder(req.params.id, currentUser(req).id)
  const canTakeReceipt =
    order.status === "AWAITING_PAYMENT" || (order.status === "PENDING" && order.paymentMethod === "TRANSFER")
  if (!canTakeReceipt) {
    throw new HttpError(409, "This order can no longer take a receipt.")
  }
  if (!req.file) throw new HttpError(400, "Attach a photo of your payment receipt.")
  if (!looksLikeImage(req.file.buffer)) throw new HttpError(400, "That file is not a valid image.")

  const receiptUrl = await saveImage(req.file, order.reference, "receipts")
  // Conditional update so a concurrent cancel or admin change wins cleanly.
  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { receiptUrl, status: "PENDING", paymentMethod: "TRANSFER", paidAt: new Date(), customerNote: null },
  })
  if (updated.count === 0) throw new HttpError(409, "This order can no longer take a receipt.")
  // Staff only need telling about the first receipt; a replacement shows on the same order.
  if (order.status === "AWAITING_PAYMENT") await events.receiptUploaded(order)
  res.json({ order: customerOrder(await findOwnOrder(order.id, order.userId)) })
})

ordersRouter.post("/orders/:id/cancel", async (req, res) => {
  const order = await findOwnOrder(req.params.id, currentUser(req).id)
  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: "AWAITING_PAYMENT" },
    data: { status: "CANCELLED" },
  })
  if (updated.count === 0) {
    throw new HttpError(409, "Paid orders can't be cancelled in the app. Please contact support.")
  }
  res.json({ order: customerOrder(await findOwnOrder(order.id, order.userId)) })
})

/** A pickup the customer can still move or skip: booked, not yet done, and the collector hasn't set off. */
function assertChangeable(order: Order) {
  if (order.type === "WASTE_BAGS") throw new HttpError(409, "Bag deliveries can't be rescheduled in the app. Please contact support.")
  const open =
    order.status === "PENDING" ||
    order.status === "ASSIGNED" ||
    (order.status === "AWAITING_PAYMENT" && (order.type === "INSTANT_PICKUP" || order.type === "SPECIAL_PICKUP"))
  if (!open) throw new HttpError(409, "This pickup can no longer be changed.")
  if (order.onTheWayAt) throw new HttpError(409, "Your collector is already on the way. Call them or contact support.")
  if (ymd(order.scheduledDate) < todayInLagos()) throw new HttpError(409, "This pickup's date has passed. Please contact support.")
}

const rescheduleSchema = z.object({ date: futureDateSchema, timeWindow })

// Move a pickup to another day or time of day.
ordersRouter.post("/orders/:id/reschedule", async (req, res) => {
  const body = rescheduleSchema.parse(req.body)
  const order = await findOwnOrder(req.params.id, currentUser(req).id)
  assertChangeable(order)
  if (order.subscriptionId) {
    // A plan pickup has to stay within the period it was paid for.
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: order.subscriptionId } })
    if (sub.currentPeriodEnd && body.date >= ymd(sub.currentPeriodEnd)) {
      throw new HttpError(422, `Choose a date before ${ymd(sub.currentPeriodEnd)}, when this plan period ends.`)
    }
  } else if (body.date > ymd(addDays(toDay(todayInLagos()), RESCHEDULE_MAX_DAYS))) {
    throw new HttpError(422, `Choose a date within the next ${RESCHEDULE_MAX_DAYS} days.`)
  }
  if (body.date !== ymd(order.scheduledDate)) await assertRoom(order.areaId, body.date, order.id)
  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: order.status, onTheWayAt: null },
    data: { scheduledDate: toDay(body.date), timeWindow: body.timeWindow ?? null, asap: false },
  })
  if (updated.count === 0) throw new HttpError(409, "This pickup was just changed. Refresh and try again.")
  const after = await findOwnOrder(order.id, order.userId)
  await events.rescheduled(after)
  res.json({ order: customerOrder(after) })
})

// Skip one plan pickup (e.g. away that week). The plan's other pickups are unchanged.
ordersRouter.post("/orders/:id/skip", async (req, res) => {
  const order = await findOwnOrder(req.params.id, currentUser(req).id)
  if (order.type !== "PLAN_PICKUP") throw new HttpError(409, "Only plan pickups can be skipped. You can cancel or reschedule this one.")
  assertChangeable(order)
  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: order.status, onTheWayAt: null },
    data: { status: "CANCELLED", skippedAt: new Date() },
  })
  if (updated.count === 0) throw new HttpError(409, "This pickup was just changed. Refresh and try again.")
  const after = await findOwnOrder(order.id, order.userId)
  await events.skipped(after)
  res.json({ order: customerOrder(after) })
})

const ratingSchema = z.object({
  stars: z.number().int().min(1, "Choose 1 to 5 stars.").max(5, "Choose 1 to 5 stars."),
  comment: z.string().trim().max(500).optional().nullable(),
})

ordersRouter.post("/orders/:id/rating", async (req, res) => {
  const body = ratingSchema.parse(req.body)
  const order = await findOwnOrder(req.params.id, currentUser(req).id)
  if (order.status !== "COMPLETED") throw new HttpError(409, "You can rate this once it's done.")
  const updated = await prisma.order.updateMany({
    where: { id: order.id, ratedAt: null },
    data: { rating: body.stars, ratingComment: body.comment || null, ratedAt: new Date() },
  })
  if (updated.count === 0) throw new HttpError(409, "You've already rated this.")
  const after = await findOwnOrder(order.id, order.userId)
  await events.rated(after)
  res.json({ order: customerOrder(after) })
})
