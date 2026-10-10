import request from "supertest"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { addDays, today, ymd } from "../src/dates.ts"
import { prisma } from "../src/db.ts"
import { resetDatabase, verifyPhone, YENAGOA } from "./helpers.ts"

const app = createApp()
type Auth = Record<string, string>
const inDays = (n: number) => ymd(addDays(today(), n))
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])

beforeEach(resetDatabase)
afterAll(() => prisma.$disconnect())

async function register(phone: string, role?: "ADMIN"): Promise<Auth & { id: string }> {
  const res = await request(app).post("/auth/register").send({ name: "Tari", phone, password: "password123" })
  await verifyPhone(res.body.user.id)
  if (role) await prisma.user.update({ where: { id: res.body.user.id }, data: { role, staffRole: "OWNER" } })
  return { Authorization: `Bearer ${res.body.token}`, id: res.body.user.id }
}
const auth = (a: Auth & { id: string }) => ({ Authorization: a.Authorization })

const pickup = (extra: object = {}) => ({ type: "INSTANT_PICKUP", ...YENAGOA, address: "Opolo", wasteType: "Mixed", ...extra })

/** An active weekly plan with two upcoming pickups, the first one assigned to a collector. */
async function planWithPickups(userId: string) {
  const collector = await prisma.collector.create({ data: { name: "Musa", phone: "+2347011112222", area: "Ekeki", approvedAt: new Date() } })
  const sub = await prisma.subscription.create({
    data: {
      userId,
      plan: "weekly_1",
      status: "ACTIVE",
      address: "Opolo",
      wasteType: "Mixed",
      startDate: today(),
      currentPeriodStart: today(),
      currentPeriodEnd: addDays(today(), 28),
    },
  })
  const make = (ref: string, days: number, assigned: boolean) =>
    prisma.order.create({
      data: {
        reference: ref,
        userId,
        type: "PLAN_PICKUP",
        plan: "weekly_1",
        address: "Opolo",
        wasteType: "Mixed",
        scheduledDate: addDays(today(), days),
        amount: 0,
        status: assigned ? "ASSIGNED" : "PENDING",
        collectorId: assigned ? collector.id : null,
        subscriptionId: sub.id,
      },
    })
  return { sub, first: await make("WC-PLAN01", 2, true), second: await make("WC-PLAN02", 9, false) }
}

describe("time windows", () => {
  it("books a morning or afternoon pickup, and ASAP has none", async () => {
    const ada = auth(await register("08031112222"))
    const morning = await request(app).post("/orders").set(ada).send(pickup({ pickupDate: inDays(2), timeWindow: "MORNING" }))
    expect(morning.body.order.timeWindow).toBe("MORNING")
    const asap = await request(app).post("/orders").set(ada).send(pickup({ asap: true, timeWindow: "AFTERNOON" }))
    expect(asap.body.order.timeWindow).toBeNull()
    const bad = await request(app).post("/orders").set(ada).send(pickup({ pickupDate: inDays(2), timeWindow: "NIGHT" }))
    expect(bad.status).toBe(400)
    const catalog = await request(app).get("/catalog")
    expect(catalog.body.timeWindows.map((w: { id: string }) => w.id)).toEqual(["MORNING", "AFTERNOON"])
  })

  it("changes a plan's preferred time for its upcoming pickups", async () => {
    const user = await register("08031112222")
    const { sub, first } = await planWithPickups(user.id)
    await request(app).patch(`/subscriptions/${sub.id}`).set(auth(user)).send({ timeWindow: "AFTERNOON" }).expect(200)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: first.id } })).timeWindow).toBe("AFTERNOON")
  })
})

