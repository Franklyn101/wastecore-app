import request from "supertest"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { addDays, today, ymd } from "../src/dates.ts"
import { prisma } from "../src/db.ts"
import { resetDatabase, verifyPhone, YENAGOA } from "./helpers.ts"

const app = createApp()
type Auth = Record<string, string>
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])
const inDays = (n: number) => ymd(addDays(today(), n))

beforeEach(resetDatabase)
afterAll(() => prisma.$disconnect())

async function register(phone: string, name = "Ebi Tari", staffRole?: "OWNER" | "STAFF"): Promise<Auth & { id: string }> {
  const res = await request(app).post("/auth/register").send({ name, phone, password: "password123" })
  await verifyPhone(res.body.user.id)
  if (staffRole) await prisma.user.update({ where: { id: res.body.user.id }, data: { role: "ADMIN", staffRole } })
  return { Authorization: `Bearer ${res.body.token}`, id: res.body.user.id }
}
const auth = (a: Auth & { id: string }) => ({ Authorization: a.Authorization })

describe("staff roles", () => {
  it("keeps money and accounts for the main admin", async () => {
    const owner = auth(await register("08090000001", "Grace", "OWNER"))
    const staff = auth(await register("08090000002", "Tunde", "STAFF"))
    const ada = await register("08031112222")

    expect((await request(app).get("/me").set(staff)).body.user.staffRole).toBe("STAFF")
    expect((await request(app).post(`/admin/customers/${ada.id}/suspend`).set(staff).send({ reason: "nope nope" })).status).toBe(403)
    expect((await request(app).get("/admin/exports/orders.csv").set(staff)).status).toBe(403)
    expect((await request(app).patch("/admin/areas/area_yenagoa").set(staff).send({ autoAssign: true })).status).toBe(403)
    expect((await request(app).get("/admin/staff").set(staff)).status).toBe(403)
    expect((await request(app).post("/admin/stock/small").set(staff).send({ change: -1, reason: "lost" })).status).toBe(403)
    // ...but staff can run the day: orders, restocking, the dashboard (without money).
    expect((await request(app).post("/admin/stock/small").set(staff).send({ change: 10, reason: "Delivery" })).status).toBe(200)
    const dash = (await request(app).get("/admin/dashboard").set(staff)).body
    expect(dash.revenue).toBeNull()
    expect((await request(app).get("/admin/dashboard").set(owner)).body.revenue).not.toBeNull()
  })

  it("lets the main admin add staff, change roles and disable logins, with an audit trail", async () => {
    const owner = await register("08090000001", "Grace", "OWNER")
    const added = await request(app).post("/admin/staff").set(auth(owner)).send({ name: "Tunde", phone: "08090000002", password: "tunde-pass-1" })
    expect(added.status).toBe(201)
    expect(added.body.staff.staffRole).toBe("STAFF")
    const login = await request(app).post("/auth/login").send({ phone: "08090000002", password: "tunde-pass-1" })
    expect(login.body.user).toMatchObject({ role: "ADMIN", staffRole: "STAFF" })

    // The only main admin can't be demoted, and nobody changes their own access.
    expect((await request(app).patch(`/admin/staff/${owner.id}`).set(auth(owner)).send({ staffRole: "STAFF" })).status).toBe(409)
    await request(app).patch(`/admin/staff/${added.body.staff.id}`).set(auth(owner)).send({ disabled: true }).expect(200)
    expect((await request(app).post("/auth/login").send({ phone: "08090000002", password: "tunde-pass-1" })).status).toBe(403)

    const log = (await request(app).get("/admin/audit").set(auth(owner))).body.entries
    expect(log.map((e: { summary: string }) => e.summary)).toEqual(["Tunde: login disabled", "Added staff Tunde (+2348090000002)"])
    expect(log[0].actorName).toBe("Grace")
  })

  it("records order changes in the audit log", async () => {
    const owner = auth(await register("08090000001", "Grace", "OWNER"))
    const ada = auth(await register("08031112222"))
    const order = await request(app).post("/orders").set(ada).send({ type: "INSTANT_PICKUP", ...YENAGOA, address: "Opolo", wasteType: "Mixed", asap: true })
    await request(app).patch(`/admin/orders/${order.body.order.id}`).set(owner).send({ status: "PENDING" })
    const log = (await request(app).get("/admin/audit").set(owner).query({ targetType: "order", targetId: order.body.order.id })).body.entries
    expect(log[0].summary).toBe(`${order.body.order.reference}: awaiting payment → pending`)
  })
})

