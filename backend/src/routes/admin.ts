import { Router } from "express"
import { z } from "zod"
import { requireAdmin, requireUser } from "../auth.ts"
import { prisma } from "../db.ts"
import type { Prisma } from "../generated/prisma/client.ts"
import { OrderStatus, OrderType, SubscriptionStatus, TicketStatus } from "../generated/prisma/enums.ts"
import { HttpError } from "../http.ts"
import { adminOrder, adminSubscription, ticket } from "../serializers.ts"
import { today } from "../dates.ts"
import { phoneSchema, trimmed } from "../validation.ts"

// Operations API for staff: verify payments, assign collectors, close tickets.
// Used by the admin screens in the mobile app.
export const adminRouter = Router()
adminRouter.use("/admin", requireUser, requireAdmin)

// Which status an order may move to from each status. Staying in the same
// status is always allowed (e.g. reassigning a collector or editing notes).
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  AWAITING_PAYMENT: ["PENDING", "CANCELLED"], // mark as paid without a receipt
  PENDING: ["AWAITING_PAYMENT", "ASSIGNED", "COMPLETED", "CANCELLED"], // reject receipt, assign, activate plan
  ASSIGNED: ["COMPLETED", "INCOMPLETE", "CANCELLED"],
  COMPLETED: [],
  INCOMPLETE: [],
  CANCELLED: [],
}

const listOrdersQuery = z.object({
  status: z.enum(OrderStatus).optional(),
  type: z.enum(OrderType).optional(),
  q: z.string().trim().max(100).optional(),
})

const note = z.string().trim().max(1000).nullable().optional()

const updateOrderSchema = z
  .object({
    status: z.enum(OrderStatus).optional(),
    collectorId: z.string().nullable().optional(),
    adminNote: note,
    customerNote: note,
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), "Nothing to update.")

const collectorSchema = z.object({
  name: trimmed(100, "Name"),
  phone: phoneSchema,
  area: trimmed(100, "Area"),
  active: z.boolean().optional(),
})

const orderInclude = { collector: true, user: { select: { id: true, name: true, phone: true } } } as const

async function findOrder(id: string | string[]) {
  const order = await prisma.order.findUnique({ where: { id: String(id) }, include: orderInclude })
  if (!order) throw new HttpError(404, "Order not found.")
  return order
}

adminRouter.get("/admin/summary", async (_req, res) => {
  const [orders, openTickets, activePlans] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.supportTicket.count({ where: { status: { not: "RESOLVED" } } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
  ])
  const counts = Object.fromEntries(Object.values(OrderStatus).map((s) => [s, 0])) as Record<OrderStatus, number>
  for (const row of orders) counts[row.status] = row._count._all
  res.json({ orders: counts, openTickets, activePlans })
})

adminRouter.get("/admin/orders", async (req, res) => {
  const { status, type, q } = listOrdersQuery.parse(req.query)
  const where: Prisma.OrderWhereInput = { status, type }
  if (q) {
    const digits = q.replace(/\D/g, "").replace(/^0/, "")
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      ...(digits.length >= 4 ? [{ user: { phone: { contains: digits } } }] : []),
    ]
  }
  // Open work is listed by date due; everything else newest first.
  const open = status === "PENDING" || status === "ASSIGNED"
  const orders = await prisma.order.findMany({
    where,
    include: orderInclude,
    orderBy: open ? [{ scheduledDate: "asc" }, { createdAt: "asc" }] : { createdAt: "desc" },
    take: 200,
  })
  res.json({ orders: orders.map(adminOrder) })
})

adminRouter.get("/admin/orders/:id", async (req, res) => {
  res.json({ order: adminOrder(await findOrder(req.params.id)) })
})

