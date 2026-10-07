import { addDays, toDay, ymd } from "./dates.ts"
import { prisma } from "./db.ts"
import { HttpError } from "./http.ts"

// Each area can cap how many pickups it takes per day, so collectors aren't overbooked.
// Plan pickups count toward the cap but are never refused (they were paid for in advance).

const pickupTypes = ["INSTANT_PICKUP", "PLAN_PICKUP"] as const

/** Pickups booked per day in an area, for the days in [from, from + days). */
async function bookings(areaId: string, from: Date, days: number) {
  const rows = await prisma.order.groupBy({
    by: ["scheduledDate"],
    where: {
      areaId,
      type: { in: [...pickupTypes] },
      status: { not: "CANCELLED" },
      scheduledDate: { gte: from, lt: addDays(from, days) },
    },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [ymd(r.scheduledDate), r._count._all]))
}

const label = (day: string) =>
  toDay(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

/** Refuses a booking on a day the area is full. `ignoreOrderId`: an order being moved doesn't count against itself. */
export async function assertRoom(areaId: string | null, day: string, ignoreOrderId?: string) {
  if (!areaId) return
  const area = await prisma.serviceArea.findUnique({ where: { id: areaId } })
  if (!area?.dailyCapacity) return
  const booked = await prisma.order.count({
    where: {
      areaId,
      type: { in: [...pickupTypes] },
      status: { not: "CANCELLED" },
      scheduledDate: toDay(day),
      ...(ignoreOrderId ? { id: { not: ignoreOrderId } } : {}),
    },
  })
  if (booked >= area.dailyCapacity) {
    throw new HttpError(409, `We're fully booked in ${area.name} on ${label(day)}. Please choose another day.`)
  }
}

/** The first day from `day` (within a week) with room, for "as soon as possible" bookings. */
export async function firstDayWithRoom(areaId: string | null, day: string): Promise<string> {
  if (!areaId) return day
  const area = await prisma.serviceArea.findUnique({ where: { id: areaId } })
  if (!area?.dailyCapacity) return day
  const booked = await bookings(areaId, toDay(day), 7)
  for (let i = 0; i < 7; i++) {
    const candidate = ymd(addDays(toDay(day), i))
    if ((booked.get(candidate) ?? 0) < area.dailyCapacity) return candidate
  }
  throw new HttpError(409, `We're fully booked in ${area.name} for the next week. Please contact support.`)
}

/** Days in the next `days` with no room left, so the app can grey them out. */
export async function fullDays(areaId: string, from: Date, days: number): Promise<string[]> {
  const area = await prisma.serviceArea.findUnique({ where: { id: areaId } })
  if (!area?.dailyCapacity) return []
  const booked = await bookings(areaId, from, days)
  return [...booked].filter(([, n]) => n >= area.dailyCapacity!).map(([day]) => day)
}
