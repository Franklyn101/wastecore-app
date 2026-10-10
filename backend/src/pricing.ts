import { z } from "zod"
import { prisma } from "./db.ts"
import type { Prisma } from "./generated/prisma/client.ts"

// Prices and collector pay, in naira. The main admin can change them in the app (Pricing);
// these are the starting values. Orders keep the amount they were booked at.

const naira = (max: number) => z.number().int("Use whole naira.").min(0).max(max)

const speedPrices = z.object({
  /** Each of the first `tierBags` bags. */
  firstBags: naira(100_000),
  /** Each bag after that. */
  extraBag: naira(100_000),
  /** The least a pickup costs, however few bags. */
  minimum: naira(100_000),
})

const speedPay = z.object({ perStop: naira(100_000), perBag: naira(100_000) })

const planSettings = z.object({ price: naira(10_000_000).min(100), bagsPerPickup: z.number().int().min(1).max(50) })

export const pricingSchema = z.object({
  /** "Pick a date": grouped with other pickups in the area. */
  scheduled: speedPrices,
  /** "As soon as possible": a trip just for this customer. */
  instant: speedPrices,
  /** How many bags are charged at the first-bags price. */
  tierBags: z.number().int().min(1).max(50),
  /** A WasteCore bag the collector brings to the pickup. WasteCore keeps this. */
  wastecoreBag: naira(100_000),
  /** Charged when the collector comes and there's no waste or nobody home. */
  wastedTripFee: naira(100_000),
  collector: z.object({
    scheduled: speedPay,
    instant: speedPay,
    /** For each WasteCore bag handed to a customer. */
    perBagHandedOut: naira(100_000),
    /** For a wasted trip (whether or not the customer has paid the fee yet). */
    wastedTrip: naira(100_000),
    bagDelivery: naira(100_000),
    specialPickup: naira(1_000_000),
  }),
  plans: z.record(z.string(), planSettings),
})

export type Pricing = z.infer<typeof pricingSchema>

export const DEFAULT_PRICING: Pricing = {
  scheduled: { firstBags: 650, extraBag: 500, minimum: 1000 },
  instant: { firstBags: 1000, extraBag: 700, minimum: 1500 },
  tierBags: 3,
  wastecoreBag: 300,
  wastedTripFee: 500,
  collector: {
    scheduled: { perStop: 250, perBag: 300 },
    instant: { perStop: 400, perBag: 450 },
    perBagHandedOut: 50,
    wastedTrip: 500,
    bagDelivery: 200,
    specialPickup: 1500,
  },
  plans: {
    weekly_1: { price: 6000, bagsPerPickup: 3 },
    weekly_2: { price: 12000, bagsPerPickup: 3 },
    weekly_3: { price: 18000, bagsPerPickup: 3 },
    basic: { price: 12000, bagsPerPickup: 5 },
    standard: { price: 30000, bagsPerPickup: 5 },
    premium: { price: 65000, bagsPerPickup: 5 },
  },
}

const KEY = "pricing"
/** Other API servers pick up a change within this long. */
const MAX_AGE_MS = 15_000

let cached: Pricing = DEFAULT_PRICING
let loadedAt = 0

/** The prices in force. Kept fresh by `refreshPricing` (run before every request). */
export function pricing(): Pricing {
  return cached
}

/** Saved settings on top of the defaults, so a newly added setting always has a value. */
function withDefaults(saved: unknown): Pricing {
  const merged = { ...DEFAULT_PRICING, ...(saved as object) } as Pricing
  merged.collector = { ...DEFAULT_PRICING.collector, ...(merged.collector ?? {}) }
  merged.plans = { ...DEFAULT_PRICING.plans, ...(merged.plans ?? {}) }
  const parsed = pricingSchema.safeParse(merged)
  if (!parsed.success) {
    console.error("Saved pricing is invalid; using the defaults.", parsed.error.issues)
    return DEFAULT_PRICING
  }
  return parsed.data
}

export async function refreshPricing(force = false) {
  if (!force && Date.now() - loadedAt < MAX_AGE_MS) return
  const row = await prisma.setting.findUnique({ where: { key: KEY } })
  cached = row ? withDefaults(row.value) : DEFAULT_PRICING
  loadedAt = Date.now()
}

export async function savePricing(value: Pricing, userId: string) {
  const json = value as unknown as Prisma.InputJsonValue
  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: json, updatedById: userId },
    update: { value: json, updatedById: userId },
  })
  await refreshPricing(true)
}

/** Forget what's cached (tests reset the database underneath). */
export function resetPricingCache() {
  cached = DEFAULT_PRICING
  loadedAt = 0
}

/** What a one-off pickup of `bags` bags costs, before any WasteCore bags. */
export function pickupPrice(bags: number, instant: boolean, p = pricing()): number {
  const t = instant ? p.instant : p.scheduled
  const tiered = Math.min(bags, p.tierBags) * t.firstBags + Math.max(bags - p.tierBags, 0) * t.extraBag
  return Math.max(tiered, t.minimum)
}
