import { Router } from "express"
import { z } from "zod"
import { currentCollector, requireApprovedCollector, requireCollector, requireUser } from "../auth.ts"
import { addDays, startOfLagosDay, today } from "../dates.ts"
import { prisma } from "../db.ts"
import type { Collector } from "../generated/prisma/client.ts"
import { HttpError } from "../http.ts"
import { events } from "../events.ts"
import { distanceKm } from "../areas.ts"
import { earningsSummary, extraBagsCharge, payFor } from "../earnings.ts"
import { collectorJob } from "../serializers.ts"
import { bagsDelivered } from "../stock.ts"
import { imageUpload, looksLikeImage, saveImage } from "../storage.ts"

// The collector app: a driver's own jobs, and what they record on each one.
export const collectorRouter = Router()
collectorRouter.use("/collector", requireUser, requireCollector)
collectorRouter.use("/collector/jobs", requireApprovedCollector)

const jobInclude = { user: { select: { name: true, phone: true } } } as const

/** A job assigned to this collector that is still open. */
async function openJob(id: string | string[], collector: Collector) {
  const job = await prisma.order.findFirst({ where: { id: String(id), collectorId: collector.id }, include: jobInclude })
  if (!job) throw new HttpError(404, "Job not found.")
  if (job.status !== "ASSIGNED") throw new HttpError(409, "This job is already closed.")
  return job
}

/** Closes a job, but only if it is still open and still this collector's. */
async function close(id: string, collector: Collector, data: Parameters<typeof prisma.order.updateMany>[0]["data"]) {
  const updated = await prisma.order.updateMany({
    where: { id, collectorId: collector.id, status: "ASSIGNED" },
    data: { ...data, completedAt: new Date() },
  })
  if (updated.count === 0) throw new HttpError(409, "This job was just changed by the office. Refresh and try again.")
  return prisma.order.findUniqueOrThrow({ where: { id }, include: jobInclude })
}

collectorRouter.get("/collector/me", (req, res) => {
  const c = currentCollector(req)
  res.json({
    collector: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      area: c.area,
      status: c.approvedAt ? "APPROVED" : "PENDING",
      onDuty: c.onDuty,
      onDutySince: c.onDutySince,
    },
  })
})

// "I'm working": on-duty collectors are the ones staff (and auto-assign) give jobs to.
collectorRouter.patch("/collector/me", requireApprovedCollector, async (req, res) => {
  const { onDuty } = z.object({ onDuty: z.boolean() }).parse(req.body)
  const c = currentCollector(req)
  const updated = await prisma.collector.update({
    where: { id: c.id },
    data: { onDuty, onDutySince: onDuty ? (c.onDuty ? c.onDutySince : new Date()) : null },
  })
  res.json({ onDuty: updated.onDuty, onDutySince: updated.onDutySince })
})

// Today's open jobs (and any overdue), in a sensible driving order from where the collector is.
collectorRouter.get("/collector/route", requireApprovedCollector, async (req, res) => {
  const from = z
    .object({ lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() })
    .parse(req.query)
  const jobs = await prisma.order.findMany({
    where: { collectorId: currentCollector(req).id, status: "ASSIGNED", scheduledDate: { lte: today() } },
    include: jobInclude,
  })
  const ordered = planRoute(jobs, from.lat !== undefined && from.lng !== undefined ? { lat: from.lat, lng: from.lng } : null)
  res.json({
    stops: ordered.map(({ job, legKm }) => ({ ...collectorJob(job), legKm: legKm === null ? null : Math.round(legKm * 10) / 10 })),
    totalKm: Math.round(ordered.reduce((sum, s) => sum + (s.legKm ?? 0), 0) * 10) / 10,
  })
})

collectorRouter.get("/collector/earnings", requireApprovedCollector, async (req, res) => {
  res.json(await earningsSummary(currentCollector(req).id))
})

