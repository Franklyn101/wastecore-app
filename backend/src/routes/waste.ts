import { Router } from "express"
import { z } from "zod"
import { audit } from "../audit.ts"
import { currentCollector, currentUser, requireAdmin, requireApprovedCollector, requireCollector, requireUser } from "../auth.ts"
import { WASTE_TYPES } from "../catalog.ts"
import { addDays, startOfLagosDay, toDay, today } from "../dates.ts"
import { prisma } from "../db.ts"
import type { Disposal } from "../generated/prisma/client.ts"
import { DisposalSiteKind } from "../generated/prisma/enums.ts"
import { HttpError } from "../http.ts"
import { imageUpload, looksLikeImage, saveImage } from "../storage.ts"
import { trimmed } from "../validation.ts"

// Where collected waste ends up: dump site, recycler or compost. With the weights collectors
// record at pickups, this gives the waste report (how much, what kind, how much recycled).
export const wasteRouter = Router()

const disposalSchema = z.object({
  site: trimmed(150, "Site"),
  kind: z.enum(DisposalSiteKind, "Choose the kind of site."),
  wasteType: z.enum([...WASTE_TYPES, "Other"] as [string, ...string[]], "Choose the main kind of waste."),
  weightKg: z.coerce.number().positive("Enter the weight in kg.").max(50000),
  ticketNo: z.string().trim().max(60).optional(),
  note: z.string().trim().max(300).optional(),
})

const publicDisposal = (d: Disposal & { collector?: { name: string } | null }) => ({
  id: d.id,
  site: d.site,
  kind: d.kind,
  wasteType: d.wasteType,
  weightKg: d.weightKg,
  ticketNo: d.ticketNo,
  photoUrl: d.photoUrl,
  note: d.note,
  disposedAt: d.disposedAt,
  collector: d.collector?.name ?? null,
})

/** Sites used before, most recent first, so people pick instead of retyping. */
async function recentSites() {
  const rows = await prisma.disposal.findMany({ distinct: ["site"], orderBy: { disposedAt: "desc" }, take: 10, select: { site: true, kind: true } })
  return rows
}

// A collector logs a drop-off (multipart, with an optional photo of the gate ticket).
wasteRouter.post("/collector/disposals", requireUser, requireCollector, requireApprovedCollector, imageUpload.single("photo"), async (req, res) => {
  const body = disposalSchema.parse(req.body ?? {})
  const collector = currentCollector(req)
  if (req.file && !looksLikeImage(req.file.buffer)) throw new HttpError(400, "That file is not a valid image.")
  const photoUrl = req.file ? await saveImage(req.file, `DSP-${Date.now()}`, "disposals") : null
  const disposal = await prisma.disposal.create({
    data: { ...body, ticketNo: body.ticketNo || null, note: body.note || null, photoUrl, collectorId: collector.id, areaId: collector.serviceAreaId, recordedById: currentUser(req).id },
  })
  res.status(201).json({ disposal: publicDisposal(disposal) })
})

wasteRouter.get("/collector/disposals", requireUser, requireCollector, requireApprovedCollector, async (req, res) => {
  const disposals = await prisma.disposal.findMany({ where: { collectorId: currentCollector(req).id }, orderBy: { disposedAt: "desc" }, take: 30 })
  res.json({ disposals: disposals.map(publicDisposal), recentSites: await recentSites() })
})

// ── Staff ──────────────────────────────────────────────────

wasteRouter.use("/admin/disposals", requireUser, requireAdmin)
wasteRouter.use("/admin/reports", requireUser, requireAdmin)

wasteRouter.post("/admin/disposals", async (req, res) => {
  const body = disposalSchema.extend({ collectorId: z.string().nullable().optional(), areaId: z.string().nullable().optional() }).parse(req.body)
  const disposal = await prisma.disposal.create({
    data: { ...body, ticketNo: body.ticketNo || null, note: body.note || null, recordedById: currentUser(req).id },
  })
  await audit(currentUser(req), "disposal.add", { type: "disposal", id: disposal.id }, `Logged ${disposal.weightKg} kg at ${disposal.site}`)
  res.status(201).json({ disposal: publicDisposal(disposal) })
})

wasteRouter.get("/admin/disposals", async (_req, res) => {
  const disposals = await prisma.disposal.findMany({ include: { collector: { select: { name: true } } }, orderBy: { disposedAt: "desc" }, take: 100 })
  res.json({ disposals: disposals.map(publicDisposal), recentSites: await recentSites() })
})

const round = (n: number) => Math.round(n * 10) / 10

// How much waste was collected and where it went, for a period (default: last 30 days).
wasteRouter.get("/admin/reports/waste", async (req, res) => {
  const range = z
    .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
    .parse(req.query)
  const from = range.from ? startOfLagosDay(toDay(range.from)) : startOfLagosDay(addDays(today(), -29))
  const to = range.to ? startOfLagosDay(addDays(toDay(range.to), 1)) : startOfLagosDay(addDays(today(), 1))

  const [jobs, disposals] = await Promise.all([
    prisma.order.findMany({
      where: { status: "COMPLETED", type: { not: "WASTE_BAGS" }, completedAt: { gte: from, lt: to } },
      select: { wasteType: true, bagsCollected: true, quantity: true, weightKg: true, area: { select: { name: true } } },
    }),
    prisma.disposal.findMany({ where: { disposedAt: { gte: from, lt: to } }, select: { site: true, kind: true, wasteType: true, weightKg: true } }),
  ])

  const group = <T,>(items: T[], key: (t: T) => string) => {
    const map = new Map<string, T[]>()
    for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item])
    return [...map]
  }
  const collectedBy = (key: (j: (typeof jobs)[number]) => string) =>
    group(jobs, key)
      .map(([name, list]) => ({
        name,
        pickups: list.length,
        bags: list.reduce((s, j) => s + (j.bagsCollected ?? j.quantity), 0),
        kg: round(list.reduce((s, j) => s + (j.weightKg ?? 0), 0)),
      }))
      .sort((a, b) => b.pickups - a.pickups)

  const disposedKg = disposals.reduce((s, d) => s + d.weightKg, 0)
  const diverted = disposals.filter((d) => d.kind === "RECYCLER" || d.kind === "COMPOST").reduce((s, d) => s + d.weightKg, 0)
  res.json({
    from,
    to,
    collected: {
      pickups: jobs.length,
      bags: jobs.reduce((s, j) => s + (j.bagsCollected ?? j.quantity), 0),
      weighedPickups: jobs.filter((j) => j.weightKg !== null).length,
      kg: round(jobs.reduce((s, j) => s + (j.weightKg ?? 0), 0)),
      byWasteType: collectedBy((j) => j.wasteType ?? "Unknown"),
      byArea: collectedBy((j) => j.area?.name ?? "No area"),
    },
    disposed: {
      loads: disposals.length,
      kg: round(disposedKg),
      // Share kept out of landfill (recycled or composted).
      divertedPercent: disposedKg ? Math.round((diverted / disposedKg) * 100) : null,
      byKind: group(disposals, (d) => d.kind).map(([kind, list]) => ({ kind, loads: list.length, kg: round(list.reduce((s, d) => s + d.weightKg, 0)) })),
      bySite: group(disposals, (d) => d.site)
        .map(([site, list]) => ({ site, kind: list[0].kind, loads: list.length, kg: round(list.reduce((s, d) => s + d.weightKg, 0)) }))
        .sort((a, b) => b.kg - a.kg),
    },
  })
})
