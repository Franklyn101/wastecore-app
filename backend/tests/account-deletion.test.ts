import request from "supertest"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { addDays, today } from "../src/dates.ts"
import { prisma } from "../src/db.ts"
import { resetDatabase, verifyPhone, YENAGOA } from "./helpers.ts"

const app = createApp()
const PHONE = "+2348011112222"

beforeEach(resetDatabase)
afterAll(() => prisma.$disconnect())

async function customer() {
  const res = await request(app).post("/auth/register").send({ name: "Tari", phone: PHONE, password: "password123" })
  await verifyPhone(res.body.user.id)
  await prisma.user.update({ where: { id: res.body.user.id }, data: { email: "tari@example.com" } })
  return { auth: { Authorization: `Bearer ${res.body.token}` }, id: res.body.user.id as string }
}

const area = () => prisma.serviceArea.findUniqueOrThrow({ where: { slug: "yenagoa" } })

function order(userId: string, ref: string, data: object = {}) {
  return prisma.order.create({
    data: {
      reference: ref,
      userId,
      type: "INSTANT_PICKUP",
      plan: "instant",
      address: "12 Opolo Road",
      landmark: "Blue gate",
      ...YENAGOA,
      wasteType: "Mixed",
      scheduledDate: addDays(today(), 2),
      amount: 700,
      ...data,
    },
  })
}

const remove = (auth: Record<string, string>, password = "password123") => request(app).delete("/me").set(auth).send({ password })

describe("deleting an account", () => {
  it("needs the right password", async () => {
    const { auth } = await customer()
    const res = await remove(auth, "wrong-password")
    expect(res.status).toBe(403)
    expect((await request(app).get("/me").set(auth)).status).toBe(200)
  })

  it("wipes personal details, keeps the money records and frees the phone number", async () => {
    const { auth, id } = await customer()
    const { id: areaId } = await area()
    await prisma.address.create({ data: { userId: id, label: "Home", address: "12 Opolo Road", ...YENAGOA, areaId } })
    await prisma.supportTicket.create({ data: { userId: id, reference: "TKT-AAAAAA", category: "Other", message: "My gate code is 1234", contactTime: "Any" } })
    const done = await order(id, "WC-DONE01", { status: "COMPLETED", paidAt: new Date(), ratingComment: "Musa was great" })
    const unpaid = await order(id, "WC-OPEN01")
    await prisma.payment.create({ data: { reference: "ps_1", userId: id, purpose: "ORDER", orderId: done.id, amount: 700, status: "SUCCESS" } })
    const plan = await prisma.subscription.create({
      data: {
        userId: id,
        plan: "weekly_1",
        status: "ACTIVE",
        address: "12 Opolo Road",
        wasteType: "Mixed",
        startDate: today(),
        currentPeriodStart: today(),
        currentPeriodEnd: addDays(today(), 28),
        autoRenew: true,
        authorizationCode: "AUTH_abc",
        cardLabel: "Visa •••• 4081",
      },
    })
    const planPickup = await order(id, "WC-PLAN01", { type: "PLAN_PICKUP", amount: 0, status: "PENDING", subscriptionId: plan.id })

    const res = await remove(auth)
    expect(res.status).toBe(200)

    const user = await prisma.user.findUniqueOrThrow({ where: { id } })
    expect(user.name).toBe("Deleted account")
    expect(user.phone).not.toBe(PHONE)
    expect(user.email).toBeNull()
    expect(user.deletedAt).not.toBeNull()
    expect(await prisma.address.count({ where: { userId: id } })).toBe(0)
    expect(await prisma.supportTicket.count({ where: { userId: id } })).toBe(0)

    const kept = await prisma.order.findUniqueOrThrow({ where: { id: done.id } })
    expect(kept).toMatchObject({ status: "COMPLETED", amount: 700, landmark: null, lat: null, ratingComment: null })
    expect(kept.address).not.toContain("Opolo")
    expect(await prisma.payment.count({ where: { userId: id } })).toBe(1)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: unpaid.id } })).status).toBe("CANCELLED")
    expect((await prisma.order.findUniqueOrThrow({ where: { id: planPickup.id } })).status).toBe("CANCELLED")
    expect(await prisma.subscription.findUniqueOrThrow({ where: { id: plan.id } })).toMatchObject({
      status: "CANCELLED",
      autoRenew: false,
      authorizationCode: null,
      cardLabel: null,
    })

    // Signed out everywhere, can't sign back in, and the number can be used again.
    expect((await request(app).get("/me").set(auth)).status).toBe(401)
    expect((await request(app).post("/auth/login").send({ phone: PHONE, password: "password123" })).status).toBe(401)
    const again = await request(app).post("/auth/register").send({ name: "Tari", phone: PHONE, password: "password123" })
    expect(again.status).toBe(201)
  })

  it("waits for paid work that isn't done yet", async () => {
    const { auth, id } = await customer()
    await order(id, "WC-PAID01", { status: "PENDING", paidAt: new Date() })
    const res = await remove(auth)
    expect(res.status).toBe(409)
    expect(res.body.error).toContain("WC-PAID01")
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull()
  })

  it("asks for an unpaid balance first", async () => {
    const { auth, id } = await customer()
    await order(id, "WC-OWED01", { status: "COMPLETED", paidAt: new Date(), extraAmount: 1400 })
    const res = await remove(auth)
    expect(res.status).toBe(409)
    expect(res.body.error).toContain("₦1,400")
  })

  it("isn't available to staff", async () => {
    const { auth, id } = await customer()
    await prisma.user.update({ where: { id }, data: { role: "ADMIN", staffRole: "OWNER" } })
    expect((await remove(auth)).status).toBe(409)
  })

  it("unlinks a collector's login but keeps their record for payouts", async () => {
    const res = await request(app)
      .post("/auth/register-collector")
      .send({ name: "Musa", phone: "+2347011112222", password: "password123", area: "Ekeki" })
    const auth = { Authorization: `Bearer ${res.body.token}` }
    const collector = await prisma.collector.findUniqueOrThrow({ where: { userId: res.body.user.id } })

    const { id: customerId } = await customer()
    const job = await order(customerId, "WC-JOB001", { status: "ASSIGNED", collectorId: collector.id, paidAt: new Date() })
    expect((await remove(auth)).status).toBe(409)

    await prisma.order.update({ where: { id: job.id }, data: { status: "COMPLETED" } })
    expect((await remove(auth)).status).toBe(200)
    expect(await prisma.collector.findUniqueOrThrow({ where: { id: collector.id } })).toMatchObject({ userId: null, active: false })
  })

  it("hides deleted accounts from the staff customer list", async () => {
    const { auth } = await customer()
    await remove(auth)
    const owner = await request(app).post("/auth/register").send({ name: "Boss", phone: "+2348099998888", password: "password123" })
    await prisma.user.update({ where: { id: owner.body.user.id }, data: { role: "ADMIN", staffRole: "OWNER", phoneVerifiedAt: new Date() } })
    const list = await request(app).get("/admin/customers").set({ Authorization: `Bearer ${owner.body.token}` })
    expect(list.status).toBe(200)
    expect(list.body.customers).toHaveLength(0)
  })
})
