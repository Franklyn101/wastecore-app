import { createHmac } from "node:crypto"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { startMockPaystack, type MockPaystack } from "../scripts/paystack-mock.ts"
import { createApp } from "../src/app.ts"
import { runBillingJobs } from "../src/billing.ts"
import { addDays, addPeriod, pickupDates, toDay, today, ymd } from "../src/dates.ts"
import { prisma } from "../src/db.ts"
import { resetDatabase, verifyPhone, YENAGOA } from "./helpers.ts"

const app = createApp()
let paystack: MockPaystack
const startDate = ymd(today())

beforeAll(async () => {
  paystack = await startMockPaystack(4599)
})
afterAll(async () => {
  await paystack.close()
  await prisma.$disconnect()
})
beforeEach(async () => {
  await resetDatabase()
  paystack.transactions.clear()
  paystack.setCardCharges("success")
})

async function customer(phone = "08012345678") {
  const res = await request(app).post("/auth/register").send({ name: "Ada Obi", phone, password: "password123" })
  await verifyPhone(res.body.user.id)
  return { Authorization: `Bearer ${res.body.token}` }
}

async function admin() {
  const res = await request(app).post("/auth/register").send({ name: "Staff", phone: "08099990000", password: "password123" })
  await prisma.user.update({ where: { phone: "+2348099990000" }, data: { role: "ADMIN", staffRole: "OWNER" } })
  return { Authorization: `Bearer ${res.body.token}` }
}

/** Starts a Paystack checkout, "pays" it, and confirms it the way the app does on return. */
type Auth = Record<string, string>

async function payFor(auth: Auth, target: { orderId?: string; subscriptionId?: string }) {
  const start = await request(app)
    .post("/payments")
    .set(auth)
    .send({ ...target, email: "ada@example.com", returnUrl: "wastecore://payment-return" })
  expect(start.status).toBe(201)
  paystack.pay(start.body.payment.reference)
  const done = await request(app).get(`/payments/${start.body.payment.reference}`).set(auth)
  expect(done.body.payment.status).toBe("SUCCESS")
  return start.body.payment.reference as string
}

async function subscribe(auth: Auth, plan = "weekly_2") {
  const res = await request(app)
    .post("/subscriptions")
    .set(auth)
    .send({ plan, ...YENAGOA, address: "12 Allen Avenue, Ikeja", wasteType: "Mixed", startDate })
  expect(res.status).toBe(201)
  return res.body.subscription.id as string
}

describe("billing dates", () => {
  it("spreads pickups through each week and clamps month ends", () => {
    const start = toDay("2026-10-05")
    expect(pickupDates(start, addDays(start, 14), 2).map(ymd)).toEqual([
      "2026-10-05",
      "2026-10-08",
      "2026-10-12",
      "2026-10-15",
    ])
    expect(pickupDates(start, addDays(start, 7), 7)).toHaveLength(7)
    expect(ymd(addPeriod(toDay("2027-01-31"), { months: 1 }))).toBe("2027-02-28")
    expect(ymd(addPeriod(start, { weeks: 4 }))).toBe("2026-11-02")
  })
})

