// Calendar-day arithmetic. Dates are JS Dates at UTC midnight, matching
// Postgres DATE columns, so no timezone shifts creep in.
import type { BillingPeriod } from "./catalog.ts"
import { todayInLagos } from "./validation.ts"

const DAY = 86_400_000

export const toDay = (ymd: string) => new Date(`${ymd}T00:00:00Z`)
export const ymd = (date: Date) => date.toISOString().slice(0, 10)
export const today = () => toDay(todayInLagos())
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY)
export const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY)
/** The instant a Lagos calendar day starts (Lagos is UTC+1 all year). */
export const startOfLagosDay = (day: Date) => new Date(day.getTime() - 3_600_000)
export const maxDay = (a: Date, b: Date) => (a > b ? a : b)

/** Start of the next billing period. Month periods keep the day of month, clamped (31 Jan -> 28 Feb). */
export function addPeriod(start: Date, period: BillingPeriod): Date {
  if ("weeks" in period) return addDays(start, period.weeks * 7)
  const y = start.getUTCFullYear()
  const m = start.getUTCMonth() + period.months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay)))
}

/**
 * Pickup days in [start, end) for a plan with `perWeek` pickups, spread evenly
 * through each week from the start day: 2/week -> days 0 and 3, 3/week -> 0, 2, 4.
 */
export function pickupDates(start: Date, end: Date, perWeek: number): Date[] {
  const offsets = Array.from({ length: perWeek }, (_, i) => Math.floor((i * 7) / perWeek))
  const dates: Date[] = []
  for (let week = 0; ; week++) {
    const weekStart = addDays(start, week * 7)
    if (weekStart >= end) return dates
    for (const offset of offsets) {
      const day = addDays(weekStart, offset)
      if (day < end) dates.push(day)
    }
  }
}
