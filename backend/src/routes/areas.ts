import { Router } from "express"
import { z } from "zod"
import { publicArea, locate, requireServedArea } from "../areas.ts"
import { fullDays } from "../capacity.ts"
import { today } from "../dates.ts"
import { currentUser, requireCustomer, requireUser } from "../auth.ts"
import { prisma } from "../db.ts"
import type { Address } from "../generated/prisma/client.ts"
import { HttpError } from "../http.ts"
import { trimmed } from "../validation.ts"

export const point = {
  lat: z.number("Pin your location on the map.").min(-90).max(90),
  lng: z.number("Pin your location on the map.").min(-180).max(180),
}

const addressSchema = z.object({
  label: trimmed(40, "Label").default("Home"),
  address: trimmed(300, "Address"),
  landmark: z.string().trim().max(200).optional().nullable(),
  ...point,
})

export function publicAddress(a: Address & { area?: { name: string; state: string } }) {
  return {
    id: a.id,
    label: a.label,
    address: a.address,
    landmark: a.landmark,
    lat: a.lat,
    lng: a.lng,
    areaId: a.areaId,
    areaName: a.area ? `${a.area.name}, ${a.area.state}` : undefined,
  }
}

/** A customer's saved address, for booking. */
export async function ownAddress(id: string, userId: string) {
  const address = await prisma.address.findFirst({ where: { id, userId, deletedAt: null }, include: { area: true } })
  if (!address) throw new HttpError(404, "Address not found.")
  if (!address.area.active) throw new HttpError(422, `We're not taking bookings in ${address.area.name} right now.`)
  return address
}

/**
 * Where a booking is: a saved address (`addressId`), or a pinned spot with its street address.
 * Spread into a booking's schema, then pass the parsed body to `resolveLocation`.
 */
export const locationFields = {
  addressId: z.string().optional(),
  address: trimmed(300, "Address").optional(),
  landmark: z.string().trim().max(200).optional().nullable(),
  lat: point.lat.optional(),
  lng: point.lng.optional(),
}

type LocationInput = { addressId?: string; address?: string; landmark?: string | null; lat?: number; lng?: number }

/** Turns a booking's location into the fields stored on the order or plan, checking we serve it. */
export async function resolveLocation(input: LocationInput, userId: string) {
  if (input.addressId) {
    const a = await ownAddress(input.addressId, userId)
    return { address: a.address, landmark: a.landmark, lat: a.lat, lng: a.lng, areaId: a.areaId }
  }
  if (!input.address || input.lat === undefined || input.lng === undefined) {
    throw new HttpError(400, "Choose an address and pin it on the map.")
  }
  const area = await requireServedArea({ lat: input.lat, lng: input.lng })
  return { address: input.address, landmark: input.landmark ?? null, lat: input.lat, lng: input.lng, areaId: area.id }
}

export const areasRouter = Router()

// Public: which cities we serve, for the map and "coming soon" lists.
areasRouter.get("/areas", async (_req, res) => {
  const areas = await prisma.serviceArea.findMany({ orderBy: { launchOrder: "asc" } })
  res.json({ areas: areas.map(publicArea) })
})

// Is this spot served? Used live while the customer moves the pin.
areasRouter.get("/areas/locate", async (req, res) => {
  const p = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).parse(req.query)
  const { area, nearest, nearestKm } = await locate(p)
  res.json({
    area: area && publicArea(area),
    served: Boolean(area?.active),
    nearest: nearest && publicArea(nearest),
    nearestKm: nearestKm === null ? null : Math.round(nearestKm),
  })
})

// Days an area is fully booked, so the app can grey them out in the date picker.
areasRouter.get("/areas/:id/full-days", async (req, res) => {
  const { days } = z.object({ days: z.coerce.number().int().min(1).max(60).default(30) }).parse(req.query)
  res.json({ fullDays: await fullDays(String(req.params.id), today(), days) })
})

// "Tell me when you launch here."
areasRouter.post("/areas/interest", requireUser, async (req, res) => {
  const p = z.object(point).parse(req.body)
  const { area, nearest } = await locate(p)
  const userId = currentUser(req).id
  const areaId = (area ?? nearest)?.id ?? null
  // Once per person per area, however many times they tap it.
  const already = await prisma.areaInterest.findFirst({ where: { userId, areaId } })
  if (!already) await prisma.areaInterest.create({ data: { ...p, userId, areaId } })
  res.status(201).json({ ok: true })
})

areasRouter.use("/addresses", requireUser, requireCustomer)

areasRouter.get("/addresses", async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: currentUser(req).id, deletedAt: null },
    include: { area: true },
    orderBy: { createdAt: "asc" },
  })
  res.json({ addresses: addresses.map(publicAddress) })
})

areasRouter.post("/addresses", async (req, res) => {
  const body = addressSchema.parse(req.body)
  const area = await requireServedArea(body)
  const user = currentUser(req)
  const created = await prisma.address.create({ data: { ...body, userId: user.id, areaId: area.id }, include: { area: true } })
  // The first address also becomes the account's default.
  if (!user.address) await prisma.user.update({ where: { id: user.id }, data: { address: body.address } })
  res.status(201).json({ address: publicAddress(created) })
})

areasRouter.patch("/addresses/:id", async (req, res) => {
  const body = addressSchema.partial().parse(req.body)
  const existing = await prisma.address.findFirst({ where: { id: String(req.params.id), userId: currentUser(req).id, deletedAt: null } })
  if (!existing) throw new HttpError(404, "Address not found.")
  const moved = body.lat !== undefined || body.lng !== undefined
  const where = { lat: body.lat ?? existing.lat, lng: body.lng ?? existing.lng }
  const areaId = moved ? (await requireServedArea(where)).id : existing.areaId
  const updated = await prisma.address.update({
    where: { id: existing.id },
    data: { ...body, ...where, areaId },
    include: { area: true },
  })
  res.json({ address: publicAddress(updated) })
})

areasRouter.delete("/addresses/:id", async (req, res) => {
  await prisma.address.updateMany({
    where: { id: String(req.params.id), userId: currentUser(req).id, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  res.status(204).end()
})
