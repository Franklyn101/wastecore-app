import { Router, type Response } from "express"
import { z } from "zod"
import { autoAssignDue } from "../assign.ts"
import { audit } from "../audit.ts"
import { currentUser, isOwner, requireAdmin, requireOwner, requireUser } from "../auth.ts"
import { bagSizeIds, findBagSize } from "../catalog.ts"
import { addDays, startOfLagosDay, toDay, today, ymd } from "../dates.ts"
import { prisma } from "../db.ts"
import { events } from "../events.ts"
import type { Prisma } from "../generated/prisma/client.ts"
import { HttpError } from "../http.ts"
import { createRefund } from "../paystack.ts"
import { customerOrder } from "../serializers.ts"
import { stockLevels } from "../stock.ts"

// Running the business: the day at a glance, customers, refunds, stock and reports. Staff only.
export const operationsRouter = Router()
operationsRouter.use("/admin", requireUser, requireAdmin)

/** Money in: online payments plus bank transfers staff confirmed, less refunds, since `from`. */
async function revenueSince(from: Date) {
  const [online, transfers, cash, refunds] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "SUCCESS", paidAt: { gte: from } }, _sum: { amount: true } }),
    prisma.order.aggregate({
      where: { paymentMethod: "TRANSFER", paidAt: { gte: from }, status: { notIn: ["AWAITING_PAYMENT", "CANCELLED"] } },
      _sum: { amount: true },
    }),
    prisma.order.aggregate({ where: { extraPaymentMethod: "CASH", extraPaidAt: { gte: from } }, _sum: { extraAmount: true } }),
    prisma.refund.aggregate({ where: { status: { not: "FAILED" }, createdAt: { gte: from } }, _sum: { amount: true } }),
  ])
  return (online._sum.amount ?? 0) + (transfers._sum.amount ?? 0) + (cash._sum.extraAmount ?? 0) - (refunds._sum.amount ?? 0)
}

operationsRouter.get("/admin/dashboard", async (req, res) => {
  const day = today()
  const dayStart = startOfLagosDay(day)
  const [due, done, notDone, unassigned, waitingPayment, revenueToday, revenue7, revenue30, plans, newCustomers, onDuty, tickets, ratings, areas] =
    await Promise.all([
      prisma.order.count({ where: { scheduledDate: { lte: day }, status: { in: ["PENDING", "ASSIGNED"] } } }),
      prisma.order.count({ where: { status: "COMPLETED", completedAt: { gte: dayStart } } }),
      prisma.order.count({ where: { status: "INCOMPLETE", completedAt: { gte: dayStart } } }),
      prisma.order.count({ where: { status: "PENDING", collectorId: null, scheduledDate: { lte: addDays(day, 1) } } }),
      prisma.order.count({ where: { status: "PENDING", paymentMethod: "TRANSFER", type: { not: "PLAN_PICKUP" } } }),
      revenueSince(dayStart),
      revenueSince(addDays(dayStart, -6)),
      revenueSince(addDays(dayStart, -29)),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: addDays(dayStart, -6) } } }),
      prisma.collector.count({ where: { onDuty: true, active: true } }),
      prisma.supportTicket.count({ where: { status: { not: "RESOLVED" } } }),
      prisma.order.aggregate({ where: { ratedAt: { gte: addDays(dayStart, -29) } }, _avg: { rating: true }, _count: { rating: true } }),
      prisma.serviceArea.findMany({ where: { active: true }, orderBy: { launchOrder: "asc" } }),
    ])
  const perArea = await Promise.all(
    areas.map(async (a) => ({
      id: a.id,
      name: a.name,
      today: await prisma.order.count({
        where: { areaId: a.id, scheduledDate: day, type: { not: "WASTE_BAGS" }, status: { not: "CANCELLED" } },
      }),
      capacity: a.dailyCapacity,
      autoAssign: a.autoAssign,
    })),
  )
  res.json({
    today: { due, done, notDone, unassigned, waitingPayment },
    // Money is for the main admin.
    revenue: isOwner(currentUser(req)) ? { today: revenueToday, last7Days: revenue7, last30Days: revenue30 } : null,
    activePlans: plans,
    newCustomers7Days: newCustomers,
    collectorsOnDuty: onDuty,
    openTickets: tickets,
    rating: { average: ratings._avg.rating ? Math.round(ratings._avg.rating * 10) / 10 : null, count: ratings._count.rating },
    areas: perArea,
    stock: (await stockLevels()).filter((s) => s.available <= s.lowAt),
    quotesWaiting: await prisma.quoteRequest.count({ where: { status: "NEW" } }),
  })
})

