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
    landmark: order.landmark,
    lat: order.lat,
    lng: order.lng,
    areaId: order.areaId,
    wasteType: order.wasteType,
    scheduledDate: dateOnly(order.scheduledDate),
    asap: order.asap,
    timeWindow: order.timeWindow,
    skippedAt: order.skippedAt,
    rating: order.rating,
    ratingComment: order.ratingComment,
    quantity: order.quantity,
    bagsCollected: order.bagsCollected,
    weightKg: order.weightKg,
    extraAmount: order.extraAmount,
    extraPaidAt: order.extraPaidAt,
    extraPaymentMethod: order.extraPaymentMethod,
    amount: order.amount,
    status: order.status,
    paymentMethod: order.paymentMethod,
    receiptUrl: order.receiptUrl,
    customerNote: order.customerNote,
    onTheWayAt: order.onTheWayAt,
    completedAt: order.completedAt,
    collectorNote: order.collectorNote,
    proofPhotoUrl: order.proofPhotoUrl,
    subscriptionId: order.subscriptionId,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }
}

export function adminCollector(c: Collector) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    area: c.area,
    serviceAreaId: c.serviceAreaId,
    active: c.active,
    onDuty: c.onDuty,
    // Signed up in the app and waiting for staff to approve them.
    pending: !c.approvedAt,
    hasLogin: Boolean(c.userId),
  }
}

export function adminOrder(
  order: Order & { collector: Collector | null; user: { id: string; name: string; phone: string } },
) {
  return {
    ...customerOrder(order),
    adminNote: order.adminNote,
    customer: order.user,
    collector: order.collector && adminCollector(order.collector),
  }
}

/**
 * A job as the collector sees it: what to collect or deliver, where, and who to call.
 * No prices or payment details; staff notes (e.g. a gate code) are included.
 */
export function collectorJob(order: Order & { user: { name: string; phone: string } }) {
  return {
    id: order.id,
    reference: order.reference,
    type: order.type,
    planLabel: planLabel(order.plan),
    address: order.address,
    landmark: order.landmark,
    lat: order.lat,
    lng: order.lng,
    wasteType: order.wasteType,
    scheduledDate: dateOnly(order.scheduledDate),
    asap: order.asap,
    timeWindow: order.timeWindow,
    quantity: order.quantity,
    status: order.status,
    notes: order.adminNote,
    customer: { name: order.user.name, phone: order.user.phone },
    onTheWayAt: order.onTheWayAt,
    completedAt: order.completedAt,
    collectorNote: order.collectorNote,
    proofPhotoUrl: order.proofPhotoUrl,
    rating: order.rating,
    ratingComment: order.ratingComment,
    bagsCollected: order.bagsCollected,
    weightKg: order.weightKg,
    extraAmount: order.extraAmount,
    extraPaid: Boolean(order.extraPaidAt),
    pay: order.collectorPay,
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
    landmark: s.landmark,
    lat: s.lat,
    lng: s.lng,
    wasteType: s.wasteType,
    timeWindow: s.timeWindow,
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
  return { ...subscription(s), customer: s.user, collector: s.collector && adminCollector(s.collector) }
}

export function ticket(t: SupportTicket) {
  return {
    id: t.id,
    reference: t.reference,
    category: t.category,
    message: t.message,
    contactTime: t.contactTime,
    orderId: t.orderId,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}
