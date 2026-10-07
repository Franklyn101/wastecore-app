import { createServer } from "node:http"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { runBillingJobs } from "../src/billing.ts"
import { addDays, today } from "../src/dates.ts"
import { prisma } from "../src/db.ts"
import { flushPushes } from "../src/notify.ts"
import { resetDatabase, verifyPhone, YENAGOA } from "./helpers.ts"

const app = createApp()
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])
type Auth = Record<string, string>

// Stand-in for Expo's push service: records messages; tokens containing "dead" are reported unregistered.
type Push = { to: string; title: string; body: string; data: { url?: string } }
let pushes: Push[] = []
const expo = createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const batch = JSON.parse(Buffer.concat(chunks).toString()) as Push[]
  pushes.push(...batch)
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(
    JSON.stringify({
      data: batch.map((m) =>
        m.to.includes("dead") ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "x" },
      ),
    }),
  )
})

beforeAll(() => new Promise<void>((r) => expo.listen(4598, r)))
afterAll(async () => {
  await new Promise((r) => expo.close(r))
  await prisma.$disconnect()
})
beforeEach(async () => {
  await resetDatabase()
  pushes = []
})

async function register(phone: string, name: string, role?: "ADMIN"): Promise<Auth> {
  const res = await request(app).post("/auth/register").send({ name, phone, password: "password123" })
  await verifyPhone(res.body.user.id)
  if (role) await prisma.user.update({ where: { id: res.body.user.id }, data: { role } })
  return { Authorization: `Bearer ${res.body.token}` }
}

const inbox = async (auth: Auth) => (await request(app).get("/notifications").set(auth)).body

