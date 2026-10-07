import request from "supertest"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { prisma } from "../src/db.ts"
import { resetDatabase, verifyPhone } from "./helpers.ts"

const app = createApp()
const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])
type Auth = Record<string, string>

beforeEach(resetDatabase)
afterAll(() => prisma.$disconnect())

async function register(phone: string, name: string): Promise<Auth> {
  const res = await request(app).post("/auth/register").send({ name, phone, password: "password123" })
  await verifyPhone(res.body.user.id)
  return { Authorization: `Bearer ${res.body.token}` }
}

const login = (phone: string, password: string) => request(app).post("/auth/login").send({ phone, password })

/** A customer with a paid instant pickup, staff, and a collector with an app login assigned to the job. */
async function setup() {
  const customer = await register("08012345678", "Ada Obi")
  const admin = await register("08099990000", "Staff")
  await prisma.user.update({ where: { phone: "+2348099990000" }, data: { role: "ADMIN" } })

  const created = await request(app)
    .post("/orders")
    .set(customer)
    .send({ type: "INSTANT_PICKUP", address: "12 Allen Avenue", wasteType: "Plastic", bags: 3, pickupDate: tomorrow })
  const orderId = created.body.order.id as string
  await request(app)
    .post(`/orders/${orderId}/receipt`)
    .set(customer)
    .attach("receipt", jpeg, { filename: "r.jpg", contentType: "image/jpeg" })

  const c = await request(app).post("/admin/collectors").set(admin).send({ name: "Musa Bello", phone: "07011112222", area: "Ikeja" })
  const collectorId = c.body.collector.id as string
  const access = await request(app).put(`/admin/collectors/${collectorId}/login`).set(admin).send({ password: "musa-pass-123" })
  expect(access.body.collector.hasLogin).toBe(true)

  await request(app).patch(`/admin/orders/${orderId}`).set(admin).send({ collectorId, adminNote: "Gate code 1234" })
  const signedIn = await login("07011112222", "musa-pass-123")
  expect(signedIn.body.user.role).toBe("COLLECTOR")
  const collector = { Authorization: `Bearer ${signedIn.body.token}` }
  return { customer, admin, collector, orderId, collectorId }
}

