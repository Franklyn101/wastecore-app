import { randomInt } from "node:crypto"
import { findPlan } from "./catalog.ts"
import { config } from "./config.ts"
import { addPeriod, addDays, daysBetween, maxDay, pickupDates, today } from "./dates.ts"
import { prisma } from "./db.ts"
import type { Payment, Prisma, Subscription } from "./generated/prisma/client.ts"
import { HttpError } from "./http.ts"
import { cardLabel, chargeAuthorization, type PaystackTransaction } from "./paystack.ts"
import { events } from "./events.ts"
import { newReference } from "./references.ts"

type Tx = Prisma.TransactionClient

/** Renewal can be paid this many days before the current period ends. */
export const RENEW_WINDOW_DAYS = 7

/** Customers whose plan won't renew automatically are reminded this many days before it ends. */
const REMINDER_DAYS = 3

export function paymentReference(): string {
  return `WCP-${Date.now().toString(36).toUpperCase()}-${randomInt(36 ** 4).toString(36).toUpperCase().padStart(4, "0")}`
}

/** Creates the pickups for one billing period, assigned to the plan's collector if it has one. */
async function createPlanPickups(tx: Tx, sub: Subscription, start: Date, end: Date) {
  const plan = findPlan(sub.plan)
  const dates = pickupDates(start, end, plan.pickupsPerWeek)
  const now = new Date()

  // Pick references not already in use. (A failed insert would abort the whole transaction.)
  const refs = new Set<string>()
  while (refs.size < dates.length) refs.add(newReference("WC"))
  const taken = await tx.order.findMany({ where: { reference: { in: [...refs] } }, select: { reference: true } })
  for (const { reference } of taken) refs.delete(reference)
  while (refs.size < dates.length) refs.add(newReference("WC"))

  const references = [...refs]
  await tx.order.createMany({
    data: dates.map((scheduledDate, i) => ({
      reference: references[i],
      userId: sub.userId,
      type: "PLAN_PICKUP" as const,
      plan: sub.plan,
      address: sub.address,
      wasteType: sub.wasteType,
      scheduledDate,
      amount: 0,
      status: sub.collectorId ? ("ASSIGNED" as const) : ("PENDING" as const),
      paymentMethod: "PAYSTACK" as const,
      paidAt: now,
      subscriptionId: sub.id,
      collectorId: sub.collectorId,
    })),
  })
}

/** Card details to keep from a successful card payment, so the plan can renew automatically. */
function savedCard(data: PaystackTransaction): Prisma.SubscriptionUpdateInput {
  const auth = data.authorization
  if (data.channel !== "card" || !auth?.reusable || !auth.authorization_code) return {}
  return { authorizationCode: auth.authorization_code, cardLabel: cardLabel(auth) }
}

async function activateSubscription(tx: Tx, sub: Subscription, data: PaystackTransaction): Promise<boolean> {
  if (sub.status !== "PENDING_PAYMENT") {
    // e.g. paid from an old checkout tab after starting a different plan. Staff must refund.
    console.warn(`Payment for subscription ${sub.id} arrived while it was ${sub.status}; refund needed.`)
    return false
  }
  const plan = findPlan(sub.plan)
  const start = maxDay(sub.startDate, today())
  const end = addPeriod(start, plan.period)
  const card = savedCard(data)

  if (sub.replacesId) {
    // The new plan takes over from today: close the old one and drop its remaining pickups.
    await tx.subscription.update({ where: { id: sub.replacesId }, data: { status: "REPLACED", autoRenew: false } })
    await tx.order.updateMany({
      where: { subscriptionId: sub.replacesId, status: { in: ["PENDING", "ASSIGNED"] }, scheduledDate: { gte: start } },
      data: { status: "CANCELLED", customerNote: "Replaced by your new plan." },
    })
  }

  const active = await tx.subscription.update({
    where: { id: sub.id },
    data: {
      status: "ACTIVE",
      currentPeriodStart: start,
      currentPeriodEnd: end,
      ...card,
      // Renew automatically when paid by a reusable card; the customer can turn it off.
      autoRenew: "authorizationCode" in card ? true : sub.autoRenew,
    },
  })
  await createPlanPickups(tx, active, start, end)
  return true
}