describe("special waste quotes", () => {
  it("goes from request to quote to a payable order", async () => {
    const ada = auth(await register("08031112222"))
    const staff = auth(await register("08090000002", "Tunde", "STAFF"))
    const address = await request(app).post("/addresses").set(ada).send({ label: "Home", address: "Kpansia", ...YENAGOA })

    const created = await request(app)
      .post("/quotes")
      .set(ada)
      .field("category", "Building rubble")
      .field("description", "About 20 bags of rubble from a renovation")
      .field("addressId", address.body.address.id)
      .field("preferredDate", inDays(3))
      .attach("photo", jpeg, { filename: "rubble.jpg", contentType: "image/jpeg" })
    expect(created.status).toBe(201)
    expect(created.body.quote).toMatchObject({ status: "NEW", address: "Kpansia" })
    expect(created.body.quote.photoUrl).toBeTruthy()
    const id = created.body.quote.id

    expect((await request(app).post(`/quotes/${id}/accept`).set(ada)).status).toBe(409) // no price yet
    const quoted = await request(app).post(`/admin/quotes/${id}/quote`).set(staff).send({ amount: 25000, note: "Truck and 2 loaders" })
    expect(quoted.body.quote).toMatchObject({ status: "QUOTED", amount: 25000 })
    expect(await prisma.notification.count({ where: { title: "Your quote is ready" } })).toBe(1)

    const accepted = await request(app).post(`/quotes/${id}/accept`).set(ada)
    expect(accepted.status).toBe(201)
    expect(accepted.body.order).toMatchObject({ type: "SPECIAL_PICKUP", amount: 25000, status: "AWAITING_PAYMENT", scheduledDate: inDays(3) })
    expect(accepted.body.order.reference).toBe(created.body.quote.reference.replace("QT-", "WC-"))
    expect((await request(app).get(`/quotes/${id}`).set(ada)).body.quote).toMatchObject({ status: "ACCEPTED", orderId: accepted.body.order.id })
    expect((await request(app).post(`/quotes/${id}/accept`).set(ada)).status).toBe(409)
  })

  it("lets staff turn a request down and customers decline a price", async () => {
    const ada = auth(await register("08031112222"))
    const staff = auth(await register("08090000002", "Tunde", "STAFF"))
    const address = await request(app).post("/addresses").set(ada).send({ label: "Home", address: "Kpansia", ...YENAGOA })
    const ask = (category: string) =>
      request(app).post("/quotes").set(ada).field("category", category).field("description", "Old fridge").field("addressId", address.body.address.id).field("preferredDate", inDays(2))
    const one = (await ask("Electronics (e-waste)")).body.quote
    const two = (await ask("Furniture or bulky items")).body.quote

    await request(app).post(`/admin/quotes/${one.id}/cancel`).set(staff).send({ note: "We can't take fridges yet" }).expect(200)
    expect((await request(app).get(`/quotes/${one.id}`).set(ada)).body.quote).toMatchObject({ status: "CANCELLED", staffNote: "We can't take fridges yet" })

    await request(app).post(`/admin/quotes/${two.id}/quote`).set(staff).send({ amount: 8000 }).expect(200)
    const declined = await request(app).post(`/quotes/${two.id}/decline`).set(ada)
    expect(declined.body.quote.status).toBe("DECLINED")
    expect((await request(app).post("/quotes").set(ada).field("category", "Spaceship").field("description", "x").field("addressId", address.body.address.id).field("preferredDate", inDays(2))).status).toBe(400)
  })
})

describe("waste records", () => {
  it("adds up weights collected and where waste went", async () => {
    const owner = auth(await register("08090000001", "Grace", "OWNER"))
    const ada = auth(await register("08031112222"))
    const collector = await prisma.collector.create({ data: { name: "Musa", phone: "+2347011112222", area: "Ekeki", serviceAreaId: "area_yenagoa", approvedAt: new Date() } })
    await request(app).put(`/admin/collectors/${collector.id}/login`).set(owner).send({ password: "musa-pass-123" })
    const musa = { Authorization: `Bearer ${(await request(app).post("/auth/login").send({ phone: "07011112222", password: "musa-pass-123" })).body.token}` }

    for (const [wasteType, kg] of [["Plastic", "12.5"], ["Organic", "30"]] as const) {
      const o = await request(app).post("/orders").set(ada).send({ type: "INSTANT_PICKUP", ...YENAGOA, address: "Opolo", wasteType, asap: true })
      await prisma.order.update({ where: { id: o.body.order.id }, data: { status: "ASSIGNED", collectorId: collector.id, paidAt: new Date() } })
      const done = await request(app).post(`/collector/jobs/${o.body.order.id}/complete`).set(musa).field("weightKg", kg)
      expect(done.body.job.weightKg).toBe(Number(kg))
    }

    const drop = await request(app)
      .post("/collector/disposals")
      .set(musa)
      .field("site", "Plastic buyer, Swali")
      .field("kind", "RECYCLER")
      .field("wasteType", "Plastic")
      .field("weightKg", "12")
    expect(drop.status).toBe(201)
    await request(app).post("/admin/disposals").set(owner).send({ site: "Dump site", kind: "LANDFILL", wasteType: "Mixed", weightKg: 36 }).expect(201)
    expect((await request(app).get("/collector/disposals").set(musa)).body.recentSites.map((s: { site: string }) => s.site)).toContain("Dump site")

    const report = (await request(app).get("/admin/reports/waste").set(owner)).body
    expect(report.collected).toMatchObject({ pickups: 2, weighedPickups: 2, kg: 42.5 })
    expect(report.collected.byWasteType.map((r: { name: string }) => r.name).sort()).toEqual(["Organic", "Plastic"])
    expect(report.disposed).toMatchObject({ loads: 2, kg: 48, divertedPercent: 25 })

    const csv = await request(app).get("/admin/exports/disposals.csv").set(owner)
    expect(csv.text).toContain("Plastic buyer")
    expect((await request(app).post("/admin/disposals").set(musa).send({ site: "x", kind: "LANDFILL", wasteType: "Mixed", weightKg: 1 })).status).toBe(403)
  })
})
