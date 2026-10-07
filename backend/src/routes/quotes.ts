import { Router } from "express"
import { z } from "zod"
import { audit } from "../audit.ts"
import { currentUser, requireAdmin, requireCustomer, requireUser } from "../auth.ts"
import { SPECIAL_WASTE_CATEGORIES } from "../catalog.ts"
import { toDay, today, ymd } from "../dates.ts"
import { prisma } from "../db.ts"
import { events } from "../events.ts"
import type { QuoteRequest } from "../generated/prisma/client.ts"
import { QuoteStatus } from "../generated/prisma/enums.ts"
import { HttpError } from "../http.ts"
import { newReference, withUniqueReference } from "../references.ts"
import { customerOrder } from "../serializers.ts"
import { imageUpload, looksLikeImage, saveImage } from "../storage.ts"
import { futureDateSchema, trimmed } from "../validation.ts"
import { ownAddress } from "./areas.ts"

// Special waste (rubble, furniture, e-waste...): the customer describes it, staff send a price,
// and accepting the price creates an order to pay for like any other.
export const quotesRouter = Router()
quotesRouter.use("/quotes", requireUser, requireCustomer)
quotesRouter.use("/admin/quotes", requireUser, requireAdmin)

function publicQuote(q: QuoteRequest) {
  return {
    id: q.id,
    reference: q.reference,
    category: q.category,
    description: q.description,
    photoUrl: q.photoUrl,
    address: q.address,
    landmark: q.landmark,
    lat: q.lat,
    lng: q.lng,
    preferredDate: ymd(q.preferredDate),
    status: q.status,
    amount: q.amount,
    staffNote: q.staffNote,
    quotedAt: q.quotedAt,
    orderId: q.orderId,
    createdAt: q.createdAt,
  }
}

const requestSchema = z.object({
  category: z.enum(SPECIAL_WASTE_CATEGORIES, "Choose what kind of waste it is."),
  description: trimmed(1000, "Description"),
  addressId: z.string().min(1, "Choose an address."),
  preferredDate: futureDateSchema,
})

// Multipart, with an optional "photo" of the waste.
quotesRouter.post("/quotes", imageUpload.single("photo"), async (req, res) => {
  const user = currentUser(req)
  const body = requestSchema.parse(req.body ?? {})
  const address = await ownAddress(body.addressId, user.id)
  if (req.file && !looksLikeImage(req.file.buffer)) throw new HttpError(400, "That file is not a valid image.")
  const quote = await withUniqueReference("QT", async (reference) => {
    const photoUrl = req.file ? await saveImage(req.file, reference, "quotes") : null
    return prisma.quoteRequest.create({
      data: {
        reference,
        userId: user.id,
        category: body.category,
        description: body.description,
        photoUrl,
        address: address.address,
        landmark: address.landmark,
        lat: address.lat,
        lng: address.lng,
        areaId: address.areaId,
        preferredDate: toDay(body.preferredDate),
      },
    })
  })
  await events.quoteRequested(quote, user.name)
  res.status(201).json({ quote: publicQuote(quote) })
})

quotesRouter.get("/quotes", async (req, res) => {
  const quotes = await prisma.quoteRequest.findMany({ where: { userId: currentUser(req).id }, orderBy: { createdAt: "desc" }, take: 50 })
  res.json({ quotes: quotes.map(publicQuote) })
})

async function ownQuote(id: string | string[], userId: string) {
  const quote = await prisma.quoteRequest.findFirst({ where: { id: String(id), userId } })
  if (!quote) throw new HttpError(404, "Quote not found.")
  return quote
}

quotesRouter.get("/quotes/:id", async (req, res) => {
  res.json({ quote: publicQuote(await ownQuote(req.params.id, currentUser(req).id)) })
})

