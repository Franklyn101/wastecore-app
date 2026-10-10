import { findPlan, SCHEDULED_PICKUP } from "./catalog.ts"
import { addDays, startOfLagosDay, today } from "./dates.ts"
import { prisma } from "./db.ts"
import type { Order } from "./generated/prisma/client.ts"
import { pickupPrice, pricing } from "./pricing.ts"

type PricedOrder = Pick<Order, "type" | "plan" | "quantity" | "wastecoreBags">

/** A one-off pickup booked "as soon as possible" (anything else is scheduled; plan pickups too). */
export const isInstant = (order: Pick<Order, "type" | "plan">) => order.type === "INSTANT_PICKUP" && order.plan !== SCHEDULED_PICKUP.id

/** What a collector earns for a completed job: a fixed amount for the trip plus an amount per bag. */
export function payFor(order: PricedOrder, bagsCollected: number | null, p = pricing()): number {
  const pay = p.collector
  if (order.type === "WASTE_BAGS") return pay.bagDelivery
  if (order.type === "SPECIAL_PICKUP") return pay.specialPickup
  const rates = isInstant(order) ? pay.instant : pay.scheduled
  return rates.perStop + rates.perBag * (bagsCollected ?? order.quantity) + pay.perBagHandedOut * order.wastecoreBags
}

/**
 * Naira owed for bags collected beyond what was booked: priced as if the customer had booked
 * them all (so the extras get the cheaper extra-bag price), or, on a plan, at the extra-bag price.
 */
export function extraBagsCharge(order: PricedOrder, bagsCollected: number | null, p = pricing()): number {
  if (bagsCollected === null) return 0
  if (order.type === "PLAN_PICKUP") {
    return Math.max(0, bagsCollected - findPlan(order.plan).bagsPerPickup) * p.scheduled.extraBag
  }
  if (order.type !== "INSTANT_PICKUP" || bagsCollected <= order.quantity) return 0
  const instant = isInstant(order)
  return Math.max(0, pickupPrice(bagsCollected, instant, p) - pickupPrice(order.quantity, instant, p))
}

/**
 * A collector's pay since their last payout. Cash they took from customers for extra bags
 * is WasteCore's money, so it's taken off what they're owed.
 */
export async function earningsSummary(collectorId: string) {
  // Wasted trips (closed as not completed) are paid too.
  const unpaidWhere = { collectorId, status: { in: ["COMPLETED" as const, "INCOMPLETE" as const] }, collectorPay: { not: null }, payoutId: null }
  const [unpaid, cash, week, payouts] = await Promise.all([
    prisma.order.aggregate({ where: unpaidWhere, _sum: { collectorPay: true }, _count: { _all: true } }),
    prisma.order.aggregate({ where: { ...unpaidWhere, extraPaymentMethod: "CASH" }, _sum: { extraAmount: true } }),
    prisma.order.aggregate({
      where: { collectorId, collectorPay: { not: null }, completedAt: { gte: addDays(startOfLagosDay(today()), -6) } },
      _sum: { collectorPay: true },
      _count: { _all: true },
    }),
    prisma.collectorPayout.findMany({ where: { collectorId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ])
  const earned = unpaid._sum.collectorPay ?? 0
  const cashHeld = cash._sum.extraAmount ?? 0
  return {
    rates: pricing().collector,
    unpaid: { jobs: unpaid._count._all, earned, cashHeld, due: earned - cashHeld },
    lastSevenDays: { jobs: week._count._all, earned: week._sum.collectorPay ?? 0 },
    payouts: payouts.map((p) => ({ id: p.id, amount: p.amount, jobs: p.jobs, note: p.note, createdAt: p.createdAt })),
  }
}
