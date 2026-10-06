import request from "supertest"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { asapDate } from "../src/routes/orders.ts"
import { prisma } from "../src/db.ts"
import { normalizePhone, todayInLagos } from "../src/validation.ts"
import { resetDatabase } from "./helpers.ts"

const app = createApp()
const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
// Smallest valid JPEG header is enough for the magic-byte check.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])

async function register(phone = "08012345678", name = "Ada Obi") {
  const res = await request(app).post("/auth/register").send({ name, phone, password: "password123" })
  expect(res.status).toBe(201)
  return res.body.token as string
}

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe("normalizePhone", () => {
  it("accepts common Nigerian formats", () => {
    for (const input of ["08012345678", "8012345678", "2348012345678", "+234 801 234 5678"]) {
      expect(normalizePhone(input)).toBe("+2348012345678")
    }
  })
  it("rejects invalid numbers", () => {
    expect(normalizePhone("12345")).toBeNull()
    expect(normalizePhone("05012345678")).toBeNull()
  })
})

describe("auth", () => {
  it("registers, logs in with any phone format, and rejects bad passwords", async () => {
    await register()
    const ok = await request(app).post("/auth/login").send({ phone: "+2348012345678", password: "password123" })
    expect(ok.status).toBe(200)
    expect(ok.body.user).toMatchObject({ name: "Ada Obi", phone: "+2348012345678", role: "CUSTOMER" })
    expect(ok.body.user.passwordHash).toBeUndefined()

    const bad = await request(app).post("/auth/login").send({ phone: "08012345678", password: "wrong-password" })
    expect(bad.status).toBe(401)
  })

  it("rejects a duplicate phone number", async () => {
    await register()
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Someone", phone: "2348012345678", password: "password123" })
    expect(res.status).toBe(409)
  })

  it("requires a valid token", async () => {
    expect((await request(app).get("/orders")).status).toBe(401)
    expect((await request(app).get("/orders").set("Authorization", "Bearer nope")).status).toBe(401)
  })
})

describe("orders", () => {
  it("prices orders on the server and follows the payment flow", async () => {
    const token = await register()
    const auth = { Authorization: `Bearer ${token}` }

    const created = await request(app)
      .post("/orders")
      .set(auth)
      .send({ type: "WASTE_BAGS", bagSize: "medium", quantity: 3, address: "12 Allen Avenue, Ikeja", amount: 1 })
    expect(created.status).toBe(201)
    expect(created.body.order).toMatchObject({
      status: "AWAITING_PAYMENT",
      amount: 2700,
      planLabel: "Medium",
      scheduledDate: todayInLagos(),
    })
    expect(created.body.order.reference).toMatch(/^WC-[2-9A-Z]{6}$/)
    const id = created.body.order.id

    const paid = await request(app)
      .post(`/orders/${id}/receipt`)
      .set(auth)
      .attach("receipt", jpeg, { filename: "receipt.jpg", contentType: "image/jpeg" })
    expect(paid.status).toBe(200)
    expect(paid.body.order.status).toBe("PENDING")
    expect(paid.body.order.receiptUrl).toMatch(/\/uploads\/WC-/)

    const cancel = await request(app).post(`/orders/${id}/cancel`).set(auth)
    expect(cancel.status).toBe(409)
  })

  it("rejects non-image receipts", async () => {
    const auth = { Authorization: `Bearer ${await register()}` }
    const { body } = await request(app)
      .post("/orders")
      .set(auth)
      .send({ type: "INSTANT_PICKUP", address: "Lekki", wasteType: "Plastic", pickupDate: tomorrow })
    const res = await request(app)
      .post(`/orders/${body.order.id}/receipt`)
      .set(auth)
      .attach("receipt", Buffer.from("<html>"), { filename: "x.jpg", contentType: "image/jpeg" })
    expect(res.status).toBe(400)
  })

  it("validates dates and plans", async () => {
    const auth = { Authorization: `Bearer ${await register()}` }
    const past = await request(app)
      .post("/orders")
      .set(auth)
      .send({ type: "INSTANT_PICKUP", address: "Lekki", wasteType: "Plastic", pickupDate: "2020-01-01" })
    expect(past.status).toBe(400)
    expect(past.body.error).toMatch(/later date/)

    const badPlan = await request(app)
      .post("/orders")
      .set(auth)
      .send({ type: "WASTE_BAGS", bagSize: "huge", quantity: 1, address: "Lekki" })
    expect(badPlan.status).toBe(400)

    // Plans are subscriptions now, not one-off orders.
    const plan = await request(app)
      .post("/orders")
      .set(auth)
      .send({ type: "WEEKLY_PICKUP", plan: "weekly_2", address: "Yaba", wasteType: "Organic", pickupDate: tomorrow })
    expect(plan.status).toBe(400)
  })

  it("never shows one customer another customer's orders", async () => {
    const ada = { Authorization: `Bearer ${await register()}` }
    const bayo = { Authorization: `Bearer ${await register("08098765432", "Bayo")}` }
    const { body } = await request(app)
      .post("/orders")
      .set(ada)
      .send({ type: "INSTANT_PICKUP", address: "Yaba", wasteType: "Organic", pickupDate: tomorrow })
    expect(body.order.amount).toBe(700) // 1 bag by default

    expect((await request(app).get(`/orders/${body.order.id}`).set(bayo)).status).toBe(404)
    expect((await request(app).post(`/orders/${body.order.id}/cancel`).set(bayo)).status).toBe(404)
    expect((await request(app).get("/orders").set(bayo)).body.orders).toHaveLength(0)
  })
})