collectorRouter.get("/collector/jobs", async (req, res) => {
  const collector = currentCollector(req)
  const startOfToday = startOfLagosDay(today())
  const [open, history, doneToday, doneThisWeek, ratings] = await Promise.all([
    prisma.order.findMany({
      where: { collectorId: collector.id, status: "ASSIGNED", scheduledDate: { lte: addDays(today(), 60) } },
      include: jobInclude,
      orderBy: [{ scheduledDate: "asc" }, { asap: "desc" }, { createdAt: "asc" }],
      take: 300,
    }),
    prisma.order.findMany({
      where: {
        collectorId: collector.id,
        status: { in: ["COMPLETED", "INCOMPLETE"] },
        completedAt: { gte: addDays(startOfToday, -30) },
      },
      include: jobInclude,
      orderBy: { completedAt: "desc" },
      take: 100,
    }),
    prisma.order.count({ where: { collectorId: collector.id, status: "COMPLETED", completedAt: { gte: startOfToday } } }),
    prisma.order.count({
      where: { collectorId: collector.id, status: "COMPLETED", completedAt: { gte: addDays(startOfToday, -6) } },
    }),
    // Customers' ratings over the last 90 days.
    prisma.order.aggregate({
      where: { collectorId: collector.id, ratedAt: { gte: addDays(startOfToday, -90) } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ])
  res.json({
    open: open.map(collectorJob),
    history: history.map(collectorJob),
    stats: {
      doneToday,
      doneThisWeek,
      rating: ratings._count.rating ? Math.round(ratings._avg.rating! * 10) / 10 : null,
      ratings: ratings._count.rating,
    },
  })
})

collectorRouter.get("/collector/jobs/:id", async (req, res) => {
  const job = await prisma.order.findFirst({
    where: { id: String(req.params.id), collectorId: currentCollector(req).id },
    include: jobInclude,
  })
  if (!job) throw new HttpError(404, "Job not found.")
  res.json({ job: collectorJob(job) })
})

// Tells the customer the collector is on the way.
collectorRouter.post("/collector/jobs/:id/on-the-way", async (req, res) => {
  const collector = currentCollector(req)
  const job = await openJob(req.params.id, collector)
  const marked = await prisma.order.updateMany({
    where: { id: job.id, collectorId: collector.id, status: "ASSIGNED", onTheWayAt: null },
    data: { onTheWayAt: new Date() },
  })
  if (marked.count) await events.onTheWay(job)
  res.json({ job: collectorJob(await prisma.order.findUniqueOrThrow({ where: { id: job.id }, include: jobInclude })) })
})

const completeSchema = z.object({
  note: z.string().trim().max(500).optional(),
  // Bags actually collected (pickups). Sent as a form field, so it arrives as text.
  bags: z.coerce.number().int().min(0).max(200).optional(),
  // The customer paid for extra bags in cash there and then.
  extraPaidCash: z.preprocess((v) => v === true || v === "true", z.boolean()).optional(),
  // Weighed on the truck's scale, if there is one.
  weightKg: z.coerce.number().min(0).max(20000).optional(),
})

// Done. Optionally with a photo (multipart field "proof"), a note, and the bags collected.
collectorRouter.post("/collector/jobs/:id/complete", imageUpload.single("proof"), async (req, res) => {
  const collector = currentCollector(req)
  const { note, bags, extraPaidCash, weightKg } = completeSchema.parse(req.body ?? {})
  const job = await openJob(req.params.id, collector)
  const bagsCollected = job.type === "WASTE_BAGS" ? null : (bags ?? job.quantity)
  const extraAmount = extraBagsCharge(job, bagsCollected)

  let proofPhotoUrl: string | undefined
  if (req.file) {
    if (!looksLikeImage(req.file.buffer)) throw new HttpError(400, "That file is not a valid image.")
    proofPhotoUrl = await saveImage(req.file, job.reference, "proof")
  }
  const done = await close(job.id, collector, {
    status: "COMPLETED",
    collectorNote: note || null,
    proofPhotoUrl,
    bagsCollected,
    weightKg: job.type === "WASTE_BAGS" ? null : (weightKg ?? null),
    extraAmount,
    ...(extraAmount && extraPaidCash ? { extraPaidAt: new Date(), extraPaymentMethod: "CASH" as const } : {}),
    collectorPay: payFor(job, bagsCollected),
  })
  await events.completed(done)
  await bagsDelivered(done)
  if (extraAmount && !extraPaidCash) await events.extraBagsDue(done)
  res.json({ job: collectorJob(done) })
})

// Couldn't do it (customer away, gate locked...). The reason is shown to the customer and the office.
collectorRouter.post("/collector/jobs/:id/incomplete", async (req, res) => {
  const collector = currentCollector(req)
  const { reason } = z
    .object({ reason: z.string().trim().min(3, "Say why the job couldn't be done.").max(500) })
    .parse(req.body)
  const job = await openJob(req.params.id, collector)
  const closed = await close(job.id, collector, { status: "INCOMPLETE", collectorNote: reason })
  await events.notCompleted(closed, reason, true)
  res.json({ job: collectorJob(closed) })
})

type Point = { lat: number; lng: number }

/** Nearest stop next, starting from the collector (or the first pinned job). Unpinned jobs go last. */
function planRoute<T extends { lat: number | null; lng: number | null; asap: boolean; scheduledDate: Date }>(jobs: T[], start: Point | null) {
  const pinned = jobs.filter((j) => j.lat !== null && j.lng !== null)
  const unpinned = jobs.filter((j) => j.lat === null || j.lng === null)
  const route: { job: T; legKm: number | null }[] = []
  let here = start
  const left = [...pinned]
  while (left.length) {
    let best = 0
    if (here) {
      let bestKm = Infinity
      left.forEach((j, i) => {
        const km = distanceKm(here!, { lat: j.lat!, lng: j.lng! })
        if (km < bestKm) [bestKm, best] = [km, i]
      })
    }
    const [next] = left.splice(best, 1)
    const at = { lat: next.lat!, lng: next.lng! }
    route.push({ job: next, legKm: here ? distanceKm(here, at) : null })
    here = at
  }
  return [...route, ...unpinned.map((job) => ({ job, legKm: null }))]
}
