import request from "supertest"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { recordPaystackResult } from "../src/billing.ts"
import { prisma } from "../src/db.ts"
import type { PaystackTransaction } from "../src/paystack.ts"
import { resetDatabase, verifyPhone, YENAGOA } from "./helpers.ts"

const app = createApp()
const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
type Auth = Record<string, string>

beforeEach(resetDatabase)
afterAll(() => prisma.$disconnect())

async function register(phone: string, role?: "ADMIN"): Promise<Auth> {
  const res = await request(app).post("/auth/register").send({ name: "Ebi", phone, password: "password123" })
  await verifyPhone(res.body.user.id)
  if (role) await prisma.user.update({ where: { id: res.body.user.id }, data: { role } })
  return { Authorization: `Bearer ${res.body.token}` }
}

/** A customer, staff, and a signed-in collector with `count` assigned 2-bag pickups spread around Yenagoa. */
async function setup(count = 1) {
  const customer = await register("08012345678")
  const staff = await register("08099990000", "ADMIN")
  const c = await request(app).post("/admin/collectors").set(staff).send({ name: "Musa", phone: "07011112222", area: "Ekeki" })
  const collectorId = c.body.collector.id as string
  await request(app).put(`/admin/collectors/${collectorId}/login`).set(staff).send({ password: "musa-pass-123" })
  const login = await request(app).post("/auth/login").send({ phone: "07011112222", password: "musa-pass-123" })
  const collector = { Authorization: `Bearer ${login.body.token}` }

  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    // Each stop a little further east of the centre.
    const spot = { lat: YENAGOA.lat, lng: YENAGOA.lng + 0.01 * (count - i) }
    const o = await request(app)
      .post("/orders")
      .set(customer)
      .send({ type: "INSTANT_PICKUP", ...spot, address: `Stop ${i}`, wasteType: "Mixed", bags: 2, asap: true })
    await prisma.order.update({ where: { id: o.body.order.id }, data: { status: "PENDING", paymentMethod: "TRANSFER", paidAt: new Date() } })
    await request(app).patch(`/admin/orders/${o.body.order.id}`).set(staff).send({ collectorId })
    ids.push(o.body.order.id)
  }
  return { customer, staff, collector, collectorId, ids }
}

describe("bags collected", () => {
  it("charges the customer for extra bags and pays the collector per bag", async () => {
    const { customer, collector, ids } = await setup()
    const done = await request(app).post(`/collector/jobs/${ids[0]}/complete`).set(collector).field("bags", "4")
    expect(done.body.job).toMatchObject({ bagsCollected: 4, extraAmount: 1400, extraPaid: false, pay: 300 + 4 * 50 })

    const order = (await request(app).get(`/orders/${ids[0]}`).set(customer)).body.order
    expect(order).toMatchObject({ bagsCollected: 4, extraAmount: 1400, extraPaidAt: null })
    expect(await prisma.notification.count({ where: { title: "Extra bags collected" } })).toBe(1)

    // Paying the balance online marks it paid.
    const { userId } = await prisma.order.findUniqueOrThrow({ where: { id: ids[0] } })
    const payment = await prisma.payment.create({
      data: { reference: "PAY-BAL-1", userId, purpose: "ORDER_BALANCE", orderId: ids[0], amount: 1400 },
    })
    await recordPaystackResult(payment, { status: "success", amount: 140000, currency: "NGN", channel: "card", reference: "PAY-BAL-1" } as PaystackTransaction)
    const paid = (await request(app).get(`/orders/${ids[0]}`).set(customer)).body.order
    expect(paid.extraPaymentMethod).toBe("PAYSTACK")
    const history = (await request(app).get("/payments").set(customer)).body.payments
    expect(history.some((p: { description: string }) => p.description.startsWith("Extra bags"))).toBe(true)
  })

  it("records extra bags paid in cash, with no balance to pay", async () => {
    const { collector, ids } = await setup()
    const done = await request(app).post(`/collector/jobs/${ids[0]}/complete`).set(collector).field("bags", "3").field("extraPaidCash", "true")
    expect(done.body.job).toMatchObject({ extraAmount: 700, extraPaid: true })
    expect(await prisma.notification.count({ where: { title: "Extra bags collected" } })).toBe(0)
  })

  it("doesn't charge when fewer bags were collected", async () => {
    const { collector, ids } = await setup()
    const done = await request(app).post(`/collector/jobs/${ids[0]}/complete`).set(collector)
    expect(done.body.job).toMatchObject({ bagsCollected: 2, extraAmount: 0 })
  })
})

describe("on duty and route", () => {
  it("switches on duty and shows it to staff", async () => {
    const { staff, collector } = await setup(0)
    const on = await request(app).patch("/collector/me").set(collector).send({ onDuty: true })
    expect(on.body.onDuty).toBe(true)
    expect((await request(app).get("/collector/me").set(collector)).body.collector.onDuty).toBe(true)
    expect((await request(app).get("/admin/collectors").set(staff)).body.collectors[0].onDuty).toBe(true)
  })

  it("orders today's stops nearest first from where the collector is", async () => {
    const { collector } = await setup(3)
    const { body } = await request(app).get("/collector/route").set(collector).query(YENAGOA)
    expect(body.stops.map((s: { address: string }) => s.address)).toEqual(["Stop 2", "Stop 1", "Stop 0"])
    expect(body.stops[0].legKm).toBeGreaterThan(0)
    expect(body.totalKm).toBeGreaterThan(body.stops[0].legKm)
  })
})

describe("earnings and payouts", () => {
  it("adds up unpaid jobs, keeps back cash taken, and records a payout", async () => {
    const { staff, collector, collectorId, ids } = await setup(2)
    await request(app).post(`/collector/jobs/${ids[0]}/complete`).set(collector) // 2 bags: 400
    await request(app).post(`/collector/jobs/${ids[1]}/complete`).set(collector).field("bags", "3").field("extraPaidCash", "true") // 450, minus 700 cash

    const earnings = (await request(app).get("/collector/earnings").set(collector)).body
    expect(earnings.unpaid).toEqual({ jobs: 2, earned: 850, cashHeld: 700, due: 150 })

    const paid = await request(app).post(`/admin/collectors/${collectorId}/payouts`).set(staff).send({ note: "Transfer 123" })
    expect(paid.status).toBe(201)
    expect(paid.body.payout).toMatchObject({ amount: 150, jobs: 2 })
    expect(paid.body.earnings.unpaid.jobs).toBe(0)
    expect(await prisma.notification.count({ where: { title: "You've been paid" } })).toBe(1)

    expect((await request(app).post(`/admin/collectors/${collectorId}/payouts`).set(staff).send({})).status).toBe(409)
    expect((await request(app).get(`/admin/collectors/${collectorId}/earnings`).set(collector)).status).toBe(403)
  })
})
