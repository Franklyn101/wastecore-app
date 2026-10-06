import { planLabel } from "./catalog.ts"
import type { Collector, Order, SupportTicket } from "./generated/prisma/client.ts"

const dateOnly = (date: Date) => date.toISOString().slice(0, 10)

/** An order as the customer sees it. Collector details are admin-only. */
export function customerOrder(order: Order) {
  return {
    id: order.id,
    reference: order.reference,
    type: order.type,
    plan: order.plan,
    planLabel: planLabel(order.plan),
    address: order.address,
    wasteType: order.wasteType,
    scheduledDate: dateOnly(order.scheduledDate),
    quantity: order.quantity,
    amount: order.amount,
    status: order.status,
    receiptUrl: order.receiptUrl,
    customerNote: order.customerNote,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }
}

export function adminOrder(
  order: Order & { collector: Collector | null; user: { id: string; name: string; phone: string } },
) {
  return {
    ...customerOrder(order),
    adminNote: order.adminNote,
    customer: order.user,
    collector: order.collector,
  }
}

export function ticket(t: SupportTicket) {
  return {
    id: t.id,
    reference: t.reference,
    category: t.category,
    message: t.message,
    contactTime: t.contactTime,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}