describe("collector app", () => {
  it("shows a collector their jobs with what they need, and no prices", async () => {
    const { collector } = await setup()
    const { body } = await request(app).get("/collector/jobs").set(collector)
    expect(body.open).toHaveLength(1)
    expect(body.open[0]).toMatchObject({
      quantity: 3,
      address: "12 Allen Avenue",
      notes: "Gate code 1234",
      customer: { name: "Ada Obi", phone: "+2348012345678" },
    })
    expect(body.open[0].amount).toBeUndefined()
    expect(body.stats).toEqual({ doneToday: 0, doneThisWeek: 0 })
  })

  it("lets the customer see the collector is on the way, then the completed job with its photo", async () => {
    const { customer, collector, orderId } = await setup()

    await request(app).post(`/collector/jobs/${orderId}/on-the-way`).set(collector).expect(200)
    let mine = await request(app).get(`/orders/${orderId}`).set(customer)
    expect(mine.body.order.onTheWayAt).not.toBeNull()

    const done = await request(app)
      .post(`/collector/jobs/${orderId}/complete`)
      .set(collector)
      .field("note", "Left 3 empty bags")
      .attach("proof", jpeg, { filename: "proof.jpg", contentType: "image/jpeg" })
    expect(done.status).toBe(200)
    expect(done.body.job.status).toBe("COMPLETED")

    mine = await request(app).get(`/orders/${orderId}`).set(customer)
    expect(mine.body.order).toMatchObject({ status: "COMPLETED", collectorNote: "Left 3 empty bags" })
    expect(mine.body.order.proofPhotoUrl).toMatch(/\/uploads\/WC-/)

    const jobs = await request(app).get("/collector/jobs").set(collector)
    expect(jobs.body.open).toHaveLength(0)
    expect(jobs.body.history).toHaveLength(1)
    expect(jobs.body.stats.doneToday).toBe(1)

    // A closed job can't be closed again.
    expect((await request(app).post(`/collector/jobs/${orderId}/incomplete`).set(collector).send({ reason: "late" })).status).toBe(409)
  })

  it("needs a reason when a job can't be done, and shows it to the customer", async () => {
    const { customer, collector, orderId } = await setup()
    expect((await request(app).post(`/collector/jobs/${orderId}/incomplete`).set(collector).send({})).status).toBe(400)
    await request(app)
      .post(`/collector/jobs/${orderId}/incomplete`)
      .set(collector)
      .send({ reason: "Gate locked, no answer on the phone" })
      .expect(200)
    const mine = await request(app).get(`/orders/${orderId}`).set(customer)
    expect(mine.body.order).toMatchObject({ status: "INCOMPLETE", collectorNote: "Gate locked, no answer on the phone" })
  })

  it("keeps each role to its own screens and jobs", async () => {
    const { customer, admin, collector, orderId } = await setup()
    expect((await request(app).get("/collector/jobs").set(customer)).status).toBe(403)
    expect((await request(app).get("/collector/jobs").set(admin)).status).toBe(403)
    expect((await request(app).get("/admin/orders").set(collector)).status).toBe(403)
    expect((await request(app).post("/orders").set(collector).send({ type: "INSTANT_PICKUP" })).status).toBe(403)

    // Another collector can't see or close this job.
    const other = await request(app).post("/admin/collectors").set(admin).send({ name: "Bola", phone: "07033334444", area: "Lekki" })
    await request(app).put(`/admin/collectors/${other.body.collector.id}/login`).set(admin).send({ password: "bola-pass-123" })
    const bola = { Authorization: `Bearer ${(await login("07033334444", "bola-pass-123")).body.token}` }
    expect((await request(app).get(`/collector/jobs/${orderId}`).set(bola)).status).toBe(404)
    expect((await request(app).post(`/collector/jobs/${orderId}/complete`).set(bola)).status).toBe(404)
  })

  it("blocks a deactivated collector and lets staff reset or remove the login", async () => {
    const { admin, collector, collectorId } = await setup()

    await request(app).patch(`/admin/collectors/${collectorId}`).set(admin).send({ active: false })
    expect((await login("07011112222", "musa-pass-123")).status).toBe(403)
    expect((await request(app).get("/collector/jobs").set(collector)).status).toBe(403)
    await request(app).patch(`/admin/collectors/${collectorId}`).set(admin).send({ active: true })

    await request(app).put(`/admin/collectors/${collectorId}/login`).set(admin).send({ password: "new-pass-456" })
    expect((await login("07011112222", "musa-pass-123")).status).toBe(401)
    expect((await login("07011112222", "new-pass-456")).status).toBe(200)

    // Changing the collector's phone moves the login with it.
    await request(app).patch(`/admin/collectors/${collectorId}`).set(admin).send({ phone: "07055556666" })
    expect((await login("07055556666", "new-pass-456")).status).toBe(200)

    const removed = await request(app).delete(`/admin/collectors/${collectorId}/login`).set(admin)
    expect(removed.body.collector.hasLogin).toBe(false)
    expect((await login("07055556666", "new-pass-456")).status).toBe(401)
  })

  it("won't turn a customer's phone number into a collector login", async () => {
    const { admin } = await setup()
    const c = await request(app).post("/admin/collectors").set(admin).send({ name: "Ada", phone: "08012345678", area: "Ikeja" })
    const res = await request(app).put(`/admin/collectors/${c.body.collector.id}/login`).set(admin).send({ password: "password123" })
    expect(res.status).toBe(409)
  })
})