describe("support and admin", () => {
  it("creates tickets and keeps admin routes for admins only", async () => {
    const token = await register()
    const auth = { Authorization: `Bearer ${token}` }
    const res = await request(app)
      .post("/support-tickets")
      .set(auth)
      .send({ category: "Missed Pickup", message: "Nobody came", contactTime: "Mornings" })
    expect(res.status).toBe(201)
    expect(res.body.ticket.reference).toMatch(/^TKT-/)

    expect((await request(app).get("/admin/orders").set(auth)).status).toBe(403)

    await prisma.user.update({ where: { phone: "+2348012345678" }, data: { role: "ADMIN" } })
    const collector = await request(app)
      .post("/admin/collectors")
      .set(auth)
      .send({ name: "Musa", phone: "07011112222", area: "Ikeja" })
    expect(collector.status).toBe(201)

    const { body } = await request(app)
      .post("/orders")
      .set(auth)
      .send({ type: "INSTANT_PICKUP", address: "Ikeja", wasteType: "Paper", pickupDate: tomorrow })
    await prisma.order.update({ where: { id: body.order.id }, data: { status: "PENDING" } })
    const assigned = await request(app)
      .patch(`/admin/orders/${body.order.id}`)
      .set(auth)
      .send({ collectorId: collector.body.collector.id })
    expect(assigned.status).toBe(200)
    expect(assigned.body.order.status).toBe("ASSIGNED")

    // Customers see the status but never the collector's details.
    const mine = await request(app).get(`/orders/${body.order.id}`).set(auth)
    expect(mine.body.order.status).toBe("ASSIGNED")
    expect(mine.body.order.collector).toBeUndefined()
  })
})

