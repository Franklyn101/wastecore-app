import { Router } from "express"
import { z } from "zod"
import { requireAdmin, requireUser } from "../auth.ts"
import { prisma } from "../db.ts"
import { OrderStatus, OrderType, TicketStatus } from "../generated/prisma/enums.ts"
import { HttpError } from "../http.ts"
import { adminOrder, ticket } from "../serializers.ts"
import { phoneSchema, trimmed } from "../validation.ts"

// Operations API for staff: verify payments, assign collectors, close tickets.
// An admin dashboard can be built on these endpoints.
export const adminRouter = Router()
adminRouter.use("/admin", requireUser, requireAdmin)

const listOrdersQuery = z.object({
  status: z.enum(OrderStatus).optional(),
  type: z.enum(OrderType).optional(),
})

const updateOrderSchema = z
  .object({
    status: z.enum(OrderStatus).optional(),
    collectorId: z.string().nullable().optional(),
    adminNote: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to update.")

const collectorSchema = z.object({
  name: trimmed(100, "Name"),
  phone: phoneSchema,
  area: trimmed(100, "Area"),
  active: z.boolean().optional(),
})

const orderInclude = { collector: true, user: { select: { id: true, name: true, phone: true } } } as const

adminRouter.get("/admin/orders", async (req, res) => {
  const where = listOrdersQuery.parse(req.query)
  const orders = await prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: "desc" }, take: 500 })
  res.json({ orders: orders.map(adminOrder) })
})

adminRouter.patch("/admin/orders/:id", async (req, res) => {
  const body = updateOrderSchema.parse(req.body)
  const order = await prisma.order.findUnique({ where: { id: req.params.id } })
  if (!order) throw new HttpError(404, "Order not found.")

  if (body.collectorId) {
    const collector = await prisma.collector.findUnique({ where: { id: body.collectorId } })
    if (!collector?.active) throw new HttpError(400, "Choose an active collector.")
  }
  // Assigning a collector to a paid order moves it to ASSIGNED, as on the bot's dashboard.
  const status = body.status ?? (body.collectorId && order.status === "PENDING" ? "ASSIGNED" : undefined)

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { ...body, status },
    include: orderInclude,
  })
  res.json({ order: adminOrder(updated) })
})

adminRouter.get("/admin/collectors", async (_req, res) => {
  res.json({ collectors: await prisma.collector.findMany({ orderBy: { name: "asc" } }) })
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

adminRouter.get("/admin/support-tickets", async (_req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    include: { user: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  })
  res.json({ tickets: tickets.map((t) => ({ ...ticket(t), customer: t.user })) })
})

adminRouter.patch("/admin/support-tickets/:id", async (req, res) => {
  const { status } = z.object({ status: z.enum(TicketStatus) }).parse(req.body)
  const existing = await prisma.supportTicket.findUnique({ where: { id: req.params.id } })
  if (!existing) throw new HttpError(404, "Ticket not found.")
  res.json({ ticket: ticket(await prisma.supportTicket.update({ where: { id: existing.id }, data: { status } })) })
})