// Give waiting paid orders (due by tomorrow) to on-duty collectors, in areas with auto-assign on.
operationsRouter.post("/admin/auto-assign", async (req, res) => {
  const assigned = await autoAssignDue(addDays(today(), 1))
  if (assigned) await audit(currentUser(req), "orders.auto_assign", { type: "order" }, `Auto-assigned ${assigned} waiting order${assigned === 1 ? "" : "s"}`)
  res.json({ assigned })
})

// ── Customers ──────────────────────────────────────────────

operationsRouter.get("/admin/customers", async (req, res) => {
  const { q, suspended } = z
    .object({ q: z.string().trim().max(100).optional(), suspended: z.enum(["true", "false"]).optional() })
    .parse(req.query)
  const where: Prisma.UserWhereInput = { role: "CUSTOMER" }
  if (suspended) where.suspendedAt = suspended === "true" ? { not: null } : null
  if (q) {
    const digits = q.replace(/\D/g, "").replace(/^0/, "")
    where.OR = [{ name: { contains: q, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])]
  }
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      _count: { select: { orders: true } },
      subscriptions: { where: { status: "ACTIVE" }, select: { plan: true }, take: 1 },
    },
  })
  res.json({
    customers: users.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      createdAt: u.createdAt,
      orders: u._count.orders,
      activePlan: u.subscriptions[0]?.plan ?? null,
      suspended: Boolean(u.suspendedAt),
    })),
  })
})

async function findCustomer(id: string | string[]) {
  const user = await prisma.user.findFirst({ where: { id: String(id), role: "CUSTOMER" } })
  if (!user) throw new HttpError(404, "Customer not found.")
  return user
}

operationsRouter.get("/admin/customers/:id", async (req, res) => {
  const user = await findCustomer(req.params.id)
  const [orders, plans, addresses, tickets, paid] = await Promise.all([
    prisma.order.findMany({ where: { userId: user.id, type: { not: "PLAN_PICKUP" } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.subscription.findMany({ where: { userId: user.id, status: { in: ["ACTIVE", "EXPIRED"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.address.findMany({ where: { userId: user.id, deletedAt: null } }),
    prisma.supportTicket.count({ where: { userId: user.id } }),
    prisma.payment.aggregate({ where: { userId: user.id, status: "SUCCESS" }, _sum: { amount: true } }),
  ])
  res.json({
    customer: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      createdAt: user.createdAt,
      phoneVerified: Boolean(user.phoneVerifiedAt),
      suspendedAt: user.suspendedAt,
      suspendedReason: user.suspendedReason,
      paidOnline: paid._sum.amount ?? 0,
      tickets,
    },
    orders: orders.map(customerOrder),
    plans: plans.map((p) => ({ id: p.id, plan: p.plan, status: p.status, currentPeriodEnd: p.currentPeriodEnd })),
    addresses: addresses.map((a) => ({ id: a.id, label: a.label, address: a.address, landmark: a.landmark })),
  })
})

operationsRouter.post("/admin/customers/:id/suspend", requireOwner, async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, "Say why the account is being suspended.").max(300) }).parse(req.body)
  const user = await findCustomer(req.params.id)
  await prisma.user.update({ where: { id: user.id }, data: { suspendedAt: new Date(), suspendedReason: reason } })
  // Stop pushes to their phones while suspended.
  await prisma.pushToken.deleteMany({ where: { userId: user.id } })
  await audit(currentUser(req), "customer.suspend", { type: "customer", id: user.id }, `Suspended ${user.name} (${user.phone}): ${reason}`)
  res.json({ ok: true })
})

operationsRouter.post("/admin/customers/:id/restore", requireOwner, async (req, res) => {
  const user = await findCustomer(req.params.id)
  await prisma.user.update({ where: { id: user.id }, data: { suspendedAt: null, suspendedReason: null } })
  await audit(currentUser(req), "customer.restore", { type: "customer", id: user.id }, `Restored ${user.name} (${user.phone})`)
  res.json({ ok: true })
})

// ── Refunds ────────────────────────────────────────────────

/** What a customer paid for an order (including extra bags), less what's already been refunded. */
async function refundable(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { refunds: true } })
  const paid = (order.paidAt && order.type !== "PLAN_PICKUP" ? order.amount : 0) + (order.extraPaidAt ? order.extraAmount : 0)
  const refunded = order.refunds.filter((r) => r.status !== "FAILED").reduce((sum, r) => sum + r.amount, 0)
  return { order, paid, refunded, left: paid - refunded }
}

operationsRouter.post("/admin/orders/:id/refund", requireOwner, async (req, res) => {
  const body = z
    .object({
      amount: z.number().int().min(100, "Refund at least ₦100."),
      reason: z.string().trim().min(3, "Give a reason for the refund.").max(300),
      cancel: z.boolean().default(false),
    })
    .parse(req.body)
  const exists = await prisma.order.findUnique({ where: { id: String(req.params.id) } })
  if (!exists) throw new HttpError(404, "Order not found.")
  const { order, left } = await refundable(exists.id)
  if (left <= 0) throw new HttpError(409, "Nothing left to refund on this order.")
  if (body.amount > left) throw new HttpError(400, `You can refund at most ₦${left.toLocaleString("en-NG")} on this order.`)

  // Paid online: send it back through Paystack. Paid by transfer or cash: staff send it and record it here.
  const online = await prisma.payment.findFirst({
    where: { orderId: order.id, status: "SUCCESS", purpose: "ORDER" },
    orderBy: { paidAt: "desc" },
  })
  const viaPaystack = Boolean(online && body.amount <= online.amount)
  const paystack = viaPaystack
    ? await createRefund({ reference: online!.reference, amountKobo: body.amount * 100, note: `${order.reference}: ${body.reason}` })
    : null
  const refund = await prisma.refund.create({
    data: {
      orderId: order.id,
      userId: order.userId,
      amount: body.amount,
      reason: body.reason,
      method: viaPaystack ? "PAYSTACK" : "MANUAL",
      status: viaPaystack ? (paystack!.status === "processed" ? "PROCESSED" : "PENDING") : "PROCESSED",
      paystackId: paystack ? String(paystack.id) : null,
      createdById: currentUser(req).id,
    },
  })
  if (body.cancel && ["PENDING", "ASSIGNED"].includes(order.status)) {
    await prisma.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: "CANCELLED" } })
    await events.cancelledByStaff({ ...order, status: "CANCELLED" })
  }
  await events.refunded(order, refund.amount, refund.method)
  await audit(
    currentUser(req),
    "order.refund",
    { type: "order", id: order.id },
    `Refunded ₦${refund.amount.toLocaleString("en-NG")} on ${order.reference} (${refund.method === "PAYSTACK" ? "Paystack" : "manual"}): ${body.reason}`,
  )
  res.status(201).json({ refund, left: left - refund.amount })
})