describe("notifications", () => {
  it("registers devices and pushes, dropping tokens for uninstalled apps", async () => {
    const ada = await register("08012345678", "Ada")
    expect((await request(app).post("/me/push-tokens").set(ada).send({ token: "not-a-token" })).status).toBe(400)
    await request(app).post("/me/push-tokens").set(ada).send({ token: "ExponentPushToken[live]", platform: "ios" }).expect(204)
    await request(app).post("/me/push-tokens").set(ada).send({ token: "ExponentPushToken[dead]" }).expect(204)

    await request(app)
      .post("/support-tickets")
      .set(ada)
      .send({ category: "Other", message: "Hello", contactTime: "Anytime" })
    const staff = await register("08099990000", "Staff", "ADMIN")
    const ticketId = (await prisma.supportTicket.findFirstOrThrow()).id
    await request(app).patch(`/admin/support-tickets/${ticketId}`).set(staff).send({ status: "RESOLVED" })
    await flushPushes()

    const sent = pushes.filter((p) => p.title === "Support ticket update")
    expect(sent.map((p) => p.to).sort()).toEqual(["ExponentPushToken[dead]", "ExponentPushToken[live]"])
    expect(sent[0].data.url).toBe("/support")
    expect(await prisma.pushToken.count()).toBe(1) // the dead one was removed

    // Signing out removes the device.
    await request(app).delete("/me/push-tokens").set(ada).send({ token: "ExponentPushToken[live]" }).expect(204)
    expect(await prisma.pushToken.count()).toBe(0)
  })

  it("follows an order from booking to completion", async () => {
    const ada = await register("08012345678", "Ada")
    const staff = await register("08099990000", "Staff", "ADMIN")
    const { body } = await request(app)
      .post("/orders")
      .set(ada)
      .send({ type: "INSTANT_PICKUP", ...YENAGOA, address: "12 Allen Avenue", wasteType: "Plastic", bags: 2, asap: true })
    const id = body.order.id
    await request(app).post(`/orders/${id}/receipt`).set(ada).attach("receipt", jpeg, { filename: "r.jpg", contentType: "image/jpeg" })
    expect((await inbox(staff)).notifications[0]).toMatchObject({ title: "Receipt to check", url: `/admin/orders/${id}` })

    // Rejected, re-uploaded, then confirmed with a collector who has the app.
    await request(app).patch(`/admin/orders/${id}`).set(staff).send({ status: "AWAITING_PAYMENT", customerNote: "Wrong amount" })
    expect((await inbox(ada)).notifications[0]).toMatchObject({ title: "Receipt not accepted", body: expect.stringContaining("Wrong amount") })
    await request(app).post(`/orders/${id}/receipt`).set(ada).attach("receipt", jpeg, { filename: "r.jpg", contentType: "image/jpeg" })

    const c = await request(app).post("/admin/collectors").set(staff).send({ name: "Musa", phone: "07011112222", area: "Ikeja" })
    await request(app).put(`/admin/collectors/${c.body.collector.id}/login`).set(staff).send({ password: "musa-pass-123" })
    const musa = { Authorization: `Bearer ${(await request(app).post("/auth/login").send({ phone: "07011112222", password: "musa-pass-123" })).body.token}` }
    await request(app).patch(`/admin/orders/${id}`).set(staff).send({ collectorId: c.body.collector.id })

    expect((await inbox(ada)).notifications[0].title).toBe("Payment confirmed")
    expect((await inbox(musa)).notifications[0]).toMatchObject({ title: "New ASAP job", url: `/collector/jobs/${id}` })

    await request(app).post(`/collector/jobs/${id}/on-the-way`).set(musa)
    await request(app).post(`/collector/jobs/${id}/on-the-way`).set(musa) // a second tap doesn't notify again
    await request(app).post(`/collector/jobs/${id}/complete`).set(musa)

    const titles = (await inbox(ada)).notifications.map((n: { title: string }) => n.title)
    expect(titles.slice(0, 3)).toEqual(["Pickup completed", "Your collector is on the way", "Payment confirmed"])
    expect(titles.filter((t: string) => t === "Your collector is on the way")).toHaveLength(1)
    expect((await inbox(ada)).unread).toBe(titles.length)

    // Reading.
    const first = (await inbox(ada)).notifications[0].id
    await request(app).post("/notifications/read").set(ada).send({ ids: [first] }).expect(204)
    expect((await inbox(ada)).unread).toBe(titles.length - 1)
    await request(app).post("/notifications/read").set(ada).send({}).expect(204)
    expect((await inbox(ada)).unread).toBe(0)
  })

  it("tells staff about collector applications and the collector when approved", async () => {
    const staff = await register("08099990000", "Staff", "ADMIN")
    const applied = await request(app)
      .post("/auth/register-collector")
      .send({ name: "Tunde", phone: "07077778888", password: "tunde-pass-1", area: "Yaba" })
    expect((await inbox(staff)).notifications[0].title).toBe("New collector application")
    const id = (await prisma.collector.findFirstOrThrow()).id
    await request(app).post(`/admin/collectors/${id}/approve`).set(staff)
    expect((await inbox({ Authorization: `Bearer ${applied.body.token}` })).notifications[0].title).toBe("You're approved")
  })

  it("reminds customers once when a plan that won't renew is ending, then when it ends", async () => {
    const ada = await register("08012345678", "Ada")
    const user = await prisma.user.findFirstOrThrow({ where: { phone: "+2348012345678" } })
    const sub = await prisma.subscription.create({
      data: {
        userId: user.id,
        plan: "weekly_1",
        status: "ACTIVE",
        address: "Yaba",
        wasteType: "Mixed",
        startDate: addDays(today(), -26),
        currentPeriodStart: addDays(today(), -26),
        currentPeriodEnd: addDays(today(), 2),
      },
    })
    await runBillingJobs()
    await runBillingJobs()
    const titles = () => inbox(ada).then((b) => b.notifications.map((n: { title: string }) => n.title))
    expect(await titles()).toEqual(["Your plan ends soon"])

    await prisma.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: today() } })
    await runBillingJobs()
    expect(await titles()).toEqual(["Your plan has ended", "Your plan ends soon"])
  })
})
