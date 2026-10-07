import { Router } from "express"
import {
  BAG_SIZES,
  INSTANT_PICKUP,
  MAX_BAG_PACKS,
  SUPPORT_CATEGORIES,
  PLANS,
  SPECIAL_WASTE_CATEGORIES,
  TIME_WINDOWS,
  WASTE_TYPES,
} from "../catalog.ts"
import { config } from "../config.ts"
import { paystackEnabled } from "../paystack.ts"

export const catalogRouter = Router()

catalogRouter.get("/catalog", (_req, res) => {
  res.json({
    instantPickup: INSTANT_PICKUP,
    plans: PLANS,
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