operationsRouter.get("/admin/refunds", requireOwner, async (_req, res) => {
  const refunds = await prisma.refund.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { order: { select: { id: true, reference: true } }, user: { select: { name: true, phone: true } } },
  })
  res.json({ refunds })
})

// ── Bag stock ──────────────────────────────────────────────

operationsRouter.get("/admin/stock", async (_req, res) => {
  const [levels, movements] = await Promise.all([
    stockLevels(),
    prisma.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ])
  res.json({
    sizes: bagSizeIds.map((id) => levels.find((l) => l.size === id) ?? { size: id, name: findBagSize(id)!.name, tracked: false }),
    movements,
  })
})

// Restock (positive), write off or correct (negative). The first change for a size starts tracking it.
operationsRouter.post("/admin/stock/:size", async (req, res) => {
  const size = z.enum(bagSizeIds, "Unknown bag size.").parse(req.params.size)
  const body = z
    .object({
      change: z.number().int().min(-10000).max(10000),
      reason: z.string().trim().min(2, "Say why the stock is changing.").max(200),
      lowAt: z.number().int().min(0).max(10000).optional(),
    })
    .parse(req.body)
  // Staff can restock; writing stock off (or changing the warning level) is for the main admin.
  if ((body.change < 0 || body.lowAt !== undefined) && !isOwner(currentUser(req))) {
    throw new HttpError(403, "Only the main admin can remove stock or change the warning level.")
  }
  await prisma.$transaction(async (tx) => {
    const row = await tx.bagStock.upsert({
      where: { size },
      create: { size, packs: body.change, lowAt: body.lowAt ?? 20 },
      update: { packs: { increment: body.change }, ...(body.lowAt !== undefined ? { lowAt: body.lowAt } : {}) },
    })
    if (row.packs < 0) throw new HttpError(400, "Stock can't go below zero.")
    if (body.change) await tx.stockMovement.create({ data: { size, change: body.change, reason: body.reason, createdById: currentUser(req).id } })
  })
  await audit(
    currentUser(req),
    "stock.change",
    { type: "stock", id: size },
    `${body.change >= 0 ? "Added" : "Removed"} ${Math.abs(body.change)} packs of ${findBagSize(size)!.name.toLowerCase()} bags: ${body.reason}`,
  )
  res.json({ sizes: await stockLevels() })
})

