// Everything WasteCore sells, with prices in naira. This is the single source
// of truth: the app reads it from GET /catalog and the server prices orders
// and subscriptions from it, so a price change here never needs an app release.

export const INSTANT_PICKUP = {
  id: "instant",
  name: "Instant Pickup",
  description: "One-time pickup, no subscription. Priced per bag.",
  pricePerBag: 700,
  maxBags: 20,
  // "As soon as possible" orders booked before this hour (Lagos time) are picked up the same day;
  // later ones the next day.
  asapCutoffHour: 17,
} as const

export type BillingPeriod = { weeks: number } | { months: number }

export type Plan = {
  id: string
  group: "weekly" | "premium"
  name: string
  pickupsPerWeek: number
  /** Charged once per billing period. */
  price: number
  period: BillingPeriod
  periodLabel: string
  /** Shown next to the price, e.g. the bot's per-week price. */
  priceNote?: string
  features: string[]
}

// Weekly plans are priced per week, as in the WhatsApp bot, and billed four weeks at a time.
// Premium plans (the bot's "upgrade" plans) are billed monthly.
export const PLANS: Plan[] = [
  {
    id: "weekly_1",
    group: "weekly",
    name: "1 pickup/week",
    pickupsPerWeek: 1,
    price: 1250 * 4,
    period: { weeks: 4 },
    periodLabel: "every 4 weeks",
    priceNote: "₦1,250/week",
    features: ["1 pickup every week"],
  },
  {
    id: "weekly_2",
    group: "weekly",
    name: "2 pickups/week",
    pickupsPerWeek: 2,
    price: 2500 * 4,
    period: { weeks: 4 },
    periodLabel: "every 4 weeks",
    priceNote: "₦2,500/week",
    features: ["2 pickups every week"],
  },
  {
    id: "weekly_3",
    group: "weekly",
    name: "3 pickups/week",
    pickupsPerWeek: 3,
    price: 3750 * 4,
    period: { weeks: 4 },
    periodLabel: "every 4 weeks",
    priceNote: "₦3,750/week",
    features: ["3 pickups every week"],
  },
  {
    id: "basic",
    group: "premium",
    name: "Basic",
    pickupsPerWeek: 1,
    price: 12000,
    period: { months: 1 },
    periodLabel: "per month",
    features: ["Weekly pickup", "Up to 5 bags"],
  },
  {
    id: "standard",
    group: "premium",
    name: "Standard",
    pickupsPerWeek: 3,
    price: 20000,
    period: { months: 1 },
    periodLabel: "per month",
    features: ["3x/week pickup", "Up to 15 bags", "Priority support"],
  },
  {
    id: "premium",
    group: "premium",
    name: "Premium",
    pickupsPerWeek: 7,
    price: 35000,
    period: { months: 1 },
    periodLabel: "per month",
    features: ["Daily pickup", "Unlimited bags", "Dedicated driver", "Free bags monthly"],
  },
]

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

// What collectors earn per completed job, in naira. Change these to match your agreement with drivers.
export const COLLECTOR_PAY = {
  pickup: 300, // each pickup (instant or plan)
  perBag: 50, // plus this for every bag collected
  bagDelivery: 200, // delivering a pack order
} as const

// When in the day a pickup happens. Customers may also leave it as "any time".
export const TIME_WINDOWS = [
  { id: "MORNING", label: "Morning", hours: "8am to 12pm" },
  { id: "AFTERNOON", label: "Afternoon", hours: "12pm to 5pm" },
] as const

export type BagSizeId = (typeof BAG_SIZES)[number]["id"]

export const planIds = PLANS.map((p) => p.id) as [string, ...string[]]
export const bagSizeIds = BAG_SIZES.map((b) => b.id) as [BagSizeId, ...BagSizeId[]]

export function findPlan(id: string): Plan {
  const plan = PLANS.find((p) => p.id === id)
  if (!plan) throw new Error(`Unknown plan ${id}`)
  return plan
}

/** Human-readable name for an order's plan key, e.g. "weekly_2" -> "2 pickups/week". */
export function planLabel(plan: string): string {
  if (plan === INSTANT_PICKUP.id) return INSTANT_PICKUP.name
  const match = PLANS.find((p) => p.id === plan) ?? BAG_SIZES.find((b) => b.id === plan)
  return match?.name ?? plan
}
