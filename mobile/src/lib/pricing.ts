import type { PickupPricing } from "./types"

// The same sums the server does (backend/src/pricing.ts), to show prices before booking.
// The server always works out what's actually charged.

/** What a one-off pickup of `bags` bags costs, before any WasteCore bags. */
export function pickupPrice(bags: number, instant: boolean, p: PickupPricing): number {
  const t = instant ? p.instant : p.scheduled
  const tiered = Math.min(bags, p.tierBags) * t.firstBags + Math.max(bags - p.tierBags, 0) * t.extraBag
  return Math.max(tiered, t.minimum)
}

/** What a customer owes for bags beyond the `booked` ones on a one-off pickup. */
export function extraBagsPrice(booked: number, collected: number, instant: boolean, p: PickupPricing): number {
  if (collected <= booked) return 0
  return Math.max(0, pickupPrice(collected, instant, p) - pickupPrice(booked, instant, p))
}
