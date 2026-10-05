import request from "supertest"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { prisma } from "../src/db.ts"
import { normalizePhone, todayInLagos } from "../src/validation.ts"

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
  await prisma.order.deleteMany()
  await prisma.supportTicket.deleteMany()
  await prisma.collector.deleteMany()
  await prisma.user.deleteMany()
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
      .send({ type: "UPGRADE", plan: "gold", address: "Lekki", startDate: tomorrow })
    expect(badPlan.status).toBe(400)
  })

  it("never shows one customer another customer's orders", async () => {
    const ada = { Authorization: `Bearer ${await register()}` }
    const bayo = { Authorization: `Bearer ${await register("08098765432", "Bayo")}` }
    const { body } = await request(app)
      .post("/orders")
      .set(ada)
      .send({ type: "WEEKLY_PICKUP", plan: "weekly_2", address: "Yaba", wasteType: "Organic", pickupDate: tomorrow })
    expect(body.order.amount).toBe(2500)

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
