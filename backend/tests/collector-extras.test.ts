import request from "supertest"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { recordPaystackResult } from "../src/billing.ts"
import { prisma } from "../src/db.ts"
import type { PaystackTransaction } from "../src/paystack.ts"
import { todayInLagos } from "../src/validation.ts"
import { resetDatabase, verifyPhone, YENAGOA } from "./helpers.ts"

const app = createApp()
const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
type Auth = Record<string, string>

beforeEach(resetDatabase)
afterAll(() => prisma.$disconnect())

async function register(phone: string, role?: "ADMIN"): Promise<Auth> {
  const res = await request(app).post("/auth/register").send({ name: "Ebi", phone, password: "password123" })
  await verifyPhone(res.body.user.id)
  if (role) await prisma.user.update({ where: { id: res.body.user.id }, data: { role, staffRole: "OWNER" } })
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
      .send({ type: "INSTANT_PICKUP", ...spot, address: `Stop ${i}`, wasteType: "Mixed", bags: 2, pickupDate: todayInLagos() })
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
    // Booked 2 scheduled bags (₦1,300); 4 would have been ₦2,450.
    expect(done.body.job).toMatchObject({ bagsCollected: 4, extraAmount: 1150, extraPaid: false, pay: 250 + 4 * 300 })

    const order = (await request(app).get(`/orders/${ids[0]}`).set(customer)).body.order
    expect(order).toMatchObject({ bagsCollected: 4, extraAmount: 1150, extraPaidAt: null })
    expect(await prisma.notification.count({ where: { title: "Extra bags collected" } })).toBe(1)

    // Paying the balance online marks it paid.
    const { userId } = await prisma.order.findUniqueOrThrow({ where: { id: ids[0] } })
    const payment = await prisma.payment.create({
      data: { reference: "PAY-BAL-1", userId, purpose: "ORDER_BALANCE", orderId: ids[0], amount: 1150 },
    })
    await recordPaystackResult(payment, { status: "success", amount: 115000, currency: "NGN", channel: "card", reference: "PAY-BAL-1" } as PaystackTransaction)
    const paid = (await request(app).get(`/orders/${ids[0]}`).set(customer)).body.order
    expect(paid.extraPaymentMethod).toBe("PAYSTACK")
    const history = (await request(app).get("/payments").set(customer)).body.payments
    expect(history.some((p: { description: string }) => p.description.startsWith("Extra bags"))).toBe(true)
  })

  it("records extra bags paid in cash, with no balance to pay", async () => {
    const { collector, ids } = await setup()
    const done = await request(app).post(`/collector/jobs/${ids[0]}/complete`).set(collector).field("bags", "3").field("extraPaidCash", "true")
    expect(done.body.job).toMatchObject({ extraAmount: 650, extraPaid: true }) // 3rd bag at the first-3 price
    expect(await prisma.notification.count({ where: { title: "Extra bags collected" } })).toBe(0)
  })

  it("doesn't charge when fewer bags were collected", async () => {
    const { collector, ids } = await setup()
    const done = await request(app).post(`/collector/jobs/${ids[0]}/complete`).set(collector)
    expect(done.body.job).toMatchObject({ bagsCollected: 2, extraAmount: 0 })
  })
})

