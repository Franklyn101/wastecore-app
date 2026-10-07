import { createHmac } from "node:crypto"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { startMockPaystack, type MockPaystack } from "../scripts/paystack-mock.ts"
import { createApp } from "../src/app.ts"
import { addDays, today, ymd } from "../src/dates.ts"
import { prisma } from "../src/db.ts"
import { resetDatabase, verifyPhone, YENAGOA } from "./helpers.ts"

const app = createApp()
type Auth = Record<string, string>
let paystack: MockPaystack
const inDays = (n: number) => ymd(addDays(today(), n))

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
})

async function register(phone: string, role?: "ADMIN"): Promise<Auth> {
  const res = await request(app).post("/auth/register").send({ name: "Ebi Tari", phone, password: "password123" })
  await verifyPhone(res.body.user.id)
  if (role) await prisma.user.update({ where: { id: res.body.user.id }, data: { role, staffRole: "OWNER" } })
  return { Authorization: `Bearer ${res.body.token}` }
}

const pickup = (extra: object = {}) => ({ type: "INSTANT_PICKUP", ...YENAGOA, address: "Opolo", wasteType: "Mixed", ...extra })

async function payOnline(auth: Auth, orderId: string) {
  const start = await request(app).post("/payments").set(auth).send({ orderId, email: "ebi@example.com" })
  expect(start.status).toBe(201)
  paystack.pay(start.body.payment.reference)
  await request(app).get(`/payments/${start.body.payment.reference}`).set(auth)
  return start.body.payment.reference as string
}

describe("daily capacity", () => {
  it("refuses a full day and moves ASAP to the next day with room", async () => {
    const ada = await register("08031112222")
    await prisma.serviceArea.update({ where: { slug: "yenagoa" }, data: { dailyCapacity: 1 } })
    expect((await request(app).post("/orders").set(ada).send(pickup({ pickupDate: inDays(2) }))).status).toBe(201)
    const full = await request(app).post("/orders").set(ada).send(pickup({ pickupDate: inDays(2) }))
    expect(full.status).toBe(409)
    expect(full.body.error).toMatch(/fully booked in Yenagoa/)

    const days = await request(app).get("/areas/area_yenagoa/full-days")
    expect(days.body.fullDays).toEqual([inDays(2)])

    // Today gets booked, so the next ASAP order lands on a later day.
    const first = await request(app).post("/orders").set(ada).send(pickup({ asap: true }))
    const second = await request(app).post("/orders").set(ada).send(pickup({ asap: true }))
    expect(second.body.order.scheduledDate > first.body.order.scheduledDate).toBe(true)

    // Moving an order onto a full day is refused too.
    const move = await request(app).post(`/orders/${second.body.order.id}/reschedule`).set(ada).send({ date: inDays(2) })
    expect(move.status).toBe(409)
  })
})

describe("auto-assign", () => {
  it("gives paid orders to the on-duty collector with the fewest jobs", async () => {
    const ada = await register("08031112222")
    const staff = await register("08090000001", "ADMIN")
    await prisma.serviceArea.update({ where: { slug: "yenagoa" }, data: { autoAssign: true } })
    const make = (name: string, phone: string, onDuty: boolean) =>
      prisma.collector.create({ data: { name, phone, area: "x", serviceAreaId: "area_yenagoa", approvedAt: new Date(), onDuty } })
    const busy = await make("Busy", "+2347011110001", true)
    const free = await make("Free", "+2347011110002", true)
    await make("Off", "+2347011110003", false)

    // Busy already has a job today.
    const earlier = await request(app).post("/orders").set(ada).send(pickup({ asap: true }))
    await prisma.order.update({ where: { id: earlier.body.order.id }, data: { status: "ASSIGNED", collectorId: busy.id, paidAt: new Date() } })

    const order = await request(app).post("/orders").set(ada).send(pickup({ asap: true }))
    await payOnline(ada, order.body.order.id)
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.body.order.id } })
    expect(after).toMatchObject({ status: "ASSIGNED", collectorId: free.id })

    // Staff marking a transfer as paid also auto-assigns.
    const second = await request(app).post("/orders").set(ada).send(pickup({ asap: true }))
    const marked = await request(app).patch(`/admin/orders/${second.body.order.id}`).set(staff).send({ status: "PENDING" })
    expect(marked.body.order.status).toBe("ASSIGNED")
  })

  it("does nothing when the area has it off, until staff run it", async () => {
    const ada = await register("08031112222")
    const staff = await register("08090000001", "ADMIN")
    await prisma.collector.create({ data: { name: "On", phone: "+2347011110001", area: "x", serviceAreaId: "area_yenagoa", approvedAt: new Date(), onDuty: true } })
    const order = await request(app).post("/orders").set(ada).send(pickup({ asap: true }))
    await payOnline(ada, order.body.order.id)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.body.order.id } })).status).toBe("PENDING")

    await request(app).patch("/admin/areas/area_yenagoa").set(staff).send({ autoAssign: true, dailyCapacity: 40 }).expect(200)
    const run = await request(app).post("/admin/auto-assign").set(staff)
    expect(run.body.assigned).toBe(1)
  })
})

