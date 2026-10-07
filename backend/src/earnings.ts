import { COLLECTOR_PAY, INSTANT_PICKUP } from "./catalog.ts"
import { addDays, startOfLagosDay, today } from "./dates.ts"
import { prisma } from "./db.ts"
import type { Order } from "./generated/prisma/client.ts"

/** What a collector earns for a completed job. */
export function payFor(order: Pick<Order, "type" | "quantity">, bagsCollected: number | null): number {
  if (order.type === "WASTE_BAGS") return COLLECTOR_PAY.bagDelivery
  if (order.type === "SPECIAL_PICKUP") return COLLECTOR_PAY.specialPickup
  return COLLECTOR_PAY.pickup + COLLECTOR_PAY.perBag * (bagsCollected ?? order.quantity)
}

/** Naira owed for bags collected beyond what an instant pickup was booked and paid for. */
export function extraBagsCharge(order: Pick<Order, "type" | "quantity">, bagsCollected: number | null): number {
  if (order.type !== "INSTANT_PICKUP" || bagsCollected === null) return 0
  return Math.max(0, bagsCollected - order.quantity) * INSTANT_PICKUP.pricePerBag
}

/**
 * A collector's pay since their last payout. Cash they took from customers for extra bags
 * is WasteCore's money, so it's taken off what they're owed.
 */
export async function earningsSummary(collectorId: string) {
  const unpaidWhere = { collectorId, status: "COMPLETED" as const, collectorPay: { not: null }, payoutId: null }
  const [unpaid, cash, week, payouts] = await Promise.all([
    prisma.order.aggregate({ where: unpaidWhere, _sum: { collectorPay: true }, _count: { _all: true } }),
    prisma.order.aggregate({ where: { ...unpaidWhere, extraPaymentMethod: "CASH" }, _sum: { extraAmount: true } }),
    prisma.order.aggregate({
      where: { collectorId, status: "COMPLETED", completedAt: { gte: addDays(startOfLagosDay(today()), -6) } },
      _sum: { collectorPay: true },
      _count: { _all: true },
    }),
    prisma.collectorPayout.findMany({ where: { collectorId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ])
  const earned = unpaid._sum.collectorPay ?? 0
  const cashHeld = cash._sum.extraAmount ?? 0
  return {
    rates: COLLECTOR_PAY,
    unpaid: { jobs: unpaid._count._all, earned, cashHeld, due: earned - cashHeld },
    lastSevenDays: { jobs: week._count._all, earned: week._sum.collectorPay ?? 0 },
    payouts: payouts.map((p) => ({ id: p.id, amount: p.amount, jobs: p.jobs, note: p.note, createdAt: p.createdAt })),
  }
}