// ── CSV exports ────────────────────────────────────────────

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return ""
  const s = v instanceof Date ? v.toISOString() : String(v)
  // Quote anything with commas, quotes or line breaks; stop spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function sendCsv(res: Response, name: string, header: string[], rows: unknown[][]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`)
  res.send([header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n")
}

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

operationsRouter.get("/admin/exports/:kind.csv", requireOwner, async (req, res) => {
  const kind = z.enum(["orders", "payments", "customers", "payouts", "refunds", "disposals"]).parse(req.params.kind)
  const range = rangeSchema.parse(req.query)
  await audit(currentUser(req), "export.csv", { type: "export", id: kind }, `Downloaded the ${kind} report`)
  const from = range.from ? startOfLagosDay(toDay(range.from)) : startOfLagosDay(addDays(today(), -29))
  const to = range.to ? startOfLagosDay(addDays(toDay(range.to), 1)) : startOfLagosDay(addDays(today(), 1))
  const created = { gte: from, lt: to }
  const file = `wastecore-${kind}-${ymd(new Date(from.getTime() + 3_600_000))}-to-${ymd(new Date(to.getTime() - 1))}.csv`

  if (kind === "orders") {
    const orders = await prisma.order.findMany({
      where: { createdAt: created },
      include: { user: true, collector: true, area: true },
      orderBy: { createdAt: "asc" },
    })
    return sendCsv(
      res,
      file,
      ["Reference", "Created", "Type", "Plan or size", "Status", "Customer", "Phone", "Area", "Address", "Scheduled", "Bags/packs", "Bags collected", "Weight (kg)", "Amount", "Extra", "Paid by", "Paid at", "Collector", "Completed", "Rating"],
      orders.map((o) => [
        o.reference, o.createdAt, o.type, o.plan, o.status, o.user.name, o.user.phone, o.area?.name, o.address, ymd(o.scheduledDate),
        o.quantity, o.bagsCollected, o.weightKg, o.amount, o.extraAmount || "", o.paymentMethod, o.paidAt, o.collector?.name, o.completedAt, o.rating,
      ]),
    )
  }
  if (kind === "payments") {
    const payments = await prisma.payment.findMany({
      where: { status: "SUCCESS", paidAt: created },
      include: { user: true, order: true },
      orderBy: { paidAt: "asc" },
    })
    const transfers = await prisma.order.findMany({
      where: { paymentMethod: "TRANSFER", paidAt: created, status: { notIn: ["AWAITING_PAYMENT"] } },
      include: { user: true },
      orderBy: { paidAt: "asc" },
    })
    return sendCsv(
      res,
      file,
      ["Paid at", "Reference", "Order", "Purpose", "Method", "Amount", "Customer", "Phone"],
      [
        ...payments.map((p) => [p.paidAt, p.reference, p.order?.reference, p.purpose, `Paystack ${p.channel ?? ""}`.trim(), p.amount, p.user.name, p.user.phone]),
        ...transfers.map((o) => [o.paidAt, o.reference, o.reference, "ORDER", "Bank transfer", o.amount, o.user.name, o.user.phone]),
      ],
    )
  }
  if (kind === "customers") {
    const users = await prisma.user.findMany({
      where: { role: "CUSTOMER", createdAt: created },
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: "asc" },
    })
    return sendCsv(
      res,
      file,
      ["Joined", "Name", "Phone", "Email", "Orders", "Suspended"],
      users.map((u) => [u.createdAt, u.name, u.phone, u.email, u._count.orders, u.suspendedAt ? "yes" : ""]),
    )
  }
  if (kind === "payouts") {
    const payouts = await prisma.collectorPayout.findMany({ where: { createdAt: created }, include: { collector: true }, orderBy: { createdAt: "asc" } })
    return sendCsv(
      res,
      file,
      ["Paid at", "Collector", "Phone", "Jobs", "Amount", "Note"],
      payouts.map((p) => [p.createdAt, p.collector.name, p.collector.phone, p.jobs, p.amount, p.note]),
    )
  }
  if (kind === "disposals") {
    const disposals = await prisma.disposal.findMany({ where: { disposedAt: created }, include: { collector: true, area: true }, orderBy: { disposedAt: "asc" } })
    return sendCsv(
      res,
      file,
      ["Disposed at", "Site", "Kind", "Waste type", "Weight (kg)", "Ticket", "Collector", "Area", "Note"],
      disposals.map((d) => [d.disposedAt, d.site, d.kind, d.wasteType, d.weightKg, d.ticketNo, d.collector?.name, d.area?.name, d.note]),
    )
  }
  const refunds = await prisma.refund.findMany({ where: { createdAt: created }, include: { order: true, user: true }, orderBy: { createdAt: "asc" } })
  return sendCsv(
    res,
    file,
    ["Refunded at", "Order", "Customer", "Phone", "Amount", "Method", "Status", "Reason"],
    refunds.map((r) => [r.createdAt, r.order.reference, r.user.name, r.user.phone, r.amount, r.method, r.status, r.reason]),
  )
})
