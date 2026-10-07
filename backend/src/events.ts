// What each event tells whom. All notification wording lives here.
import { planLabel } from "./catalog.ts"
import type { Order, Subscription } from "./generated/prisma/client.ts"
import { findPlan } from "./catalog.ts"
import { notify, notifyCollector, notifyStaff } from "./notify.ts"

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`

const day = (date: Date) =>
  date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

/** "Pickup (3 bags)", "Medium bags × 2", "Plan pickup". */
function what(order: Order) {
  if (order.type === "INSTANT_PICKUP") return `Pickup (${order.quantity} bag${order.quantity === 1 ? "" : "s"})`
  if (order.type === "WASTE_BAGS") return `${planLabel(order.plan)} bags × ${order.quantity}`
  return "Plan pickup"
}

const when = (order: Order) => (order.asap ? `ASAP, ${day(order.scheduledDate)}` : day(order.scheduledDate))
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

  async cancelledByStaff(order: Order) {
    await notify(order.userId, { title: "Order cancelled", body: `${order.reference} has been cancelled.`, url: customerUrl(order) })
    await notifyCollector(order.collectorId, {
      title: "Job cancelled",
      body: `${order.reference} at ${order.address} has been cancelled.`,
    })
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

  async collectorApproved(userId: string) {
    await notify(userId, {
      title: "You're approved",
      body: "Welcome to WasteCore! Your jobs will appear in the app.",
      url: "/collector",
    })
  },
}
