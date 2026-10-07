import { Router } from "express"
import { z } from "zod"
import { currentCollector, requireApprovedCollector, requireCollector, requireUser } from "../auth.ts"
import { addDays, startOfLagosDay, today } from "../dates.ts"
import { prisma } from "../db.ts"
import type { Collector } from "../generated/prisma/client.ts"
import { HttpError } from "../http.ts"
import { events } from "../events.ts"
import { collectorJob } from "../serializers.ts"
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
    collector: { id: c.id, name: c.name, phone: c.phone, area: c.area, status: c.approvedAt ? "APPROVED" : "PENDING" },
  })
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

// Done. Optionally with a photo (multipart field "proof") and a note.
collectorRouter.post("/collector/jobs/:id/complete", imageUpload.single("proof"), async (req, res) => {
  const collector = currentCollector(req)
  const { note } = z.object({ note: z.string().trim().max(500).optional() }).parse(req.body ?? {})
  const job = await openJob(req.params.id, collector)

  let proofPhotoUrl: string | undefined
  if (req.file) {
    if (!looksLikeImage(req.file.buffer)) throw new HttpError(400, "That file is not a valid image.")
    proofPhotoUrl = await saveImage(req.file, job.reference, "proof")
  }
  const done = await close(job.id, collector, { status: "COMPLETED", collectorNote: note || null, proofPhotoUrl })
  await events.completed(done)
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
