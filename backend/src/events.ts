// What each event tells whom. All notification wording lives here.
import { planLabel } from "./catalog.ts"
import type { Order, QuoteRequest, ServiceArea, Subscription } from "./generated/prisma/client.ts"
import { findPlan } from "./catalog.ts"
import { prisma } from "./db.ts"
import { notify, notifyCollector, notifyStaff } from "./notify.ts"

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`

const day = (date: Date) =>
  date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

/** "Pickup (3 bags)", "Medium bags × 2", "Plan pickup". */
function what(order: Order) {
  if (order.type === "INSTANT_PICKUP") return `Pickup (${order.quantity} bag${order.quantity === 1 ? "" : "s"})`
  if (order.type === "WASTE_BAGS") return `${planLabel(order.plan)} bags × ${order.quantity}`
  if (order.type === "SPECIAL_PICKUP") return `Special pickup (${order.wasteType})`
  return "Plan pickup"
}

const WINDOW = { MORNING: "morning", AFTERNOON: "afternoon" } as const
const when = (order: Order) =>
  order.asap
    ? `ASAP, ${day(order.scheduledDate)}`
    : order.timeWindow
      ? `${day(order.scheduledDate)}, ${WINDOW[order.timeWindow]}`
      : day(order.scheduledDate)
const customerUrl = (order: Order) => `/orders/${order.id}`
const staffUrl = (order: Order) => `/admin/orders/${order.id}`
const jobUrl = (order: Order) => `/collector/jobs/${order.id}`

export const events = {
  // ── Payments ─────────────────────────────────────────────
  async orderPaidOnline(order: Order) {
    await notify(order.userId, {
      title: "Payment received",
      body: `We've received ${naira(order.amount)} for ${order.reference}. We'll assign a collector shortly.`,
      url: customerUrl(order),
    })
    await notifyStaff({ title: "New paid order", body: `${order.reference} · ${what(order)} · ${when(order)}`, url: staffUrl(order) })
  },

  async receiptUploaded(order: Order) {
    await notifyStaff({
      title: "Receipt to check",
      body: `${order.reference}: ${naira(order.amount)} by bank transfer · ${what(order)}`,
      url: staffUrl(order),
    })
  },

  async receiptRejected(order: Order, reason: string) {
    await notify(order.userId, { title: "Receipt not accepted", body: `${order.reference}: ${reason}`, url: customerUrl(order) })
  },

  async paymentConfirmed(order: Order) {
    await notify(order.userId, {
      title: "Payment confirmed",
      body: `Your payment for ${order.reference} is confirmed.`,
      url: customerUrl(order),
    })
  },

  // ── Collectors and jobs ──────────────────────────────────
  /** `paymentConfirmed`: staff checked a bank-transfer receipt and assigned in one step. */
  async collectorAssigned(order: Order, paymentConfirmed = false) {
    // Plan pickups are scheduled in bulk; customers hear about them on the day instead.
    if (order.type !== "PLAN_PICKUP") {
      await notify(order.userId, {
        title: paymentConfirmed ? "Payment confirmed" : order.type === "WASTE_BAGS" ? "Delivery scheduled" : "Collector assigned",
        body: `${order.reference} is scheduled for ${when(order)}.`,
        url: customerUrl(order),
      })
    }
    await notifyCollector(order.collectorId, {
      title: order.asap ? "New ASAP job" : "New job",
      body: `${what(order)} · ${when(order)} · ${order.address}`,
      url: jobUrl(order),
    })
  },

  async jobTakenAway(order: Order, previousCollectorId: string | null) {
    await notifyCollector(previousCollectorId, {
      title: "Job reassigned",
      body: `${order.reference} at ${order.address} has been given to another collector.`,
    })
  },

  async onTheWay(order: Order) {
    await notify(order.userId, {
      title: order.type === "WASTE_BAGS" ? "Your bags are on the way" : "Your collector is on the way",
      body: `${order.reference} · ${order.address}`,
      url: customerUrl(order),
    })
  },

  async completed(order: Order) {
    await notify(order.userId, {
      title: order.type === "WASTE_BAGS" ? "Bags delivered" : "Pickup completed",
      body: `${order.reference} is done. Thank you for keeping your environment clean!`,
      url: customerUrl(order),
    })
  },

  /** `byCollector`: the collector closed it (so staff need to know); otherwise staff did. */
  async notCompleted(order: Order, reason: string, byCollector: boolean) {
    await notify(order.userId, {
      title: order.type === "WASTE_BAGS" ? "Delivery not completed" : "Pickup not completed",
      body: `${order.reference}: ${reason}. Contact support if you need help.`,
      url: customerUrl(order),
    })
    if (byCollector) await notifyStaff({ title: "Job not completed", body: `${order.reference}: ${reason}`, url: staffUrl(order) })
  },

  async wastedTrip(order: Order, reason: string) {
    await notify(order.userId, {
      title: "Wasted trip",
      body: `Your collector came for ${order.reference}: ${reason}. A wasted-trip fee of ${naira(order.extraAmount)} applies; you can pay it in the app.`,
      url: customerUrl(order),
    })
    await notifyStaff({ title: "Wasted trip", body: `${order.reference}: ${reason}`, url: staffUrl(order) })
  },

  async extraBagsDue(order: Order) {
    await notify(order.userId, {
      title: "Extra bags collected",
      body: `Your collector took ${order.bagsCollected} bags for ${order.reference} (you booked ${order.quantity}). Please pay ${naira(order.extraAmount)} for the extra bags.`,
      url: customerUrl(order),
    })
  },

  async payoutRecorded(collectorId: string, amount: number, jobs: number) {
    await notifyCollector(collectorId, {
      title: "You've been paid",
      body: `${naira(amount)} for ${jobs} job${jobs === 1 ? "" : "s"}.`,
      url: "/collector/earnings",
    })
  },

  async cancelledByStaff(order: Order) {
    await notify(order.userId, { title: "Order cancelled", body: `${order.reference} has been cancelled.`, url: customerUrl(order) })
    await notifyCollector(order.collectorId, {
      title: "Job cancelled",
      body: `${order.reference} at ${order.address} has been cancelled.`,
    })
  },

  // ── Customer changes ─────────────────────────────────────
  async rescheduled(order: Order) {
    await notifyCollector(order.collectorId, {
      title: "Pickup moved",
      body: `${order.reference} at ${order.address} is now ${when(order)}.`,
      url: jobUrl(order),
    })
    if (order.type === "INSTANT_PICKUP" && order.status !== "AWAITING_PAYMENT") {
      await notifyStaff({ title: "Pickup rescheduled", body: `${order.reference} moved to ${when(order)}`, url: staffUrl(order) })
    }
  },

  async skipped(order: Order) {
    await notifyCollector(order.collectorId, {
      title: "Pickup skipped",
      body: `The customer at ${order.address} skipped ${day(order.scheduledDate)}'s pickup.`,
    })
  },

  async rated(order: Order) {
    // Staff follow up on poor ratings.
    if (order.rating !== null && order.rating <= 2) {
      await notifyStaff({
        title: `${order.rating}-star rating`,
        body: `${order.reference}${order.ratingComment ? `: "${order.ratingComment}"` : ""}`,
        url: staffUrl(order),
      })
    }
  },

  async planCollectorSet(sub: Subscription, customerName: string) {
    await notifyCollector(sub.collectorId, {
      title: "New regular customer",
      body: `You're now the regular collector for ${customerName} (${findPlan(sub.plan).name}) at ${sub.address}.`,
      url: "/collector",
    })
  },

  // ── Plans ────────────────────────────────────────────────
  async planActivated(sub: Subscription) {
    await notify(sub.userId, {
      title: "Your plan is active",
      body: `${findPlan(sub.plan).name}: your pickups are scheduled until ${day(sub.currentPeriodEnd!)}.`,
      url: "/plan",
    })
  },

  async planRenewed(sub: Subscription) {
    await notify(sub.userId, {
      title: "Plan renewed",
      body: `${findPlan(sub.plan).name} renewed until ${day(sub.currentPeriodEnd!)}. Your next pickups are scheduled.`,
      url: "/plan",
    })
  },

  async renewalFailed(sub: Subscription) {
    await notify(sub.userId, {
      title: "We couldn't renew your plan",
      body: `Your card was declined. Renew by ${day(sub.currentPeriodEnd!)} to keep your pickups.`,
      url: "/plan",
    })
  },

  async planEndingSoon(sub: Subscription) {
    await notify(sub.userId, {
      title: "Your plan ends soon",
      body: `${findPlan(sub.plan).name} ends on ${day(sub.currentPeriodEnd!)}. Renew to keep your pickups.`,
      url: "/plan",
    })
  },

  async planExpired(userId: string, plan: string) {
    await notify(userId, {
      title: "Your plan has ended",
      body: `${findPlan(plan).name} has ended. Restart it any time from My plan.`,
      url: "/plan",
    })
  },

  // ── Support and staff ────────────────────────────────────
  async ticketCreated(reference: string, category: string, customerName: string) {
    await notifyStaff({ title: "New support ticket", body: `${reference} · ${category} · ${customerName}`, url: "/admin/tickets" })
  },

  async ticketUpdated(userId: string, reference: string, status: "OPEN" | "IN_PROGRESS" | "RESOLVED") {
    const text = { OPEN: "has been reopened", IN_PROGRESS: "is being looked at", RESOLVED: "has been resolved" }[status]
    await notify(userId, { title: "Support ticket update", body: `Your ticket ${reference} ${text}.`, url: "/support" })
  },

  async collectorApplied(name: string, area: string) {
    await notifyStaff({ title: "New collector application", body: `${name} (${area}) applied in the app.`, url: "/admin/collectors" })
  },

  // ── Special waste quotes ────────────────────────────────
  async quoteRequested(quote: QuoteRequest, customerName: string) {
    await notifyStaff({ title: "Quote request", body: `${quote.reference} · ${quote.category} · ${customerName}`, url: `/admin/quotes/${quote.id}` })
  },

  async quoteSent(quote: QuoteRequest) {
    await notify(quote.userId, {
      title: "Your quote is ready",
      body: `${quote.reference}: ${naira(quote.amount!)} for your ${quote.category.toLowerCase()} pickup. Tap to accept.`,
      url: `/quotes/${quote.id}`,
    })
  },

  async quoteCancelled(quote: QuoteRequest) {
    await notify(quote.userId, {
      title: "About your quote request",
      body: `${quote.reference}: ${quote.staffNote ?? "We can't take this one on. Please contact support."}`,
      url: `/quotes/${quote.id}`,
    })
  },

  async quoteAnswered(quote: QuoteRequest, accepted: boolean) {
    await notifyStaff({
      title: accepted ? "Quote accepted" : "Quote declined",
      body: `${quote.reference} · ${quote.category} · ${naira(quote.amount ?? 0)}`,
      url: `/admin/quotes/${quote.id}`,
    })
  },

  // ── Stock, refunds and accounts ─────────────────────────
  async lowStock(name: string, packs: number) {
    await notifyStaff({ title: "Bag stock running low", body: `${name} bags: ${packs} pack${packs === 1 ? "" : "s"} left.`, url: "/admin/stock" })
  },

  async refunded(order: Order, amount: number, method: "PAYSTACK" | "MANUAL") {
    await notify(order.userId, {
      title: "Refund on its way",
      body:
        method === "PAYSTACK"
          ? `We've refunded ${naira(amount)} for ${order.reference}. It can take a few working days to reach your card or account.`
          : `We've refunded ${naira(amount)} for ${order.reference} to your bank account.`,
      url: customerUrl(order),
    })
  },

  // ── Areas ────────────────────────────────────────────────
  /** Everyone who tapped "Notify me" for this area hears that it's open. */
  async areaLaunched(area: ServiceArea) {
    const waiting = await prisma.areaInterest.findMany({ where: { areaId: area.id }, select: { userId: true }, distinct: ["userId"] })
    for (const { userId } of waiting) {
      await notify(userId, {
        title: `WasteCore is now in ${area.name}`,
        body: "You can book pickups and plans at your address now.",
        url: "/",
      })
    }
  },

  async collectorApproved(userId: string) {
    await notify(userId, {
      title: "You're approved",
      body: "Welcome to WasteCore! Your jobs will appear in the app.",
      url: "/collector",
    })
  },
}
