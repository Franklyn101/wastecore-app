import { findPlan, planLabel } from "./catalog.ts"
import type { Collector, Order, Subscription, SupportTicket } from "./generated/prisma/client.ts"

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
    asap: order.asap,
    quantity: order.quantity,
    amount: order.amount,
    status: order.status,
    paymentMethod: order.paymentMethod,
    receiptUrl: order.receiptUrl,
    customerNote: order.customerNote,
    subscriptionId: order.subscriptionId,
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

/** A subscription as the customer sees it. The saved card's token never leaves the server. */
export function subscription(s: Subscription) {
  const plan = findPlan(s.plan)
  return {
    id: s.id,
    plan: s.plan,
    planName: plan.name,
    planGroup: plan.group,
    pickupsPerWeek: plan.pickupsPerWeek,
    price: plan.price,
    periodLabel: plan.periodLabel,
    status: s.status,
    address: s.address,
    wasteType: s.wasteType,
    startDate: dateOnly(s.startDate),
    currentPeriodStart: s.currentPeriodStart ? dateOnly(s.currentPeriodStart) : null,
    currentPeriodEnd: s.currentPeriodEnd ? dateOnly(s.currentPeriodEnd) : null,
    autoRenew: s.autoRenew,
    hasSavedCard: Boolean(s.authorizationCode),
    cardLabel: s.cardLabel,
    credit: s.credit,
    replacesId: s.replacesId,
    createdAt: s.createdAt,
  }
}

export function adminSubscription(
  s: Subscription & { collector: Collector | null; user: { id: string; name: string; phone: string } },
) {
  return { ...subscription(s), customer: s.user, collector: s.collector }
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
