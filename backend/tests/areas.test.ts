import request from "supertest"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { prisma } from "../src/db.ts"
import { ABUJA, PORT_HARCOURT, resetDatabase, verifyPhone, YENAGOA } from "./helpers.ts"

const app = createApp()
type Auth = Record<string, string>

beforeEach(resetDatabase)
afterAll(() => prisma.$disconnect())

async function register(phone: string, role?: "ADMIN"): Promise<Auth> {
  const res = await request(app).post("/auth/register").send({ name: "Ebi", phone, password: "password123" })
  await verifyPhone(res.body.user.id)
  if (role) await prisma.user.update({ where: { id: res.body.user.id }, data: { role } })
  return { Authorization: `Bearer ${res.body.token}` }
}

const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
const pickup = { type: "INSTANT_PICKUP", wasteType: "Mixed", pickupDate: tomorrow }

describe("service areas", () => {
  it("lists areas in launch order with Yenagoa live first", async () => {
    const { body } = await request(app).get("/areas").expect(200)
    expect(body.areas.map((a: { slug: string; active: boolean }) => [a.slug, a.active])).toEqual([
      ["yenagoa", true],
      ["port-harcourt", false],
      ["lagos", false],
    ])
  })

  it("says whether a pinned spot is served", async () => {
    const inYenagoa = (await request(app).get("/areas/locate").query(YENAGOA)).body
    expect(inYenagoa).toMatchObject({ served: true, area: { slug: "yenagoa" } })

    const inPh = (await request(app).get("/areas/locate").query(PORT_HARCOURT)).body
    expect(inPh).toMatchObject({ served: false, area: { slug: "port-harcourt" } })

    const inAbuja = (await request(app).get("/areas/locate").query(ABUJA)).body
    expect(inAbuja.served).toBe(false)
    expect(inAbuja.area).toBeNull()
    expect(inAbuja.nearest).toBeTruthy()
  })

  it("only books inside a live area", async () => {
    const ebi = await register("08031112222")
    const ok = await request(app).post("/orders").set(ebi).send({ ...pickup, ...YENAGOA, address: "Opolo Rd", landmark: "Near the market" })
    expect(ok.status).toBe(201)
    expect(ok.body.order).toMatchObject({ address: "Opolo Rd", landmark: "Near the market", lat: YENAGOA.lat })
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: ok.body.order.id }, include: { area: true } })
    expect(saved.area?.slug).toBe("yenagoa")

    const ph = await request(app).post("/orders").set(ebi).send({ ...pickup, ...PORT_HARCOURT, address: "GRA" })
    expect(ph.status).toBe(422)
    expect(ph.body.error).toMatch(/not in Port Harcourt yet/)

    const abuja = await request(app).post("/orders").set(ebi).send({ ...pickup, ...ABUJA, address: "Wuse" })
    expect(abuja.status).toBe(422)
    expect(abuja.body.error).toMatch(/outside the areas we serve/)

    const noPin = await request(app).post("/orders").set(ebi).send({ ...pickup, address: "Somewhere" })
    expect(noPin.status).toBe(400)
  })

  it("saves addresses and books with them", async () => {
    const ebi = await register("08031112222")
    const created = await request(app).post("/addresses").set(ebi).send({ label: "Home", address: "Kpansia", ...YENAGOA })
    expect(created.status).toBe(201)
    expect(created.body.address.areaName).toBe("Yenagoa, Bayelsa")
    const id = created.body.address.id

    expect((await request(app).post("/addresses").set(ebi).send({ address: "GRA", ...PORT_HARCOURT })).status).toBe(422)
    expect((await request(app).patch(`/addresses/${id}`).set(ebi).send(PORT_HARCOURT)).status).toBe(422)
    await request(app).patch(`/addresses/${id}`).set(ebi).send({ landmark: "Blue gate" }).expect(200)

    const order = await request(app).post("/orders").set(ebi).send({ ...pickup, addressId: id })
    expect(order.status).toBe(201)
    expect(order.body.order).toMatchObject({ address: "Kpansia", landmark: "Blue gate" })

    const plan = await request(app)
      .post("/subscriptions")
      .set(ebi)
      .send({ plan: "weekly_1", wasteType: "Mixed", startDate: tomorrow, addressId: id })
    expect(plan.status).toBe(201)
    expect(plan.body.subscription.lat).toBe(YENAGOA.lat)

    // Someone else's address can't be used.
    const other = await register("08031113333")
    expect((await request(app).post("/orders").set(other).send({ ...pickup, addressId: id })).status).toBe(404)

    await request(app).delete(`/addresses/${id}`).set(ebi).expect(204)
    expect((await request(app).get("/addresses").set(ebi)).body.addresses).toHaveLength(0)
  })

  it("lets staff launch an area and tells the people waiting for it", async () => {
    const ebi = await register("08031112222")
    const staff = await register("08090000001", "ADMIN")
    await request(app).post("/areas/interest").set(ebi).send(PORT_HARCOURT).expect(201)
    await request(app).post("/areas/interest").set(ebi).send(PORT_HARCOURT).expect(201) // counted once

    const customerTry = await request(app).patch("/admin/areas/area_port_harcourt").set(ebi).send({ active: true })
    expect(customerTry.status).toBe(403)

    const list = (await request(app).get("/admin/areas").set(staff)).body.areas
    expect(list.find((a: { slug: string }) => a.slug === "port-harcourt").waitingCustomers).toBe(1)

    await request(app).patch("/admin/areas/area_port_harcourt").set(staff).send({ active: true, radiusKm: 25 }).expect(200)
    const note = await prisma.notification.findFirst({ where: { title: "WasteCore is now in Port Harcourt" } })
    expect(note).toBeTruthy()

    const booked = await request(app).post("/orders").set(ebi).send({ ...pickup, ...PORT_HARCOURT, address: "GRA" })
    expect(booked.status).toBe(201)

    const tooBig = await request(app).patch("/admin/areas/area_lagos").set(staff).send({ radiusKm: 500 })
    expect(tooBig.status).toBe(400)
  })
})
