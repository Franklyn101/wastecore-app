import { Router } from "express"
import {
  BAG_SIZES,
  INSTANT_PICKUP,
  MAX_BAG_PACKS,
  SUPPORT_CATEGORIES,
  UPGRADE_PLANS,
  WASTE_TYPES,
  WEEKLY_PLANS,
} from "../catalog.ts"
import { config } from "../config.ts"

export const catalogRouter = Router()

catalogRouter.get("/catalog", (_req, res) => {
  res.json({
    instantPickup: INSTANT_PICKUP,
    weeklyPlans: WEEKLY_PLANS,
    upgradePlans: UPGRADE_PLANS,
    bagSizes: BAG_SIZES,
    maxBagPacks: MAX_BAG_PACKS,
    wasteTypes: WASTE_TYPES,
    supportCategories: SUPPORT_CATEGORIES,
    bank: config.bank,
  })
})