describe("admin order workflow", () => {
  async function setup() {
    const customer = { Authorization: `Bearer ${await register()}` }
    const admin = { Authorization: `Bearer ${await register("08099990000", "Staff")}` }
    await prisma.user.update({ where: { phone: "+2348099990000" }, data: { role: "ADMIN" } })
    const { body } = await request(app)
      .post("/orders")
      .set(customer)
      .send({ type: "INSTANT_PICKUP", address: "Ikeja", wasteType: "Paper", pickupDate: tomorrow })
    const collector = await request(app)
      .post("/admin/collectors")
      .set(admin)
      .send({ name: "Musa", phone: "07011112222", area: "Ikeja" })
    return { customer, admin, orderId: body.order.id as string, collectorId: collector.body.collector.id as string }
  }

  const upload = (auth: Record<string, string>, id: string) =>
    request(app)
      .post(`/orders/${id}/receipt`)
      .set(auth)
      .attach("receipt", jpeg, { filename: "r.jpg", contentType: "image/jpeg" })

  it("rejects a receipt with a message the customer can see, then accepts a new one", async () => {
    const { customer, admin, orderId } = await setup()
    await upload(customer, orderId)

    const noReason = await request(app).patch(`/admin/orders/${orderId}`).set(admin).send({ status: "AWAITING_PAYMENT" })
    expect(noReason.status).toBe(400)

    const rejected = await request(app)
      .patch(`/admin/orders/${orderId}`)
      .set(admin)
      .send({ status: "AWAITING_PAYMENT", customerNote: "Amount on the receipt is ₦1,500." })
    expect(rejected.body.order.status).toBe("AWAITING_PAYMENT")

    const mine = await request(app).get(`/orders/${orderId}`).set(customer)
    expect(mine.body.order.customerNote).toBe("Amount on the receipt is ₦1,500.")
    expect(mine.body.order.adminNote).toBeUndefined()

    const again = await upload(customer, orderId)
    expect(again.body.order).toMatchObject({ status: "PENDING", customerNote: null })
  })

  it("enforces the status flow", async () => {
    const { customer, admin, orderId, collectorId } = await setup()
    const patch = (body: object) => request(app).patch(`/admin/orders/${orderId}`).set(admin).send(body)

    // Can't complete or assign an unpaid order.
    expect((await patch({ status: "COMPLETED" })).status).toBe(409)
    expect((await patch({ collectorId })).status).toBe(409)

    await upload(customer, orderId)
    expect((await patch({ status: "ASSIGNED" })).status).toBe(400) // needs a collector
    const assigned = await patch({ collectorId, adminNote: "Gate code 1234" })
    expect(assigned.body.order).toMatchObject({ status: "ASSIGNED", adminNote: "Gate code 1234" })
    expect(assigned.body.order.collector.name).toBe("Musa")

    const done = await patch({ status: "COMPLETED" })
    expect(done.body.order.status).toBe("COMPLETED")
    expect((await patch({ status: "PENDING" })).status).toBe(409) // terminal

    const summary = await request(app).get("/admin/summary").set(admin)
    expect(summary.body.orders.COMPLETED).toBe(1)
  })

  it("searches orders by reference, name and phone", async () => {
    const { admin, orderId } = await setup()
    const { body } = await request(app).get(`/admin/orders/${orderId}`).set(admin)
    for (const q of [body.order.reference.toLowerCase(), "ada", "0801234"]) {
      const res = await request(app).get("/admin/orders").query({ q }).set(admin)
      expect(res.body.orders.map((o: { id: string }) => o.id)).toEqual([orderId])
    }
    const none = await request(app).get("/admin/orders").query({ q: "nobody" }).set(admin)
    expect(none.body.orders).toHaveLength(0)
  })
})

describe("instant pickup", () => {
  it("prices per bag and needs either ASAP or a date", async () => {
    const auth = { Authorization: `Bearer ${await register()}` }
    const book = (body: object) =>
      request(app)
        .post("/orders")
        .set(auth)
        .send({ type: "INSTANT_PICKUP", address: "Yaba", wasteType: "Plastic", ...body })

    const three = await book({ bags: 3, pickupDate: tomorrow })
    expect(three.body.order).toMatchObject({ amount: 2100, quantity: 3, asap: false, scheduledDate: tomorrow })

    const asap = await book({ bags: 2, asap: true })
    expect(asap.body.order).toMatchObject({ amount: 1400, asap: true })
    expect(asap.body.order.scheduledDate).toBe(asapDate())

    expect((await book({ bags: 2 })).status).toBe(400) // no date and not ASAP
    expect((await book({ bags: 0, asap: true })).status).toBe(400)
    expect((await book({ bags: 21, asap: true })).status).toBe(400)
  })

  it("schedules ASAP for today before 5pm Lagos time and tomorrow after", () => {
    // Lagos is UTC+1.
    expect(asapDate(new Date("2026-10-07T15:59:00Z"))).toBe("2026-10-07") // 4:59pm
    expect(asapDate(new Date("2026-10-07T16:00:00Z"))).toBe("2026-10-08") // 5:00pm
    expect(asapDate(new Date("2026-10-07T23:30:00Z"))).toBe("2026-10-08") // 12:30am on the 8th: same day
  })
})
