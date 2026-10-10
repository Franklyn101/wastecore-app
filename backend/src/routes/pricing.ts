import { Router } from "express"
import { audit } from "../audit.ts"
import { currentUser, requireAdmin, requireOwner, requireUser } from "../auth.ts"
import { PLAN_IDS, plans } from "../catalog.ts"
import { HttpError } from "../http.ts"
import { DEFAULT_PRICING, pricing, pricingSchema, savePricing } from "../pricing.ts"

// Prices and collector pay. All staff can see them; only the main admin can change them.
export const pricingRouter = Router()
pricingRouter.use("/admin/pricing", requireUser, requireAdmin)

function view() {
  return { pricing: pricing(), defaults: DEFAULT_PRICING, plans: plans().map((p) => ({ id: p.id, name: p.name, periodLabel: p.periodLabel, pickupsPerWeek: p.pickupsPerWeek })) }
}

pricingRouter.get("/admin/pricing", (_req, res) => {
  res.json(view())
})

pricingRouter.put("/admin/pricing", requireOwner, async (req, res) => {
  const body = pricingSchema.parse(req.body)
  const unknown = Object.keys(body.plans).filter((id) => !PLAN_IDS.includes(id))
  if (unknown.length) throw new HttpError(400, `Unknown plan: ${unknown.join(", ")}.`)
  for (const speed of ["scheduled", "instant"] as const) {
    if (body[speed].minimum > body[speed].firstBags * body.tierBags + body[speed].extraBag * 20) {
      throw new HttpError(400, `The ${speed} minimum is more than a full pickup costs.`)
    }
  }
  const before = pricing()
  await savePricing({ ...body, plans: { ...before.plans, ...body.plans } }, currentUser(req).id)
  await audit(currentUser(req), "pricing.update", { type: "pricing" }, `Changed prices: ${describeChanges(before, pricing()) || "no change"}`)
  res.json(view())
})

/** "instant.firstBags 1000 → 1200, ..." for the activity log. */
function describeChanges(before: unknown, after: unknown, path = ""): string {
  if (typeof before !== "object" || before === null || typeof after !== "object" || after === null) {
    return before === after ? "" : `${path} ${String(before)} → ${String(after)}`
  }
  return Object.keys(after)
    .map((key) => describeChanges((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], path ? `${path}.${key}` : key))
    .filter(Boolean)
    .join(", ")
}
