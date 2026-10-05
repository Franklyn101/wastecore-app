// Everything WasteCore sells, with prices in naira. This is the single source
// of truth: the app reads it from GET /catalog and the server prices orders
// from it, so a price change here never needs an app release.

export const INSTANT_PICKUP = {
  id: "instant",
  name: "Instant Pickup",
  description: "One-off pickup on the date you choose.",
  price: 2000,
} as const

export const WEEKLY_PLANS = [
  { id: "weekly_1", name: "1 pickup/week", pickupsPerWeek: 1, price: 1250 },
  { id: "weekly_2", name: "2 pickups/week", pickupsPerWeek: 2, price: 2500 },
  { id: "weekly_3", name: "3 pickups/week", pickupsPerWeek: 3, price: 3750 },
] as const

export const UPGRADE_PLANS = [
  { id: "basic", name: "Basic", price: 12000, features: ["Weekly pickup", "Up to 5 bags"] },
  {
    id: "standard",
    name: "Standard",
    price: 20000,
    features: ["3x/week pickup", "Up to 15 bags", "Priority support"],
  },
  {
    id: "premium",
    name: "Premium",
    price: 35000,
    features: ["Daily pickup", "Unlimited bags", "Dedicated driver", "Free bags monthly"],
  },
] as const

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

export type WeeklyPlanId = (typeof WEEKLY_PLANS)[number]["id"]
export type UpgradePlanId = (typeof UPGRADE_PLANS)[number]["id"]
export type BagSizeId = (typeof BAG_SIZES)[number]["id"]

export const weeklyPlanIds = WEEKLY_PLANS.map((p) => p.id) as [WeeklyPlanId, ...WeeklyPlanId[]]
export const upgradePlanIds = UPGRADE_PLANS.map((p) => p.id) as [UpgradePlanId, ...UpgradePlanId[]]
export const bagSizeIds = BAG_SIZES.map((b) => b.id) as [BagSizeId, ...BagSizeId[]]

/** Human-readable name for an order's plan key, e.g. "weekly_2" -> "2 pickups/week". */
export function planLabel(plan: string): string {
  if (plan === INSTANT_PICKUP.id) return INSTANT_PICKUP.name
  const match =
    WEEKLY_PLANS.find((p) => p.id === plan) ??
    UPGRADE_PLANS.find((p) => p.id === plan) ??
    BAG_SIZES.find((b) => b.id === plan)
  return match?.name ?? plan
}