describe("instant pickups, WasteCore bags and wasted trips", () => {
  it("pays the instant rate and for WasteCore bags handed out", async () => {
    const { customer, staff, collector, collectorId } = await setup(0)
    const o = await request(app)
      .post("/orders")
      .set(customer)
      .send({ type: "INSTANT_PICKUP", ...YENAGOA, address: "Rush", wasteType: "Mixed", bags: 3, wastecoreBags: 2, asap: true })
    expect(o.body.order).toMatchObject({ amount: 3000 + 600, wastecoreBags: 2 })
    await prisma.order.update({ where: { id: o.body.order.id }, data: { status: "PENDING", paymentMethod: "TRANSFER", paidAt: new Date() } })
    await request(app).patch(`/admin/orders/${o.body.order.id}`).set(staff).send({ collectorId })

    const job = (await request(app).get(`/collector/jobs/${o.body.order.id}`).set(collector)).body.job
    expect(job).toMatchObject({ wastecoreBags: 2, quantity: 3, estimatedPay: 400 + 3 * 450 + 2 * 50 })
    expect(job.amount).toBeUndefined() // collectors don't see prices
    const done = await request(app).post(`/collector/jobs/${o.body.order.id}/complete`).set(collector).field("bags", "5")
    // Instant: ₦400 a stop + ₦450 a bag + ₦50 per WasteCore bag. 5 bags cost ₦4,400 instead of ₦3,000.
    expect(done.body.job).toMatchObject({ pay: 400 + 5 * 450 + 2 * 50, extraAmount: 1400 })
  })

  it("charges a wasted-trip fee the customer can pay, and pays the collector for the trip", async () => {
    const { customer, staff, collector, collectorId, ids } = await setup(2)
    const wasted = await request(app)
      .post(`/collector/jobs/${ids[0]}/incomplete`)
      .set(collector)
      .send({ reason: "Nobody home, gate locked", wastedTrip: true })
    expect(wasted.body.job).toMatchObject({ status: "INCOMPLETE", wastedTrip: true, extraAmount: 500, pay: 500 })
    expect(await prisma.notification.count({ where: { title: "Wasted trip" } })).toBe(2) // customer and staff

    // An ordinary "couldn't do it" charges nothing.
    const plain = await request(app).post(`/collector/jobs/${ids[1]}/incomplete`).set(collector).send({ reason: "Truck broke down" })
    expect(plain.body.job).toMatchObject({ wastedTrip: false, extraAmount: 0, pay: null })

    const order = (await request(app).get(`/orders/${ids[0]}`).set(customer)).body.order
    expect(order).toMatchObject({ status: "INCOMPLETE", wastedTrip: true, extraAmount: 500 })
    // The checkout is started for the fee (Paystack itself isn't running in these tests).
    await request(app).post("/payments").set(customer).send({ orderId: ids[0], email: "ebi@example.com" })
    expect(await prisma.payment.findFirst({ where: { orderId: ids[0] } })).toMatchObject({ purpose: "ORDER_BALANCE", amount: 500 })
    expect((await request(app).post("/payments").set(customer).send({ orderId: ids[1], email: "ebi@example.com" })).status).toBe(409)

    const earnings = (await request(app).get(`/admin/collectors/${collectorId}/earnings`).set(staff)).body
    expect(earnings.unpaid).toMatchObject({ jobs: 1, earned: 500 })
  })

  it("charges plan pickups only for bags over the plan's limit", async () => {
    const { customer, collector, collectorId } = await setup(0)
    const { id: userId } = await prisma.user.findFirstOrThrow({ where: { phone: "+2348012345678" } })
    const order = await prisma.order.create({
      data: {
        reference: "WC-PLAN01",
        userId,
        type: "PLAN_PICKUP",
        plan: "weekly_1", // up to 3 bags a pickup
        address: "Plan street",
        scheduledDate: new Date(`${todayInLagos()}T00:00:00Z`),
        quantity: 3,
        amount: 0,
        status: "ASSIGNED",
        collectorId,
      },
    })
    const done = await request(app).post(`/collector/jobs/${order.id}/complete`).set(collector).field("bags", "5")
    expect(done.body.job).toMatchObject({ extraAmount: 2 * 500, pay: 250 + 5 * 300 })
    // Plan pickups aren't in the order list, except when there's something to pay.
    const listed = (await request(app).get("/orders").set(customer)).body.orders
    expect(listed.map((o: { id: string }) => o.id)).toEqual([order.id])
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
    await request(app).post(`/collector/jobs/${ids[0]}/complete`).set(collector) // 2 bags: 250 + 600
    await request(app).post(`/collector/jobs/${ids[1]}/complete`).set(collector).field("bags", "3").field("extraPaidCash", "true") // 250 + 900, minus 650 cash

    const earnings = (await request(app).get("/collector/earnings").set(collector)).body
    expect(earnings.unpaid).toEqual({ jobs: 2, earned: 2000, cashHeld: 650, due: 1350 })

    const paid = await request(app).post(`/admin/collectors/${collectorId}/payouts`).set(staff).send({ note: "Transfer 123" })
    expect(paid.status).toBe(201)
    expect(paid.body.payout).toMatchObject({ amount: 1350, jobs: 2 })
    expect(paid.body.earnings.unpaid.jobs).toBe(0)
    expect(await prisma.notification.count({ where: { title: "You've been paid" } })).toBe(1)

    expect((await request(app).post(`/admin/collectors/${collectorId}/payouts`).set(staff).send({})).status).toBe(409)
    expect((await request(app).get(`/admin/collectors/${collectorId}/earnings`).set(collector)).status).toBe(403)
  })
})
