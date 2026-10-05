import { Router } from "express"
import { z } from "zod"
import { currentUser, requireUser } from "../auth.ts"
import { SUPPORT_CATEGORIES } from "../catalog.ts"
import { prisma } from "../db.ts"
import { withUniqueReference } from "../references.ts"
import { ticket } from "../serializers.ts"
import { trimmed } from "../validation.ts"

const createTicketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES, "Choose a support category."),
  message: trimmed(1000, "Description"),
  contactTime: trimmed(100, "Preferred contact time"),
})

export const supportRouter = Router()
supportRouter.use("/support-tickets", requireUser)

supportRouter.post("/support-tickets", async (req, res) => {
  const body = createTicketSchema.parse(req.body)
  const created = await withUniqueReference("TKT", (reference) =>
    prisma.supportTicket.create({ data: { ...body, reference, userId: currentUser(req).id } }),
  )
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