describe("subscriptions", () => {
  it("activates a plan when paid, schedules its pickups and saves the card", async () => {
    const auth = await customer()
    const id = await subscribe(auth)

    // Paystack needs an email for the receipt.
    const noEmail = await request(app).post("/payments").set(auth).send({ subscriptionId: id })
    expect(noEmail.status).toBe(400)

    await payFor(auth, { subscriptionId: id })
    const { body } = await request(app).get(`/subscriptions/${id}`).set(auth)
    expect(body.subscription).toMatchObject({
      status: "ACTIVE",
      currentPeriodStart: startDate,
      currentPeriodEnd: ymd(addDays(today(), 28)),
      autoRenew: true,
      hasSavedCard: true,
      cardLabel: "Visa •••• 4081",
    })
    expect(body.subscription.authorizationCode).toBeUndefined()

    const pickups = await prisma.order.findMany({ where: { subscriptionId: id } })
    expect(pickups).toHaveLength(8) // 2 a week for 4 weeks
    expect(pickups.every((o) => o.type === "PLAN_PICKUP" && o.status === "PENDING" && o.amount === 0)).toBe(true)

    // Only one active plan at a time.
    const second = await request(app)
      .post("/subscriptions")
      .set(auth)
      .send({ plan: "premium", ...YENAGOA, address: "x", wasteType: "Mixed", startDate })
    expect(second.status).toBe(409)
  })

  it("applies a payment once, however many times it is confirmed", async () => {
    const auth = await customer()
    const id = await subscribe(auth)
    const reference = await payFor(auth, { subscriptionId: id })

    const event = JSON.stringify({
      event: "charge.success",
      data: {
        reference,
        status: "success",
        amount: 10000 * 100,
        currency: "NGN",
        channel: "card",
        paid_at: new Date().toISOString(),
        authorization: null,
      },
    })
    const sign = (body: string) => createHmac("sha512", "sk_test_fake_key_for_tests").update(body).digest("hex")

    const forged = await request(app)
      .post("/payments/paystack/webhook")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", "00".repeat(64))
      .send(event)
    expect(forged.status).toBe(401)

    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post("/payments/paystack/webhook")
        .set("Content-Type", "application/json")
        .set("x-paystack-signature", sign(event))
        .send(event)
      expect(res.status).toBe(200)
    }
    await request(app).get(`/payments/${reference}`).set(auth)
    expect(await prisma.order.count({ where: { subscriptionId: id } })).toBe(8)
  })

  it("refuses a payment for the wrong amount", async () => {
    const auth = await customer()
    const id = await subscribe(auth)
    const start = await request(app).post("/payments").set(auth).send({ subscriptionId: id, email: "ada@example.com" })
    const ref = start.body.payment.reference
    paystack.pay(ref)
    paystack.transactions.get(ref)!.amount = 100 // someone tampered with the checkout
    const res = await request(app).get(`/payments/${ref}`).set(auth)
    expect(res.body.payment.status).toBe("FAILED")
    expect((await prisma.subscription.findUnique({ where: { id } }))!.status).toBe("PENDING_PAYMENT")
  })

  it("upgrades mid-period with credit for unused days, and blocks wasteful downgrades", async () => {
    const auth = await customer()
    const oldId = await subscribe(auth, "weekly_1") // ₦5,000 per 4 weeks
    await payFor(auth, { subscriptionId: oldId })

    // Halfway through the period.
    await prisma.subscription.update({
      where: { id: oldId },
      data: { currentPeriodStart: addDays(today(), -14), currentPeriodEnd: addDays(today(), 14) },
    })
    const quote = await request(app).get(`/subscriptions/${oldId}/change-quote`).query({ plan: "premium" }).set(auth)
    expect(quote.body.quote).toMatchObject({ credit: 2500, amountDue: 32500, allowed: true })

    const change = await request(app).post(`/subscriptions/${oldId}/change`).set(auth).send({ plan: "premium" })
    expect(change.status).toBe(201)
    const newId = change.body.subscription.id
    const start = await request(app).post("/payments").set(auth).send({ subscriptionId: newId, email: "ada@example.com" })
    expect(start.body.payment.amount).toBe(32500)
    paystack.pay(start.body.payment.reference)
    await request(app).get(`/payments/${start.body.payment.reference}`).set(auth)

    expect((await prisma.subscription.findUnique({ where: { id: oldId } }))!.status).toBe("REPLACED")
    const oldOpen = await prisma.order.count({ where: { subscriptionId: oldId, status: { in: ["PENDING", "ASSIGNED"] } } })
    expect(oldOpen).toBe(0)
    const newPickups = await prisma.order.count({ where: { subscriptionId: newId } })
    expect(newPickups).toBeGreaterThanOrEqual(28) // daily for a month

    const down = await request(app).get(`/subscriptions/${newId}/change-quote`).query({ plan: "weekly_1" }).set(auth)
    expect(down.body.quote.allowed).toBe(false)
    expect((await request(app).post(`/subscriptions/${newId}/change`).set(auth).send({ plan: "weekly_1" })).status).toBe(409)
  })

  it("renews automatically with the saved card, once per period, and expires when that fails", async () => {
    const auth = await customer()
    const id = await subscribe(auth)
    await payFor(auth, { subscriptionId: id })

    // Ends tomorrow: the job charges the card and adds the next 4 weeks.
    const end = addDays(today(), 1)
    await prisma.subscription.update({ where: { id }, data: { currentPeriodEnd: end } })
    await runBillingJobs()
    await runBillingJobs()
    let sub = (await prisma.subscription.findUnique({ where: { id } }))!
    expect(sub.status).toBe("ACTIVE")
    expect(ymd(sub.currentPeriodEnd!)).toBe(ymd(addDays(end, 28)))
    expect(await prisma.payment.count({ where: { subscriptionId: id, purpose: "SUBSCRIPTION_RENEWAL" } })).toBe(1)
    expect(await prisma.order.count({ where: { subscriptionId: id } })).toBe(16)

    // Next time the card is declined: no charge succeeds and the plan lapses at the end.
    paystack.setCardCharges("failed")
    await prisma.subscription.update({ where: { id }, data: { currentPeriodEnd: today() } })
    await runBillingJobs()
    sub = (await prisma.subscription.findUnique({ where: { id } }))!
    expect(sub.status).toBe("EXPIRED")

    // The customer renews by hand; the new period starts today.
    const renew = await payFor(auth, { subscriptionId: id })
    expect(renew).toMatch(/^WCP-/)
    sub = (await prisma.subscription.findUnique({ where: { id } }))!
    expect(sub.status).toBe("ACTIVE")
    expect(ymd(sub.currentPeriodStart!)).toBe(startDate)
  })

  it("only allows renewing near the end of the period", async () => {
    const auth = await customer()
    const id = await subscribe(auth)
    await payFor(auth, { subscriptionId: id })
    const early = await request(app).post("/payments").set(auth).send({ subscriptionId: id })
    expect(early.status).toBe(409)
  })
})

