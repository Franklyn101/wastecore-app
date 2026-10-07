import { prisma } from "./db.ts"
import { events } from "./events.ts"
import type { Order } from "./generated/prisma/client.ts"

/**
 * Gives a paid, unassigned order to the on-duty collector in its area with the fewest jobs
 * that day, when the area has auto-assign on. Returns whether it was assigned.
 */
export async function autoAssign(order: Order): Promise<boolean> {
  if (order.status !== "PENDING" || order.collectorId || !order.areaId) return false
  const area = await prisma.serviceArea.findUnique({ where: { id: order.areaId } })
  if (!area?.autoAssign) return false

  const collectors = await prisma.collector.findMany({
    where: { serviceAreaId: area.id, active: true, onDuty: true, approvedAt: { not: null } },
    select: { id: true },
  })
  if (collectors.length === 0) return false
  const load = await prisma.order.groupBy({
    by: ["collectorId"],
    where: { collectorId: { in: collectors.map((c) => c.id) }, status: "ASSIGNED", scheduledDate: order.scheduledDate },
    _count: { _all: true },
  })
  const jobs = (id: string) => load.find((l) => l.collectorId === id)?._count._all ?? 0
  const pick = [...collectors].sort((a, b) => jobs(a.id) - jobs(b.id))[0]

  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: "PENDING", collectorId: null },
    data: { status: "ASSIGNED", collectorId: pick.id },
  })
  if (updated.count === 0) return false
  await events.collectorAssigned(await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
  return true
}

/** Runs auto-assign over every paid, unassigned pickup or delivery due by `until`. */
export async function autoAssignDue(until: Date): Promise<number> {
  const waiting = await prisma.order.findMany({
    where: { status: "PENDING", collectorId: null, scheduledDate: { lte: until }, area: { autoAssign: true } },
    orderBy: [{ scheduledDate: "asc" }, { asap: "desc" }, { createdAt: "asc" }],
    take: 500,
  })
  let assigned = 0
  for (const order of waiting) if (await autoAssign(order)) assigned++
  return assigned
}
