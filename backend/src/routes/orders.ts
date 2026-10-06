import { Router } from "express"
import { z } from "zod"
import { currentUser, requireCustomer, requireUser } from "../auth.ts"
import { BAG_SIZES, bagSizeIds, INSTANT_PICKUP, MAX_BAG_PACKS } from "../catalog.ts"
import { prisma } from "../db.ts"
import type { OrderType } from "../generated/prisma/client.ts"
import { HttpError } from "../http.ts"
import { withUniqueReference } from "../references.ts"
import { customerOrder } from "../serializers.ts"
import { imageUpload, looksLikeImage, saveImage } from "../storage.ts"
import { addDays, toDay, ymd } from "../dates.ts"
import { futureDateSchema, hourInLagos, todayInLagos, trimmed } from "../validation.ts"

const address = trimmed(300, "Address")
const wasteType = trimmed(100, "Waste type")

// One-off services. Weekly and premium plans are subscriptions (routes/subscriptions.ts).
const createOrderSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("INSTANT_PICKUP"),
      address,
      wasteType,
      bags: z.coerce
        .number()
        .int("Number of bags must be a whole number.")
        .min(1, "Add at least 1 bag.")
        .max(INSTANT_PICKUP.maxBags, `For more than ${INSTANT_PICKUP.maxBags} bags, please contact support.`)
        .default(1),
      // Either "as soon as possible" or a chosen date.
      asap: z.boolean().default(false),
      pickupDate: futureDateSchema.optional(),
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
    address,
  }),
])

type CreateOrder = z.infer<typeof createOrderSchema>

/** Same day if booked before the cutoff (Lagos time), otherwise the next day. */
export function asapDate(now = new Date()): string {
  const day = todayInLagos(now)
  return hourInLagos(now) < INSTANT_PICKUP.asapCutoffHour ? day : ymd(addDays(toDay(day), 1))
}

/** Prices the order from the catalog. The client never sends an amount. */
function orderData(body: CreateOrder) {
  if (body.type === "INSTANT_PICKUP") {
    return {
      type: body.type as OrderType,
      plan: INSTANT_PICKUP.id,
      address: body.address,
      wasteType: body.wasteType,
      scheduledDate: body.asap ? asapDate() : body.pickupDate!,
      asap: body.asap,
      quantity: body.bags,
      amount: INSTANT_PICKUP.pricePerBag * body.bags,
    }
  }
  return {
    type: body.type as OrderType,
    plan: body.bagSize,
    address: body.address,
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
  const data = orderData(createOrderSchema.parse(req.body))
  const order = await withUniqueReference("WC", (reference) =>
    prisma.order.create({
      data: { ...data, scheduledDate: toDay(data.scheduledDate), reference, userId: user.id },
    }),
  )
  // Remember the address for next time, like the bot's returning-customer flow.
  if (!user.address) await prisma.user.update({ where: { id: user.id }, data: { address: data.address } })
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
  res.json({ order: customerOrder(await findOwnOrder(req.params.id, currentUser(req).id)) })
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
