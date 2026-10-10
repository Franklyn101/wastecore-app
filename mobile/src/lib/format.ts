import type { Collector, DisposalKind, Order, OrderStatus, OrderType, QuoteStatus, SubscriptionStatus, TicketStatus, TimeWindow } from "./types"

export function naira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`
}

/** "2026-10-07" -> "Wed, 7 Oct 2026" without timezone shifts. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** The next `count` days starting today, as YYYY-MM-DD in Lagos time. */
export function upcomingDates(count: number): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" })
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number)
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10))
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  INSTANT_PICKUP: "Instant pickup",
  PLAN_PICKUP: "Plan pickup",
  WASTE_BAGS: "Waste bags",
  SPECIAL_PICKUP: "Special pickup",
}

/** e.g. "Scheduled pickup" for a one-off pickup booked for a chosen date. */
export function orderTitle(order: { type: OrderType; plan: string }): string {
  return order.type === "INSTANT_PICKUP" && order.plan === "scheduled" ? "Scheduled pickup" : ORDER_TYPE_LABELS[order.type]
}

type Tone = "warning" | "info" | "success" | "danger" | "muted"

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  AWAITING_PAYMENT: { label: "Awaiting payment", tone: "warning" },
  PENDING: { label: "Confirming payment", tone: "info" },
  ASSIGNED: { label: "Collector assigned", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  INCOMPLETE: { label: "Incomplete", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
}

/** Status for display. An order paid online is already confirmed, so it reads differently. */
export function orderStatus(order: Pick<Order, "status" | "paymentMethod" | "type"> & { onTheWayAt?: string | null }): { label: string; tone: Tone } {
  if (order.status === "PENDING" && order.type === "PLAN_PICKUP") return { label: "Scheduled", tone: "info" }
  if (order.status === "PENDING" && order.paymentMethod === "PAYSTACK") return { label: "Paid · scheduling", tone: "info" }
  if (order.status === "ASSIGNED" && order.onTheWayAt) return { label: "On the way", tone: "success" }
  return ORDER_STATUS[order.status]
}

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; tone: Tone }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  EXPIRED: { label: "Expired", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
  REPLACED: { label: "Replaced", tone: "muted" },
}

/** Whole days from today (Lagos) until an ISO date. */
export function daysUntil(isoDate: string): number {
  const [today] = upcomingDates(1)
  return Math.round((Date.parse(isoDate.slice(0, 10)) - Date.parse(today)) / 86_400_000)
}

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: "warning" | "info" | "success" }> = {
  OPEN: { label: "Open", tone: "warning" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  RESOLVED: { label: "Resolved", tone: "success" },
}

export function isActive(status: OrderStatus): boolean {
  return status === "AWAITING_PAYMENT" || status === "PENDING" || status === "ASSIGNED"
}

/** The current hour (0-23) in Lagos. */
export function hourInLagos(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hourCycle: "h23" }).format(new Date()))
}

/** "5pm" for 17. */
export function hourLabel(hour: number): string {
  return `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`
}

/** What an order is, in a few words: "3 bags", "Medium bags × 2", "2 pickups/week". */
export function orderSummary(order: Pick<Order, "type" | "planLabel" | "quantity">): string {
  if (order.type === "INSTANT_PICKUP") return `${order.quantity} bag${order.quantity === 1 ? "" : "s"}`
  if (order.type === "WASTE_BAGS") return `${order.planLabel} bags × ${order.quantity}`
  if (order.type === "SPECIAL_PICKUP") return "Quoted pickup"
  return order.planLabel
}

export const TIME_WINDOW_LABELS: Record<TimeWindow, string> = { MORNING: "Morning (8am–12pm)", AFTERNOON: "Afternoon (12–5pm)" }

/** "As soon as possible · Today", "Wed, 7 Oct 2026 · Morning (8am–12pm)" or "Wed, 7 Oct 2026". */
export function pickupWhen(order: Pick<Order, "asap" | "scheduledDate"> & { timeWindow?: TimeWindow | null }): string {
  if (!order.asap) {
    const date = formatDate(order.scheduledDate)
    return order.timeWindow ? `${date} · ${TIME_WINDOW_LABELS[order.timeWindow]}` : date
  }
  const days = daysUntil(order.scheduledDate)
  return `As soon as possible · ${days <= 0 ? "Today" : days === 1 ? "Tomorrow" : formatDate(order.scheduledDate)}`
}

/** Collectors that can be given jobs: active, and approved if they signed up themselves. */
export const assignable = (c: Collector) => c.active && !c.pending

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: Tone }> = {
  NEW: { label: "Waiting for a price", tone: "warning" },
  QUOTED: { label: "Price ready", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  DECLINED: { label: "Declined", tone: "muted" },
  CANCELLED: { label: "Closed", tone: "muted" },
}

export const DISPOSAL_KIND_LABELS: Record<DisposalKind, string> = {
  LANDFILL: "Dump site",
  RECYCLER: "Recycler",
  COMPOST: "Compost",
  OTHER: "Other",
}