async function renewSubscription(tx: Tx, sub: Subscription, data: PaystackTransaction): Promise<boolean> {
  if (sub.status !== "ACTIVE" && sub.status !== "EXPIRED") {
    console.warn(`Renewal payment for subscription ${sub.id} arrived while it was ${sub.status}; refund needed.`)
    return false
  }
  const plan = findPlan(sub.plan)
  // Renewing early continues from the current end; renewing after expiry starts today.
  const start = sub.status === "ACTIVE" && sub.currentPeriodEnd ? maxDay(sub.currentPeriodEnd, today()) : today()
  const end = addPeriod(start, plan.period)
  const renewed = await tx.subscription.update({
    where: { id: sub.id },
    data: { status: "ACTIVE", currentPeriodStart: start, currentPeriodEnd: end, ...savedCard(data) },
  })
  await createPlanPickups(tx, renewed, start, end)
  return true
}

/**
 * Applies a successful Paystack transaction to whatever it paid for. Safe to call
 * more than once for the same payment (webhook, callback and app polling all race):
 * only the first call that flips the payment to SUCCESS does any work.
 */
export async function recordPaystackResult(payment: Payment, data: PaystackTransaction) {
  if (data.status === "failed") {
    await prisma.payment.updateMany({ where: { id: payment.id, status: "INITIALIZED" }, data: { status: "FAILED" } })
    return
  }
  if (data.status !== "success") return // abandoned, ongoing, pending: the customer can still finish

  if (data.amount !== payment.amount * 100 || data.currency !== "NGN") {
    console.error(`Payment ${payment.reference}: expected ₦${payment.amount} NGN, Paystack reported ${data.amount} kobo ${data.currency}.`)
    await prisma.payment.updateMany({ where: { id: payment.id, status: "INITIALIZED" }, data: { status: "FAILED" } })
    return
  }

  const applied = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: "SUCCESS" } },
      data: { status: "SUCCESS", channel: data.channel, paidAt: data.paid_at ? new Date(data.paid_at) : new Date() },
    })
    if (claimed.count === 0) return null // already applied

    if (payment.purpose === "ORDER" && payment.orderId) {
      const paid = await tx.order.updateMany({
        where: { id: payment.orderId, status: { in: ["AWAITING_PAYMENT", "CANCELLED"] } },
        data: { status: "PENDING", paymentMethod: "PAYSTACK", paidAt: new Date(), customerNote: null },
      })
      return paid.count ? "order" : null
    }
    const sub = payment.subscriptionId ? await tx.subscription.findUnique({ where: { id: payment.subscriptionId } }) : null
    if (!sub) return null
    if (payment.purpose === "SUBSCRIPTION_START") return (await activateSubscription(tx, sub, data)) ? "activated" : null
    return (await renewSubscription(tx, sub, data)) ? "renewed" : null
  })

  // Tell people once the payment is safely recorded.
  if (applied === "order") {
    await events.orderPaidOnline(await prisma.order.findUniqueOrThrow({ where: { id: payment.orderId! } }))
  } else if (applied) {
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: payment.subscriptionId! } })
    await (applied === "activated" ? events.planActivated(sub) : events.planRenewed(sub))
  }
}

/** What switching an active plan to `planId` would cost today, after credit for unused days. */
export async function planChangeQuote(sub: Subscription, planId: string) {
  const newPlan = findPlan(planId)
  if (sub.status !== "ACTIVE" || !sub.currentPeriodStart || !sub.currentPeriodEnd) {
    throw new HttpError(409, "Only an active plan can be changed.")
  }
  if (planId === sub.plan) throw new HttpError(400, "You're already on this plan.")

  const lastPayment = await prisma.payment.findFirst({
    where: { subscriptionId: sub.id, status: "SUCCESS" },
    orderBy: { paidAt: "desc" },
  })
  // What the current period was worth: the last payment plus any credit applied to it.
  const periodValue = (lastPayment?.amount ?? 0) + (lastPayment?.purpose === "SUBSCRIPTION_START" ? sub.credit : 0)
  const periodDays = daysBetween(sub.currentPeriodStart, sub.currentPeriodEnd)
  const unusedDays = Math.max(0, Math.min(periodDays, daysBetween(maxDay(today(), sub.currentPeriodStart), sub.currentPeriodEnd)))
  const credit = periodDays > 0 ? Math.floor((periodValue * unusedDays) / periodDays) : 0
  const amountDue = newPlan.price - credit

  return {
    plan: newPlan.id,
    credit,
    amountDue: Math.max(0, amountDue),
    // Switching to a cheaper plan mid-period would waste the credit, so it waits for renewal.
    allowed: amountDue > 0,
    message:
      amountDue > 0
        ? null
        : `Your current plan is worth more than ${newPlan.name} for the rest of this period. You can switch when it ends.`,
  }
}