describe("reschedule and skip", () => {
  it("moves a plan pickup within its period and tells the collector", async () => {
    const user = await register("08031112222")
    const { first } = await planWithPickups(user.id)
    const moved = await request(app).post(`/orders/${first.id}/reschedule`).set(auth(user)).send({ date: inDays(4), timeWindow: "MORNING" })
    expect(moved.status).toBe(200)
    expect(moved.body.order).toMatchObject({ scheduledDate: inDays(4), timeWindow: "MORNING", status: "ASSIGNED" })

    const late = await request(app).post(`/orders/${first.id}/reschedule`).set(auth(user)).send({ date: inDays(40) })
    expect(late.status).toBe(422)
    const past = await request(app).post(`/orders/${first.id}/reschedule`).set(auth(user)).send({ date: inDays(-1) })
    expect(past.status).toBe(400)
  })

  it("won't move a pickup once the collector is on the way", async () => {
    const user = await register("08031112222")
    const { first } = await planWithPickups(user.id)
    await prisma.order.update({ where: { id: first.id }, data: { onTheWayAt: new Date() } })
    const res = await request(app).post(`/orders/${first.id}/reschedule`).set(auth(user)).send({ date: inDays(5) })
    expect(res.status).toBe(409)
    expect((await request(app).post(`/orders/${first.id}/skip`).set(auth(user))).status).toBe(409)
  })

  it("skips one plan pickup but not a one-off pickup", async () => {
    const user = await register("08031112222")
    const { second } = await planWithPickups(user.id)
    const skipped = await request(app).post(`/orders/${second.id}/skip`).set(auth(user))
    expect(skipped.body.order.status).toBe("CANCELLED")
    expect(skipped.body.order.skippedAt).toBeTruthy()

    const one = await request(app).post("/orders").set(auth(user)).send(pickup({ pickupDate: inDays(2) }))
    expect((await request(app).post(`/orders/${one.body.order.id}/skip`).set(auth(user))).status).toBe(409)
    // ...but a one-off pickup can be rescheduled.
    const moved = await request(app).post(`/orders/${one.body.order.id}/reschedule`).set(auth(user)).send({ date: inDays(3) })
    expect(moved.body.order.scheduledDate).toBe(inDays(3))
  })

  it("only lets customers change their own pickups", async () => {
    const user = await register("08031112222")
    const other = auth(await register("08031113333"))
    const { first } = await planWithPickups(user.id)
    expect((await request(app).post(`/orders/${first.id}/skip`).set(other)).status).toBe(404)
  })
})

describe("ratings", () => {
  it("rates a completed pickup once and flags poor ratings to staff", async () => {
    const user = await register("08031112222")
    await register("08090000001", "ADMIN")
    const { first } = await planWithPickups(user.id)
    expect((await request(app).post(`/orders/${first.id}/rating`).set(auth(user)).send({ stars: 5 })).status).toBe(409)

    await prisma.order.update({ where: { id: first.id }, data: { status: "COMPLETED", completedAt: new Date() } })
    const rated = await request(app).post(`/orders/${first.id}/rating`).set(auth(user)).send({ stars: 2, comment: "Left litter behind" })
    expect(rated.body.order).toMatchObject({ rating: 2, ratingComment: "Left litter behind" })
    expect((await request(app).post(`/orders/${first.id}/rating`).set(auth(user)).send({ stars: 5 })).status).toBe(409)
    expect(await prisma.notification.count({ where: { title: "2-star rating" } })).toBe(1)
    expect((await request(app).post(`/orders/${first.id}/rating`).set(auth(user)).send({ stars: 9 })).status).toBe(400)
  })
})

describe("problems and payments", () => {
  it("links a support ticket to the order it's about", async () => {
    const user = auth(await register("08031112222"))
    const staff = auth(await register("08090000001", "ADMIN"))
    const order = await request(app).post("/orders").set(user).send(pickup({ pickupDate: inDays(2) }))
    const ticket = await request(app)
      .post("/support-tickets")
      .set(user)
      .send({ category: "Missed Pickup", message: "Nobody came", contactTime: "Morning", orderId: order.body.order.id })
    expect(ticket.status).toBe(201)
    expect(ticket.body.ticket.orderId).toBe(order.body.order.id)
    const list = await request(app).get("/admin/support-tickets").set(staff)
    expect(list.body.tickets[0].order.reference).toBe(order.body.order.reference)

    const other = auth(await register("08031113333"))
    const stolen = await request(app)
      .post("/support-tickets")
      .set(other)
      .send({ category: "Other", message: "x", contactTime: "Any", orderId: order.body.order.id })
    expect(stolen.status).toBe(404)
  })

  it("lists payments, including confirmed bank transfers", async () => {
    const user = auth(await register("08031112222"))
    const staff = auth(await register("08090000001", "ADMIN"))
    const order = await request(app).post("/orders").set(user).send(pickup({ pickupDate: inDays(2), bags: 2 }))
    const id = order.body.order.id
    await request(app).post(`/orders/${id}/receipt`).set(user).attach("receipt", jpeg, { filename: "r.jpg", contentType: "image/jpeg" })
    let history = (await request(app).get("/payments").set(user)).body
    expect(history.payments).toHaveLength(1) // a receipt counts once uploaded (staff can still reject it)
    await request(app).patch(`/admin/orders/${id}`).set(staff).send({ status: "AWAITING_PAYMENT", customerNote: "Unreadable" })
    history = (await request(app).get("/payments").set(user)).body
    expect(history.payments).toHaveLength(0)
    await request(app).patch(`/admin/orders/${id}`).set(staff).send({ status: "PENDING" })
    history = (await request(app).get("/payments").set(user)).body
    expect(history.payments[0]).toMatchObject({ amount: 1300, method: "Bank transfer", description: "Scheduled pickup, 2 bags" })
    expect(history.total).toBe(1300)
  })
})
