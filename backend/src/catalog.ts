// Everything WasteCore sells. The app reads it from GET /catalog and the server prices orders
// and subscriptions from it. Pickup and plan prices are in pricing.ts, where the main admin
// can change them in the app, so a price change never needs an app release.

import { pricing } from "./pricing.ts"

/** One-off pickups. Prices are in pricing.ts: "Pick a date" is scheduled, "As soon as possible" is instant. */
export const INSTANT_PICKUP = {
  id: "instant",
  name: "Instant pickup",
  description: "We come as soon as possible, just for you.",
  maxBags: 20,
  maxWastecoreBags: 20,
  // "As soon as possible" orders booked before this hour (Lagos time) are picked up the same day;
  // later ones the next day.
  asapCutoffHour: 17,
} as const

export const SCHEDULED_PICKUP = {
  id: "scheduled",
  name: "Scheduled pickup",
  description: "Pick a day; we come with the other pickups in your area.",
} as const

export type BillingPeriod = { weeks: number } | { months: number }

export type Plan = {
  id: string
  group: "weekly" | "premium"
  name: string
  pickupsPerWeek: number
  /** Charged once per billing period. */
  price: number
  /** Bags included in each pickup; more are charged as extra bags. */
  bagsPerPickup: number
  period: BillingPeriod
  periodLabel: string
  /** Shown next to the price, e.g. the per-week price. */
  priceNote?: string
  features: string[]
}

type PlanDefinition = Omit<Plan, "price" | "bagsPerPickup" | "priceNote" | "features"> & { perks?: string[] }

// Weekly plans are billed four weeks at a time; premium plans monthly.
// Prices and bag limits are in pricing.ts, so the main admin can change them.
const PLAN_DEFINITIONS: PlanDefinition[] = [
  { id: "weekly_1", group: "weekly", name: "1 pickup/week", pickupsPerWeek: 1, period: { weeks: 4 }, periodLabel: "every 4 weeks" },
  { id: "weekly_2", group: "weekly", name: "2 pickups/week", pickupsPerWeek: 2, period: { weeks: 4 }, periodLabel: "every 4 weeks" },
  { id: "weekly_3", group: "weekly", name: "3 pickups/week", pickupsPerWeek: 3, period: { weeks: 4 }, periodLabel: "every 4 weeks" },
  { id: "basic", group: "premium", name: "Basic", pickupsPerWeek: 1, period: { months: 1 }, periodLabel: "per month" },
  { id: "standard", group: "premium", name: "Standard", pickupsPerWeek: 3, period: { months: 1 }, periodLabel: "per month", perks: ["Priority support"] },
  {
    id: "premium",
    group: "premium",
    name: "Premium",
    pickupsPerWeek: 7,
    period: { months: 1 },
    periodLabel: "per month",
    perks: ["Priority support", "The same collector each time"],
  },
]

const money = (n: number) => `₦${n.toLocaleString("en-NG")}`

function withPrices(def: PlanDefinition): Plan {
  const p = pricing()
  const { price, bagsPerPickup } = p.plans[def.id]
  const often = def.pickupsPerWeek === 7 ? "Daily pickup" : `${def.pickupsPerWeek} pickup${def.pickupsPerWeek === 1 ? "" : "s"} every week`
  const { perks = [], ...plan } = def
  return {
    ...plan,
    price,
    bagsPerPickup,
    priceNote: "weeks" in def.period ? `${money(Math.round(price / def.period.weeks))}/week` : undefined,
    features: [often, `Up to ${bagsPerPickup} bags each pickup`, `Extra bags ${money(p.scheduled.extraBag)} each`, ...perks],
  }
}

/** The plans with today's prices. */
export function plans(): Plan[] {
  return PLAN_DEFINITIONS.map(withPrices)
}

export const PLAN_IDS = PLAN_DEFINITIONS.map((p) => p.id)

export const BAG_SIZES = [
  { id: "small", name: "Small", packSize: 10, price: 500 },
  { id: "medium", name: "Medium", packSize: 10, price: 900 },
  { id: "large", name: "Large", packSize: 10, price: 1500 },
] as const

export const MAX_BAG_PACKS = 100

export const WASTE_TYPES = ["Organic", "Plastic", "Paper", "Fabric", "Mixed"] as const

export const SUPPORT_CATEGORIES = [
  "Missed Pickup",
  "Billing Issue",
  "Driver Complaint",
  "Change Pickup Date",
  "Other",
] as const

// Waste that doesn't fit in bags, priced by staff after seeing a description and photo.
export const SPECIAL_WASTE_CATEGORIES = [
  "Building rubble",
  "Furniture or bulky items",
  "Electronics (e-waste)",
  "Garden waste",
  "Event clean-up",
  "Shop or office clear-out",
  "Other",
] as const

// When in the day a pickup happens. Customers may also leave it as "any time".
export const TIME_WINDOWS = [
  { id: "MORNING", label: "Morning", hours: "8am to 12pm" },
  { id: "AFTERNOON", label: "Afternoon", hours: "12pm to 5pm" },
] as const

export type BagSizeId = (typeof BAG_SIZES)[number]["id"]

export const planIds = PLAN_IDS as [string, ...string[]]
export const bagSizeIds = BAG_SIZES.map((b) => b.id) as [BagSizeId, ...BagSizeId[]]

export const findBagSize = (id: string) => BAG_SIZES.find((b) => b.id === id)

export function findPlan(id: string): Plan {
  const def = PLAN_DEFINITIONS.find((p) => p.id === id)
  if (!def) throw new Error(`Unknown plan ${id}`)
  return withPrices(def)
}

/** Human-readable name for an order's plan key, e.g. "weekly_2" -> "2 pickups/week". */
export function planLabel(plan: string): string {
  if (plan === INSTANT_PICKUP.id) return INSTANT_PICKUP.name
  if (plan === SCHEDULED_PICKUP.id) return SCHEDULED_PICKUP.name
  if (plan === "special") return "Special pickup"
  const match = PLAN_DEFINITIONS.find((p) => p.id === plan) ?? BAG_SIZES.find((b) => b.id === plan)
  return match?.name ?? plan
}