/** The amount due for a payment toward a subscription, and which kind of payment it is. */
export function subscriptionCharge(sub: Subscription): { purpose: "SUBSCRIPTION_START" | "SUBSCRIPTION_RENEWAL"; amount: number } {
  const plan = findPlan(sub.plan)
  if (sub.status === "PENDING_PAYMENT") return { purpose: "SUBSCRIPTION_START", amount: Math.max(0, plan.price - sub.credit) }
  if (sub.status === "EXPIRED") return { purpose: "SUBSCRIPTION_RENEWAL", amount: plan.price }
  if (sub.status === "ACTIVE" && sub.currentPeriodEnd) {
    if (daysBetween(today(), sub.currentPeriodEnd) > RENEW_WINDOW_DAYS) {
      throw new HttpError(409, `You can renew from ${RENEW_WINDOW_DAYS} days before your plan ends.`)
    }
    return { purpose: "SUBSCRIPTION_RENEWAL", amount: plan.price }
  }
  throw new HttpError(409, "This plan can't be paid for.")
}

/**
 * Renews plans whose card should be charged now, then expires plans that ran out.
 * Runs hourly from the server (and can be run as a one-off with `npm run jobs`).
 */
export async function runBillingJobs() {
  const day = today()

  // 1. Charge saved cards one day before the period ends, at most once per period.
  const due = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      autoRenew: true,
      authorizationCode: { not: null },
      currentPeriodEnd: { lte: addDays(day, 1) },
    },
    include: { user: true },
  })
  for (const sub of due) {
    if (!sub.currentPeriodEnd || !sub.user.email) continue
    if (sub.lastRenewalAttempt && sub.lastRenewalAttempt.getTime() === sub.currentPeriodEnd.getTime()) continue
    const claimed = await prisma.subscription.updateMany({
      where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd, status: "ACTIVE" },
      data: { lastRenewalAttempt: sub.currentPeriodEnd },
    })
    if (claimed.count === 0) continue

    const amount = findPlan(sub.plan).price
    const payment = await prisma.payment.create({
      data: { reference: paymentReference(), userId: sub.userId, purpose: "SUBSCRIPTION_RENEWAL", subscriptionId: sub.id, amount },
    })
    try {
      const result = await chargeAuthorization({
        authorizationCode: sub.authorizationCode!,
        email: sub.user.email,
        amountKobo: amount * 100,
        reference: payment.reference,
        metadata: { paymentId: payment.id, purpose: payment.purpose },
      })
      await recordPaystackResult(payment, result)
      if (result.status === "failed") await events.renewalFailed(sub)
    } catch (err) {
      console.error(`Automatic renewal failed for subscription ${sub.id}:`, err)
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } })
      await events.renewalFailed(sub)
    }
  }

  // 2. Remind customers whose plan won't renew that it ends within 3 days, once per period.
  const ending = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      currentPeriodEnd: { gt: day, lte: addDays(day, REMINDER_DAYS) },
      OR: [{ autoRenew: false }, { authorizationCode: null }],
    },
  })
  for (const sub of ending) {
    if (sub.reminderSentFor?.getTime() === sub.currentPeriodEnd!.getTime()) continue
    const claimed = await prisma.subscription.updateMany({
      where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd },
      data: { reminderSentFor: sub.currentPeriodEnd },
    })
    if (claimed.count) await events.planEndingSoon(sub)
  }

  // 3. Expire plans whose period has ended without a renewal.
  const expiring = await prisma.subscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lte: day } },
    select: { id: true, userId: true, plan: true },
  })
  for (const sub of expiring) {
    const expired = await prisma.subscription.updateMany({
      where: { id: sub.id, status: "ACTIVE", currentPeriodEnd: { lte: day } },
      data: { status: "EXPIRED" },
    })
    if (expired.count) await events.planExpired(sub.userId, sub.plan)
  }
}

export function startBillingJobs() {
  if (!config.runJobs) return
  const run = () => runBillingJobs().catch((err) => console.error("Billing jobs failed:", err))
  void run()
  setInterval(run, 60 * 60 * 1000).unref()
}