describe("customers", () => {
  it("lists, suspends and restores a customer", async () => {
    const ada = await register("08031112222")
    const staff = await register("08090000001", "ADMIN")
    const list = await request(app).get("/admin/customers").set(staff).query({ q: "0803111" })
    expect(list.body.customers).toHaveLength(1)
    const id = list.body.customers[0].id

    await request(app).post(`/admin/customers/${id}/suspend`).set(staff).send({ reason: "Abusive to collectors" }).expect(200)
    const blocked = await request(app).get("/orders").set(ada)
    expect(blocked.status).toBe(401)
    expect(blocked.body.error).toMatch(/suspended/)
    const login = await request(app).post("/auth/login").send({ phone: "08031112222", password: "password123" })
    expect(login.status).toBe(403)
    expect((await request(app).get(`/admin/customers/${id}`).set(staff)).body.customer.suspendedReason).toBe("Abusive to collectors")

    await request(app).post(`/admin/customers/${id}/restore`).set(staff).expect(200)
    expect((await request(app).post("/auth/login").send({ phone: "08031112222", password: "password123" })).status).toBe(200)
  })
})

describe("refunds", () => {
  it("refunds an online payment through Paystack and tracks the webhook", async () => {
    const ada = await register("08031112222")
    const staff = await register("08090000001", "ADMIN")
    const order = await request(app).post("/orders").set(ada).send(pickup({ asap: true, bags: 3 }))
    await payOnline(ada, order.body.order.id)

    const tooMuch = await request(app).post(`/admin/orders/${order.body.order.id}/refund`).set(staff).send({ amount: 5000, reason: "x y z" })
    expect(tooMuch.status).toBe(400)
    const refund = await request(app)
      .post(`/admin/orders/${order.body.order.id}/refund`)
      .set(staff)
      .send({ amount: 700, reason: "Only 2 bags", cancel: false })
    expect(refund.status).toBe(201)
    expect(refund.body.refund).toMatchObject({ method: "PAYSTACK", status: "PENDING", amount: 700 })
    expect(refund.body.left).toBe(1400)

    // Paystack confirms it.
    const body = JSON.stringify({ event: "refund.processed", data: { id: Number(refund.body.refund.paystackId), status: "processed" } })
    const signature = createHmac("sha512", "sk_test_fake_key_for_tests").update(body).digest("hex")
    await request(app).post("/payments/paystack/webhook").set("x-paystack-signature", signature).set("content-type", "application/json").send(body).expect(200)
    expect((await prisma.refund.findFirstOrThrow()).status).toBe("PROCESSED")

    const history = (await request(app).get("/payments").set(ada)).body
    expect(history.total).toBe(2100 - 700)
    const detail = (await request(app).get(`/orders/${order.body.order.id}`).set(ada)).body
    expect(detail.refunds[0]).toMatchObject({ amount: 700 })
    expect(await prisma.notification.count({ where: { title: "Refund on its way" } })).toBe(1)
  })

  it("records a manual refund for a bank transfer and can cancel the order", async () => {
    const ada = await register("08031112222")
    const staff = await register("08090000001", "ADMIN")
    const order = await request(app).post("/orders").set(ada).send(pickup({ asap: true }))
    await request(app).patch(`/admin/orders/${order.body.order.id}`).set(staff).send({ status: "PENDING" })
    const refund = await request(app)
      .post(`/admin/orders/${order.body.order.id}/refund`)
      .set(staff)
      .send({ amount: 700, reason: "Customer moved away", cancel: true })
    expect(refund.body.refund).toMatchObject({ method: "MANUAL", status: "PROCESSED" })
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.body.order.id } })).status).toBe("CANCELLED")
    expect((await request(app).post(`/admin/orders/${order.body.order.id}/refund`).set(staff).send({ amount: 100, reason: "again" })).status).toBe(409)
  })
})

