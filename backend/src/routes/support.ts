import { Router } from "express"
import { z } from "zod"
import { currentUser, requireCustomer, requireUser } from "../auth.ts"
import { SUPPORT_CATEGORIES } from "../catalog.ts"
import { prisma } from "../db.ts"
import { events } from "../events.ts"
import { HttpError } from "../http.ts"
import { withUniqueReference } from "../references.ts"
import { ticket } from "../serializers.ts"
import { trimmed } from "../validation.ts"

const createTicketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES, "Choose a support category."),
  message: trimmed(1000, "Description"),
  contactTime: trimmed(100, "Preferred contact time"),
  // Set when the customer reports a problem from an order.
  orderId: z.string().optional(),
})

export const supportRouter = Router()
supportRouter.use("/support-tickets", requireUser, requireCustomer)

supportRouter.post("/support-tickets", async (req, res) => {
  const body = createTicketSchema.parse(req.body)
  if (body.orderId) {
    const order = await prisma.order.findFirst({ where: { id: body.orderId, userId: currentUser(req).id } })
    if (!order) throw new HttpError(404, "Order not found.")
  }
  const created = await withUniqueReference("TKT", (reference) =>
    prisma.supportTicket.create({ data: { ...body, reference, userId: currentUser(req).id } }),
  )
  const about = body.orderId ? (await prisma.order.findUnique({ where: { id: body.orderId } }))?.reference : undefined
  await events.ticketCreated(created.reference, about ? `${created.category} (${about})` : created.category, currentUser(req).name)
  res.status(201).json({ ticket: ticket(created) })
})

supportRouter.get("/support-tickets", async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: currentUser(req).id },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  res.json({ tickets: tickets.map(ticket) })
})