describe("one-off orders paid online", () => {
  it("marks the order paid and stops staff rejecting a verified payment", async () => {
    const auth = await customer()
    const staff = await admin()
    const { body } = await request(app)
      .post("/orders")
      .set(auth)
      .send({ type: "INSTANT_PICKUP", ...YENAGOA, address: "Ikeja", wasteType: "Paper", pickupDate: startDate })
    await payFor(auth, { orderId: body.order.id })

    const order = await request(app).get(`/orders/${body.order.id}`).set(auth)
    expect(order.body.order).toMatchObject({ status: "PENDING", paymentMethod: "PAYSTACK" })

    const reject = await request(app)
      .patch(`/admin/orders/${body.order.id}`)
      .set(staff)
      .send({ status: "AWAITING_PAYMENT", customerNote: "no" })
    expect(reject.status).toBe(409)
  })

  it("sends the browser back to the app only for allowed return URLs", async () => {
    const auth = await customer()
    const { body } = await request(app)
      .post("/orders")
      .set(auth)
      .send({ type: "INSTANT_PICKUP", ...YENAGOA, address: "Ikeja", wasteType: "Paper", pickupDate: startDate })

    const good = await request(app)
      .post("/payments")
      .set(auth)
      .send({ orderId: body.order.id, email: "ada@example.com", returnUrl: "wastecore://payment-return" })
    paystack.pay(good.body.payment.reference)
    const back = await request(app).get("/payments/paystack/callback").query({ reference: good.body.payment.reference })
    expect(back.status).toBe(302)
    expect(back.headers.location).toBe(`wastecore://payment-return?reference=${good.body.payment.reference}`)

    const { body: o2 } = await request(app)
      .post("/orders")
      .set(auth)
      .send({ type: "WASTE_BAGS", bagSize: "small", quantity: 1, ...YENAGOA, address: "Ikeja" })
    const evil = await request(app)
      .post("/payments")
      .set(auth)
      .send({ orderId: o2.order.id, returnUrl: "https://evil.example/steal" })
    const page = await request(app).get("/payments/paystack/callback").query({ reference: evil.body.payment.reference })
    expect(page.status).toBe(200)
  })
})

describe("admin plans", () => {
  it("assigns a plan's collector to its upcoming pickups", async () => {
    const auth = await customer()
    const staff = await admin()
    const id = await subscribe(auth)
    await payFor(auth, { subscriptionId: id })
    const collector = await request(app).post("/admin/collectors").set(staff).send({ name: "Musa", phone: "07011112222", area: "Ikeja" })

    const res = await request(app).patch(`/admin/subscriptions/${id}`).set(staff).send({ collectorId: collector.body.collector.id })
    expect(res.body.subscription.collector.name).toBe("Musa")
    expect(await prisma.order.count({ where: { subscriptionId: id, status: "ASSIGNED" } })).toBe(8)

    const list = await request(app).get("/admin/subscriptions").set(staff)
    expect(list.body.subscriptions).toHaveLength(1)
    expect((await request(app).get("/admin/subscriptions").set(auth)).status).toBe(403)
  })
})