describe("collector self sign-up", () => {
  const signUp = (body: object) =>
    request(app)
      .post("/auth/register-collector")
      .send({ name: "Tunde Ade", phone: "07077778888", password: "tunde-pass-1", area: "Surulere", ...body })

  async function staff(): Promise<Auth> {
    const admin = await register("08099990000", "Staff")
    await prisma.user.update({ where: { phone: "+2348099990000" }, data: { role: "ADMIN" } })
    return admin
  }

  it("waits for approval before showing any jobs", async () => {
    const admin = await staff()
    const res = await signUp({})
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe("COLLECTOR")
    const tunde = { Authorization: `Bearer ${res.body.token}` }

    const me = await request(app).get("/collector/me").set(tunde)
    expect(me.body.collector).toMatchObject({ status: "PENDING", area: "Surulere" })
    expect((await request(app).get("/collector/jobs").set(tunde)).status).toBe(403)

    // Staff see the request first, and can't give a pending collector work.
    const list = await request(app).get("/admin/collectors").set(admin)
    expect(list.body.collectors[0]).toMatchObject({ name: "Tunde Ade", pending: true, hasLogin: true })
    const id = list.body.collectors[0].id

    const customer = await register("08012345678", "Ada")
    const { body } = await request(app)
      .post("/orders")
      .set(customer)
      .send({ type: "INSTANT_PICKUP", address: "Yaba", wasteType: "Paper", asap: true })
    await prisma.order.update({ where: { id: body.order.id }, data: { status: "PENDING" } })
    expect((await request(app).patch(`/admin/orders/${body.order.id}`).set(admin).send({ collectorId: id })).status).toBe(400)

    await request(app).post(`/admin/collectors/${id}/approve`).set(admin).expect(200)
    expect((await request(app).get("/collector/me").set(tunde)).body.collector.status).toBe("APPROVED")
    // Approved, but jobs also need a verified phone number.
    expect((await request(app).get("/collector/jobs").set(tunde)).status).toBe(403)
    await verifyPhone(res.body.user.id)
    expect((await request(app).get("/collector/jobs").set(tunde)).status).toBe(200)
    expect((await request(app).patch(`/admin/orders/${body.order.id}`).set(admin).send({ collectorId: id })).status).toBe(200)
  })

  it("lets staff reject a sign-up, removing the login", async () => {
    const admin = await staff()
    await signUp({})
    const id = (await request(app).get("/admin/collectors").set(admin)).body.collectors[0].id
    await request(app).post(`/admin/collectors/${id}/reject`).set(admin).expect(200)
    expect((await request(app).get("/admin/collectors").set(admin)).body.collectors).toHaveLength(0)
    expect((await login("07077778888", "tunde-pass-1")).status).toBe(401)
  })

  it("links to a collector staff already added, but still needs approval", async () => {
    const admin = await staff()
    const added = await request(app).post("/admin/collectors").set(admin).send({ name: "Tunde A.", phone: "07077778888", area: "Yaba" })
    expect(added.body.collector.pending).toBe(false)

    const res = await signUp({})
    const tunde = { Authorization: `Bearer ${res.body.token}` }
    const list = (await request(app).get("/admin/collectors").set(admin)).body.collectors
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: added.body.collector.id, pending: true, hasLogin: true })
    expect((await request(app).get("/collector/jobs").set(tunde)).status).toBe(403)

    // Rejecting keeps the staff-added record (approved again) and drops the login.
    await request(app).post(`/admin/collectors/${added.body.collector.id}/reject`).set(admin).expect(200)
    const after = (await request(app).get("/admin/collectors").set(admin)).body.collectors
    expect(after[0]).toMatchObject({ pending: false, hasLogin: false })
  })

  it("rejects phone numbers that already have an account", async () => {
    await register("08012345678", "Ada")
    expect((await signUp({ phone: "08012345678" })).status).toBe(409)
    expect((await signUp({ area: "" })).status).toBe(400)
  })
})
