import { Router } from "express"
import {
  BAG_SIZES,
  INSTANT_PICKUP,
  plans,
  SCHEDULED_PICKUP,
  MAX_BAG_PACKS,
  SUPPORT_CATEGORIES,
  SPECIAL_WASTE_CATEGORIES,
  TIME_WINDOWS,
  WASTE_TYPES,
} from "../catalog.ts"
import { config } from "../config.ts"
import { paystackEnabled } from "../paystack.ts"
import { pricing } from "../pricing.ts"

export const catalogRouter = Router()

catalogRouter.get("/catalog", (_req, res) => {
  res.json({
    instantPickup: INSTANT_PICKUP,
    scheduledPickup: SCHEDULED_PICKUP,
    // What customers pay. Collector pay isn't public.
    pickupPricing: (({ scheduled, instant, tierBags, wastecoreBag, wastedTripFee }) => ({ scheduled, instant, tierBags, wastecoreBag, wastedTripFee }))(pricing()),
    plans: plans(),
    bagSizes: BAG_SIZES,
    maxBagPacks: MAX_BAG_PACKS,
    wasteTypes: WASTE_TYPES,
    timeWindows: TIME_WINDOWS,
    specialWasteCategories: SPECIAL_WASTE_CATEGORIES,
    supportCategories: SUPPORT_CATEGORIES,
    bank: config.bank,
    onlinePayments: paystackEnabled(),
  })
})