describe("bag stock", () => {
  it("tracks stock, refuses orders it can't fill, and warns when low", async () => {
    const ada = await register("08031112222")
    const staff = await register("08090000001", "ADMIN")
    const bags = (quantity: number) => ({ type: "WASTE_BAGS", bagSize: "small", quantity, ...YENAGOA, address: "Opolo" })

    // Untracked sizes are unlimited.
    expect((await request(app).post("/orders").set(ada).send(bags(50))).status).toBe(201)
    await prisma.order.updateMany({ data: { status: "CANCELLED" } })

    await request(app).post("/admin/stock/small").set(staff).send({ change: 12, reason: "Delivery from supplier", lowAt: 10 }).expect(200)
    const order = await request(app).post("/orders").set(ada).send(bags(3))
    expect(order.status).toBe(201)
    const tooMany = await request(app).post("/orders").set(ada).send(bags(10))
    expect(tooMany.status).toBe(409)
    expect(tooMany.body.error).toMatch(/Only 9 packs/)

    // Delivered: stock goes down and staff are warned it's low.
    await request(app).patch(`/admin/orders/${order.body.order.id}`).set(staff).send({ status: "PENDING" })
    await request(app).patch(`/admin/orders/${order.body.order.id}`).set(staff).send({ status: "COMPLETED" })
    const stock = (await request(app).get("/admin/stock").set(staff)).body
    expect(stock.sizes.find((s: { size: string }) => s.size === "small")).toMatchObject({ packs: 9, available: 9 })
    expect(stock.movements[0]).toMatchObject({ change: -3 })
    expect(await prisma.notification.count({ where: { title: "Bag stock running low" } })).toBe(1)

    expect((await request(app).post("/admin/stock/small").set(staff).send({ change: -50, reason: "oops" })).status).toBe(400)
  })
})

describe("dashboard and exports", () => {
  it("summarises the day and exports CSV", async () => {
    const ada = await register("08031112222")
    const staff = await register("08090000001", "ADMIN")
    const order = await request(app).post("/orders").set(ada).send(pickup({ pickupDate: inDays(0), bags: 2 }))
    await payOnline(ada, order.body.order.id)

    const dash = (await request(app).get("/admin/dashboard").set(staff)).body
    expect(dash.today).toMatchObject({ due: 1, unassigned: 1 })
    expect(dash.revenue.today).toBe(1400)
    expect(dash.areas[0]).toMatchObject({ name: "Yenagoa", today: 1 })

    const csv = await request(app).get("/admin/exports/orders.csv").set(staff)
    expect(csv.status).toBe(200)
    expect(csv.headers["content-type"]).toMatch(/text\/csv/)
    const lines = csv.text.trim().split("\r\n")
    expect(lines[0]).toMatch(/^Reference,Created,Type/)
    expect(lines[1]).toContain(order.body.order.reference)
    expect((await request(app).get("/admin/exports/payments.csv").set(staff)).text).toContain("1400")
    expect((await request(app).get("/admin/exports/secrets.csv").set(staff)).status).toBe(400)
    expect((await request(app).get("/admin/exports/orders.csv").set(ada)).status).toBe(403)
  })
})
