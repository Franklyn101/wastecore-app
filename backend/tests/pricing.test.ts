import request from "supertest"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { prisma } from "../src/db.ts"
import { DEFAULT_PRICING } from "../src/pricing.ts"
import { resetDatabase, verifyPhone, YENAGOA } from "./helpers.ts"

const app = createApp()
const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
type Auth = Record<string, string>

beforeEach(resetDatabase)
afterAll(() => prisma.$disconnect())

async function register(phone: string, staffRole?: "OWNER" | "STAFF"): Promise<Auth> {
  const res = await request(app).post("/auth/register").send({ name: "Tari", phone, password: "password123" })
  await verifyPhone(res.body.user.id)
  if (staffRole) await prisma.user.update({ where: { id: res.body.user.id }, data: { role: "ADMIN", staffRole } })
  return { Authorization: `Bearer ${res.body.token}` }
}

describe("pricing settings", () => {
  it("lets the main admin change prices, and new orders use them", async () => {
    const owner = await register("08090000001", "OWNER")
    const staff = await register("08090000002", "STAFF")
    const customer = await register("08031112222")

    const seen = await request(app).get("/admin/pricing").set(staff)
    expect(seen.body.pricing).toEqual(DEFAULT_PRICING)
    expect(seen.body.plans.map((p: { id: string }) => p.id)).toContain("weekly_1")
    expect((await request(app).get("/admin/pricing").set(customer)).status).toBe(403)

    const changed = structuredClone(DEFAULT_PRICING)
    changed.scheduled.firstBags = 700
    changed.plans.weekly_1.price = 7000
    expect((await request(app).put("/admin/pricing").set(staff).send(changed)).status).toBe(403)
    const saved = await request(app).put("/admin/pricing").set(owner).send(changed)
    expect(saved.status).toBe(200)
    expect(saved.body.pricing.scheduled.firstBags).toBe(700)

    const order = await request(app)
      .post("/orders")
      .set(customer)
      .send({ type: "INSTANT_PICKUP", ...YENAGOA, address: "Opolo", wasteType: "Mixed", bags: 3, pickupDate: tomorrow })
    expect(order.body.order.amount).toBe(2100)
    const catalog = (await request(app).get("/catalog")).body
    expect(catalog.pickupPricing.scheduled.firstBags).toBe(700)
    expect(catalog.plans.find((p: { id: string }) => p.id === "weekly_1").price).toBe(7000)

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "pricing.update" } })
    expect(log.summary).toContain("scheduled.firstBags 650 → 700")
    expect(log.summary).toContain("plans.weekly_1.price 6000 → 7000")
  })

  it("refuses prices that don't make sense", async () => {
    const owner = await register("08090000001", "OWNER")
    const bad = (change: (p: typeof DEFAULT_PRICING) => void) => {
      const p = structuredClone(DEFAULT_PRICING)
      change(p)
      return request(app).put("/admin/pricing").set(owner).send(p)
    }
    expect((await bad((p) => (p.instant.firstBags = -1))).status).toBe(400)
    expect((await bad((p) => (p.scheduled.extraBag = 12.5))).status).toBe(400)
    expect((await bad((p) => (p.tierBags = 0))).status).toBe(400)
    expect((await bad((p) => (p.plans.gold = { price: 1000, bagsPerPickup: 2 }))).status).toBe(400)
    expect((await bad((p) => (p.scheduled.minimum = 50_000))).status).toBe(400)
  })
})