// Accepting the price creates a special pickup to pay for.
quotesRouter.post("/quotes/:id/accept", async (req, res) => {
  const quote = await ownQuote(req.params.id, currentUser(req).id)
  if (quote.status !== "QUOTED" || !quote.amount) throw new HttpError(409, "This quote can't be accepted.")
  // Keep their preferred day if it's still ahead, otherwise today.
  const day = quote.preferredDate >= today() ? quote.preferredDate : today()
  // Reuse the quote's code (QT-ABC123 -> WC-ABC123) unless an order already has it.
  let reference = quote.reference.replace(/^QT-/, "WC-")
  while (await prisma.order.findUnique({ where: { reference } })) reference = newReference("WC")
  const order = await prisma.$transaction(async (tx) => {
    const claimed = await tx.quoteRequest.updateMany({ where: { id: quote.id, status: "QUOTED" }, data: { status: "ACCEPTED" } })
    if (claimed.count === 0) throw new HttpError(409, "This quote can't be accepted.")
    const created = await tx.order.create({
      data: {
        reference,
        userId: quote.userId,
        type: "SPECIAL_PICKUP",
        plan: "special",
        wasteType: quote.category,
        address: quote.address,
        landmark: quote.landmark,
        lat: quote.lat,
        lng: quote.lng,
        areaId: quote.areaId,
        scheduledDate: day,
        quantity: 1,
        amount: quote.amount!,
        adminNote: quote.staffNote ? `Quote ${quote.reference}: ${quote.staffNote}` : `Quote ${quote.reference}: ${quote.description}`,
      },
    })
    await tx.quoteRequest.update({ where: { id: quote.id }, data: { orderId: created.id } })
    return created
  })
  await events.quoteAnswered({ ...quote, status: "ACCEPTED" }, true)
  res.status(201).json({ order: customerOrder(order) })
})

quotesRouter.post("/quotes/:id/decline", async (req, res) => {
  const quote = await ownQuote(req.params.id, currentUser(req).id)
  const updated = await prisma.quoteRequest.updateMany({
    where: { id: quote.id, status: { in: ["NEW", "QUOTED"] } },
    data: { status: quote.status === "NEW" ? "CANCELLED" : "DECLINED" },
  })
  if (updated.count === 0) throw new HttpError(409, "This quote is already closed.")
  if (quote.status === "QUOTED") await events.quoteAnswered(quote, false)
  res.json({ quote: publicQuote(await ownQuote(quote.id, quote.userId)) })
})

// ── Staff ──────────────────────────────────────────────────

quotesRouter.get("/admin/quotes", async (req, res) => {
  const { status } = z.object({ status: z.enum(QuoteStatus).optional() }).parse(req.query)
  const quotes = await prisma.quoteRequest.findMany({
    where: { status },
    include: { user: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  res.json({ quotes: quotes.map((q) => ({ ...publicQuote(q), customer: q.user })) })
})

async function findQuote(id: string | string[]) {
  const quote = await prisma.quoteRequest.findUnique({ where: { id: String(id) }, include: { user: { select: { id: true, name: true, phone: true } } } })
  if (!quote) throw new HttpError(404, "Quote not found.")
  return quote
}

quotesRouter.get("/admin/quotes/:id", async (req, res) => {
  const quote = await findQuote(req.params.id)
  res.json({ quote: { ...publicQuote(quote), customer: quote.user } })
})

// Send (or change) the price.
quotesRouter.post("/admin/quotes/:id/quote", async (req, res) => {
  const body = z
    .object({
      amount: z.number().int().min(500, "A quote must be at least ₦500.").max(5_000_000),
      note: z.string().trim().max(500).optional(),
    })
    .parse(req.body)
  const quote = await findQuote(req.params.id)
  const updated = await prisma.quoteRequest.updateMany({
    where: { id: quote.id, status: { in: ["NEW", "QUOTED"] } },
    data: { status: "QUOTED", amount: body.amount, staffNote: body.note || null, quotedAt: new Date() },
  })
  if (updated.count === 0) throw new HttpError(409, "This quote is already closed.")
  const after = await findQuote(quote.id)
  await events.quoteSent(after)
  await audit(currentUser(req), "quote.send", { type: "quote", id: quote.id }, `${quote.reference}: quoted ₦${body.amount.toLocaleString("en-NG")}`)
  res.json({ quote: { ...publicQuote(after), customer: after.user } })
})

// Can't do it: close the request with a message to the customer.
quotesRouter.post("/admin/quotes/:id/cancel", async (req, res) => {
  const { note } = z.object({ note: z.string().trim().min(3, "Tell the customer why.").max(500) }).parse(req.body)
  const quote = await findQuote(req.params.id)
  const updated = await prisma.quoteRequest.updateMany({
    where: { id: quote.id, status: { in: ["NEW", "QUOTED"] } },
    data: { status: "CANCELLED", staffNote: note },
  })
  if (updated.count === 0) throw new HttpError(409, "This quote is already closed.")
  const after = await findQuote(quote.id)
  await events.quoteCancelled(after)
  await audit(currentUser(req), "quote.cancel", { type: "quote", id: quote.id }, `${quote.reference}: closed (${note})`)
  res.json({ quote: { ...publicQuote(after), customer: after.user } })
})