adminRouter.patch("/admin/orders/:id", async (req, res) => {
  const body = updateOrderSchema.parse(req.body)
  const order = await findOrder(req.params.id)

  // Assigning a collector to a paid order moves it to ASSIGNED.
  const status = body.status ?? (body.collectorId && order.status === "PENDING" ? "ASSIGNED" : order.status)
  if (status !== order.status && !TRANSITIONS[order.status].includes(status)) {
    throw new HttpError(409, `An order that is ${order.status.toLowerCase().replace("_", " ")} can't be moved to ${status.toLowerCase().replace("_", " ")}.`)
  }

  const data: Prisma.OrderUncheckedUpdateManyInput = { status }
  if (body.adminNote !== undefined) data.adminNote = body.adminNote
  if (body.customerNote !== undefined) data.customerNote = body.customerNote

  if (body.collectorId !== undefined) {
    if (status !== "PENDING" && status !== "ASSIGNED") {
      throw new HttpError(409, "Collectors can only be assigned to paid orders that are still open.")
    }
    if (body.collectorId) {
      const collector = await prisma.collector.findUnique({ where: { id: body.collectorId } })
      if (!collector?.active) throw new HttpError(400, "Choose an active collector.")
    }
    data.collectorId = body.collectorId
  }
  const collectorId = body.collectorId !== undefined ? body.collectorId : order.collectorId
  if (status === "ASSIGNED" && !collectorId) throw new HttpError(400, "Choose a collector to assign.")

  if (status === "AWAITING_PAYMENT" && order.status === "PENDING") {
    if (order.paymentMethod === "PAYSTACK") throw new HttpError(409, "This order was paid online and verified by Paystack.")
    // Rejecting a receipt: the customer must be told why, and can upload a new one.
    if (!body.customerNote) throw new HttpError(400, "Tell the customer why the receipt was rejected.")
    data.paidAt = null
    data.collectorId = null
  }
  if (status === "PENDING" && order.status === "AWAITING_PAYMENT") {
    data.paidAt = order.paidAt ?? new Date()
    if (body.customerNote === undefined) data.customerNote = null
  }

  // Conditional on the status we checked, so two staff acting at once can't both win.
  const updated = await prisma.order.updateMany({ where: { id: order.id, status: order.status }, data })
  if (updated.count === 0) throw new HttpError(409, "This order was just changed by someone else. Refresh and try again.")
  res.json({ order: adminOrder(await findOrder(order.id)) })
})

adminRouter.get("/admin/subscriptions", async (req, res) => {
  const { status } = z.object({ status: z.enum(SubscriptionStatus).optional() }).parse(req.query)
  const subs = await prisma.subscription.findMany({
    where: status ? { status } : { status: { in: ["ACTIVE", "EXPIRED"] } },
    include: { collector: true, user: { select: { id: true, name: true, phone: true } } },
    orderBy: [{ status: "asc" }, { currentPeriodEnd: "asc" }],
    take: 500,
  })
  res.json({ subscriptions: subs.map(adminSubscription) })
})

// Sets a plan's regular collector and assigns them to its upcoming unassigned pickups.
adminRouter.patch("/admin/subscriptions/:id", async (req, res) => {
  const { collectorId } = z.object({ collectorId: z.string().nullable() }).parse(req.body)
  const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } })
  if (!sub) throw new HttpError(404, "Plan not found.")
  if (collectorId) {
    const collector = await prisma.collector.findUnique({ where: { id: collectorId } })
    if (!collector?.active) throw new HttpError(400, "Choose an active collector.")
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (collectorId) {
      await tx.order.updateMany({
        where: { subscriptionId: sub.id, status: "PENDING", scheduledDate: { gte: today() } },
        data: { collectorId, status: "ASSIGNED" },
      })
    }
    return tx.subscription.update({
      where: { id: sub.id },
      data: { collectorId },
      include: { collector: true, user: { select: { id: true, name: true, phone: true } } },
    })
  })
  res.json({ subscription: adminSubscription(updated) })
})

adminRouter.get("/admin/collectors", async (_req, res) => {
  res.json({ collectors: await prisma.collector.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }) })
})

adminRouter.post("/admin/collectors", async (req, res) => {
  const collector = await prisma.collector.create({ data: collectorSchema.parse(req.body) })
  res.status(201).json({ collector })
})

adminRouter.patch("/admin/collectors/:id", async (req, res) => {
  const data = collectorSchema.partial().parse(req.body)
  const existing = await prisma.collector.findUnique({ where: { id: req.params.id } })
  if (!existing) throw new HttpError(404, "Collector not found.")
  res.json({ collector: await prisma.collector.update({ where: { id: existing.id }, data }) })
})

adminRouter.get("/admin/support-tickets", async (req, res) => {
  const { status } = z.object({ status: z.enum(TicketStatus).optional() }).parse(req.query)
  const tickets = await prisma.supportTicket.findMany({
    where: { status },
    include: { user: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  res.json({ tickets: tickets.map((t) => ({ ...ticket(t), customer: t.user })) })
})

adminRouter.patch("/admin/support-tickets/:id", async (req, res) => {
  const { status } = z.object({ status: z.enum(TicketStatus) }).parse(req.body)
  const existing = await prisma.supportTicket.findUnique({ where: { id: req.params.id } })
  if (!existing) throw new HttpError(404, "Ticket not found.")
  res.json({ ticket: ticket(await prisma.supportTicket.update({ where: { id: existing.id }, data: { status } })) })
})
