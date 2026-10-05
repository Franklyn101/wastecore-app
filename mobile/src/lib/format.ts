import type { OrderStatus, OrderType, TicketStatus } from "./types"

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
  WEEKLY_PICKUP: "Weekly pickup",
  UPGRADE: "Plan upgrade",
  WASTE_BAGS: "Waste bags",
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: "warning" | "info" | "success" | "danger" | "muted" }> = {
  AWAITING_PAYMENT: { label: "Awaiting payment", tone: "warning" },
  PENDING: { label: "Confirming payment", tone: "info" },
  ASSIGNED: { label: "Collector assigned", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  INCOMPLETE: { label: "Incomplete", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
}

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: "warning" | "info" | "success" }> = {
  OPEN: { label: "Open", tone: "warning" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  RESOLVED: { label: "Resolved", tone: "success" },
}

export function isActive(status: OrderStatus): boolean {
  return status === "AWAITING_PAYMENT" || status === "PENDING" || status === "ASSIGNED"
}
