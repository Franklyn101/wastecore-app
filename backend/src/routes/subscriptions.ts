import { Router } from "express"
import { z } from "zod"
import { currentUser, requireCustomer, requireUser } from "../auth.ts"
import { planChangeQuote, RENEW_WINDOW_DAYS } from "../billing.ts"
import { planIds } from "../catalog.ts"
import { daysBetween, toDay, today } from "../dates.ts"
import { prisma } from "../db.ts"
import { TimeWindow } from "../generated/prisma/enums.ts"
import { HttpError } from "../http.ts"
import { locationFields, resolveLocation } from "./areas.ts"
import { customerOrder, subscription } from "../serializers.ts"
import { futureDateSchema, trimmed } from "../validation.ts"

const timeWindow = z.enum(TimeWindow, "Choose morning or afternoon.").nullable().optional()

const createSchema = z.object({
  plan: z.enum(planIds, "Choose a plan."),
  ...locationFields,
  wasteType: trimmed(100, "Waste type"),
  timeWindow,
  startDate: futureDateSchema,
})

export const subscriptionsRouter = Router()
subscriptionsRouter.use("/subscriptions", requireUser, requireCustomer)

async function findOwn(id: string | string[], userId: string) {
  const sub = await prisma.subscription.findFirst({ where: { id: String(id), userId } })
  if (!sub) throw new HttpError(404, "Plan not found.")
  return sub
}

/** Unpaid plan sign-ups are dropped when the customer starts another one. */
async function cancelUnpaid(userId: string) {
  await prisma.subscription.updateMany({
    where: { userId, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED", replacesId: null },
  })
}

subscriptionsRouter.get("/subscriptions", async (req, res) => {
  const subs = await prisma.subscription.findMany({
    where: { userId: currentUser(req).id, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    take: 20,
  })
  res.json({ subscriptions: subs.map((s) => subscription(s)), renewWindowDays: RENEW_WINDOW_DAYS })
})

subscriptionsRouter.get("/subscriptions/:id", async (req, res) => {
  const sub = await findOwn(req.params.id, currentUser(req).id)
  const upcoming = await prisma.order.findMany({
    where: { subscriptionId: sub.id, status: { in: ["PENDING", "ASSIGNED"] }, scheduledDate: { gte: today() } },
    orderBy: { scheduledDate: "asc" },
    take: 10,
  })
  res.json({ subscription: subscription(sub), upcomingPickups: upcoming.map(customerOrder) })
})

// Sign up for a plan. It becomes active once paid (POST /payments with its id).
subscriptionsRouter.post("/subscriptions", async (req, res) => {
  const user = currentUser(req)
  const body = createSchema.parse(req.body)
  const active = await prisma.subscription.findFirst({ where: { userId: user.id, status: "ACTIVE" } })
  if (active) throw new HttpError(409, "You already have an active plan. Use Change plan to switch.")

  const location = await resolveLocation(body, user.id)
  await cancelUnpaid(user.id)
  const sub = await prisma.subscription.create({
    data: {
      plan: body.plan,
      wasteType: body.wasteType,
      timeWindow: body.timeWindow ?? null,
      ...location,
      startDate: toDay(body.startDate),
      userId: user.id,
    },
  })
  if (!user.address) await prisma.user.update({ where: { id: user.id }, data: { address: location.address } })
  res.status(201).json({ subscription: subscription(sub) })
})

subscriptionsRouter.get("/subscriptions/:id/change-quote", async (req, res) => {
  const { plan } = z.object({ plan: z.enum(planIds, "Choose a plan.") }).parse(req.query)
  const sub = await findOwn(req.params.id, currentUser(req).id)
  res.json({ quote: await planChangeQuote(sub, plan) })
})

// Switch an active plan. Creates the new plan, priced after credit for unused days;
// it replaces the current one as soon as it's paid.
subscriptionsRouter.post("/subscriptions/:id/change", async (req, res) => {
  const { plan } = z.object({ plan: z.enum(planIds, "Choose a plan.") }).parse(req.body)
  const user = currentUser(req)
  const current = await findOwn(req.params.id, user.id)
  const quote = await planChangeQuote(current, plan)
  if (!quote.allowed) throw new HttpError(409, quote.message ?? "This plan change isn't available.")

  await cancelUnpaid(user.id)
  const next = await prisma.subscription.create({
    data: {
      userId: user.id,
      plan,
      address: current.address,
      landmark: current.landmark,
      lat: current.lat,
      lng: current.lng,
      areaId: current.areaId,
      wasteType: current.wasteType,
      timeWindow: current.timeWindow,
      startDate: today(),
      credit: quote.credit,
      replacesId: current.id,
      collectorId: current.collectorId,
      authorizationCode: current.authorizationCode,
      cardLabel: current.cardLabel,
      autoRenew: current.autoRenew,
    },
  })
  res.status(201).json({ subscription: subscription(next), quote })
})

subscriptionsRouter.patch("/subscriptions/:id", async (req, res) => {
  const body = z
    .object({ autoRenew: z.boolean().optional(), timeWindow })
    .refine((b) => b.autoRenew !== undefined || b.timeWindow !== undefined, "Nothing to update.")
    .parse(req.body)
  const sub = await findOwn(req.params.id, currentUser(req).id)
  if (sub.status !== "ACTIVE") throw new HttpError(409, "Only an active plan can be changed.")
  if (body.autoRenew && !sub.authorizationCode) {
    throw new HttpError(409, "Pay once by card to turn on automatic renewal.")
  }
  const updated = await prisma.$transaction(async (tx) => {
    // A new preferred time applies to the plan's upcoming pickups too.
    if (body.timeWindow !== undefined) {
      await tx.order.updateMany({
        where: { subscriptionId: sub.id, status: { in: ["PENDING", "ASSIGNED"] }, scheduledDate: { gte: today() }, onTheWayAt: null },
        data: { timeWindow: body.timeWindow },
      })
    }
    return tx.subscription.update({ where: { id: sub.id }, data: body })
  })
  res.json({ subscription: subscription(updated) })
})

// Abandon an unpaid sign-up or plan change.
subscriptionsRouter.post("/subscriptions/:id/cancel", async (req, res) => {
  const sub = await findOwn(req.params.id, currentUser(req).id)
  const updated = await prisma.subscription.updateMany({
    where: { id: sub.id, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED", replacesId: null },
  })
  if (updated.count === 0) {
    const ends = sub.currentPeriodEnd ? daysBetween(today(), sub.currentPeriodEnd) : 0
    throw new HttpError(409, `Paid plans run to the end of their period${ends > 0 ? ` (${ends} days left)` : ""}. Turn off automatic renewal to stop it renewing.`)
  }
  res.json({ ok: true })
})
