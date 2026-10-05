import { z } from "zod"

/**
 * Normalizes a Nigerian phone number to E.164 (+234XXXXXXXXXX).
 * Accepts 08012345678, 8012345678, 2348012345678 and +234 801 234 5678.
 * Returns null when the input is not a valid Nigerian mobile number.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, "").replace(/^\+/, "")
  let local: string
  if (/^234\d{10}$/.test(digits)) local = digits.slice(3)
  else if (/^0\d{10}$/.test(digits)) local = digits.slice(1)
  else if (/^\d{10}$/.test(digits)) local = digits
  else return null
  return /^[789][01]\d{8}$/.test(local) ? `+234${local}` : null
}

export const phoneSchema = z
  .string()
  .transform((value, ctx) => {
    const phone = normalizePhone(value)
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Nigerian phone number, e.g. 08012345678." })
      return z.NEVER
    }
    return phone
  })

/** Today's date in Lagos as YYYY-MM-DD. Pickups are booked in local time. */
export function todayInLagos(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now)
}

export const futureDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, "That date does not exist.")
  .refine((value) => value >= todayInLagos(), "Choose today or a later date.")

export const trimmed = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be at most ${max} characters.`)
