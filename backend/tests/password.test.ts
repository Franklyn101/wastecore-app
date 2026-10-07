import { createServer } from "node:http"
import { SMTPServer } from "smtp-server"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.ts"
import { prisma } from "../src/db.ts"
import { flushMessages } from "../src/messaging.ts"
import { resetDatabase, YENAGOA } from "./helpers.ts"

const app = createApp()

// Stand-ins for Termii and an email server that keep what they were sent.
let texts: { to: string; sms: string; from: string; api_key: string }[] = []
let emails: string[] = []
const termii = createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  texts.push(JSON.parse(Buffer.concat(chunks).toString()))
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ message_id: "1", message: "Successfully Sent" }))
})
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onData(stream, _session, done) {
    let raw = ""
    stream.on("data", (c: Buffer) => (raw += c.toString()))
    stream.on("end", () => {
      emails.push(raw)
      done()
    })
  },
})

beforeAll(async () => {
  await new Promise<void>((r) => termii.listen(4597, r))
  await new Promise<void>((r) => smtp.listen(4596, r))
})
afterAll(async () => {
  await new Promise((r) => termii.close(r))
  await new Promise((r) => smtp.close(() => r(null)))
  await prisma.$disconnect()
})
beforeEach(async () => {
  await resetDatabase()
  texts = []
  emails = []
})

const register = (phone = "08012345678") =>
  request(app).post("/auth/register").send({ name: "Ada Obi", phone, password: "old-password" })
const requestCode = (phone = "08012345678") => request(app).post("/auth/password-reset/request").send({ phone })
const confirm = (code: string, password = "new-password-1", phone = "08012345678") =>
  request(app).post("/auth/password-reset/confirm").send({ phone, code, password })
const login = (password: string) => request(app).post("/auth/login").send({ phone: "08012345678", password })

const resetTexts = () => texts.filter((t) => t.sms.includes("password reset"))
const verifyTexts = () => texts.filter((t) => t.sms.includes("verification"))

async function latestCode(which = resetTexts) {
  await flushMessages()
  return which().at(-1)!.sms.match(/\b(\d{6})\b/)![1]
}

describe("password reset", () => {
  it("texts a code, resets the password, signs in, and signs out other devices", async () => {
    const oldSession = { Authorization: `Bearer ${(await register()).body.token}` }

    const res = await requestCode("0801 234 5678")
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/If \+2348012345678 has a WasteCore account/)
    const code = await latestCode()
    expect(resetTexts()[0]).toMatchObject({ to: "2348012345678", from: "WasteCore", api_key: "test-termii-key" })
    expect(emails).toHaveLength(0) // no email on the account

    const done = await confirm(code)
    expect(done.status).toBe(200)
    expect(done.body.user.phone).toBe("+2348012345678")

    // The old password and the old session stop working; the new ones work.
    expect((await login("old-password")).status).toBe(401)
    expect((await login("new-password-1")).status).toBe(200)
    expect((await request(app).get("/me").set(oldSession)).status).toBe(401)
    expect((await request(app).get("/me").set({ Authorization: `Bearer ${done.body.token}` })).status).toBe(200)

    // A code works once.
    expect((await confirm(code, "another-pass-1")).status).toBe(400)
  })

  it("also emails the code when the account has an email", async () => {
    const auth = { Authorization: `Bearer ${(await register()).body.token}` }
    await request(app).patch("/me").set(auth).send({ email: "ada@example.com" })
    await requestCode()
    const code = await latestCode()
    expect(emails).toHaveLength(1)
    expect(emails[0]).toContain("ada@example.com")
    expect(emails[0]).toContain(code)
  })

  it("gives the same answer for unknown numbers and sends nothing", async () => {
    await register()
    const known = await requestCode()
    const unknown = await requestCode("08099999999")
    await flushMessages()
    expect(unknown.status).toBe(200)
    expect(unknown.body.message.replace(/\+\d+/, "")).toBe(known.body.message.replace(/\+\d+/, ""))
    expect(resetTexts()).toHaveLength(1)
    expect((await confirm("123456", "new-password-1", "08099999999")).status).toBe(400)
  })

  it("limits resends and wrong guesses", async () => {
    await register()
    await requestCode()
    await requestCode() // within a minute: no second text
    await flushMessages()
    expect(resetTexts()).toHaveLength(1)
    const code = await latestCode()
    const wrong = code === "000000" ? "111111" : "000000"

    for (let i = 0; i < 5; i++) expect((await confirm(wrong)).status).toBe(400)
    const locked = await confirm(code) // even the right code is refused now
    expect(locked.status).toBe(400)
    expect(locked.body.error).toMatch(/Too many wrong codes/)
  })

  it("expires codes after 15 minutes", async () => {
    await register()
    await requestCode()
    const code = await latestCode()
    await prisma.oneTimeCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await confirm(code)).status).toBe(400)
  })
})

describe("changing a password", () => {
  it("needs the current password", async () => {
    const auth = { Authorization: `Bearer ${(await register()).body.token}` }
    const bad = await request(app).post("/me/password").set(auth).send({ currentPassword: "nope", password: "new-password-1" })
    expect(bad.status).toBe(400)
    const ok = await request(app).post("/me/password").set(auth).send({ currentPassword: "old-password", password: "new-password-1" })
    expect(ok.status).toBe(200)
    expect(ok.body.token).toBeTruthy()
    expect((await login("new-password-1")).status).toBe(200)
  })

  it("lets staff set a temporary password for customers, but not for staff", async () => {
    await register()
    const staffRes = await request(app).post("/auth/register").send({ name: "Staff", phone: "08099990000", password: "staff-pass-1" })
    await prisma.user.update({ where: { id: staffRes.body.user.id }, data: { role: "ADMIN", staffRole: "OWNER" } })
    const staff = { Authorization: `Bearer ${staffRes.body.token}` }

    const res = await request(app).post("/admin/users/password").set(staff).send({ phone: "08012345678", password: "temporary-1" })
    expect(res.status).toBe(200)
    expect((await login("temporary-1")).status).toBe(200)

    await request(app).post("/auth/register").send({ name: "Other staff", phone: "08088880000", password: "other-pass-1" })
    await prisma.user.update({ where: { phone: "+2348088880000" }, data: { role: "ADMIN", staffRole: "OWNER" } })
    expect((await request(app).post("/admin/users/password").set(staff).send({ phone: "08088880000", password: "hijack-123" })).status).toBe(403)

    const customer = { Authorization: `Bearer ${(await login("temporary-1")).body.token}` }
    expect((await request(app).post("/admin/users/password").set(customer).send({ phone: "08099990000", password: "hijack-123" })).status).toBe(403)
  })
})

describe("phone verification", () => {
  it("texts a code at sign-up and unlocks the app once it's entered", async () => {
    const res = await register()
    expect(res.body.user.phoneVerified).toBe(false)
    const auth = { Authorization: `Bearer ${res.body.token}` }
    const code = await latestCode(verifyTexts)
    expect(verifyTexts()[0].to).toBe("2348012345678")

    // Signed in, but can't order until verified.
    const order = { type: "INSTANT_PICKUP", ...YENAGOA, address: "Yaba", wasteType: "Paper", asap: true }
    const blocked = await request(app).post("/orders").set(auth).send(order)
    expect(blocked.status).toBe(403)
    expect(blocked.body.error).toMatch(/verify your phone/)

    expect((await request(app).post("/me/phone/verify").set(auth).send({ code: code === "000000" ? "111111" : "000000" })).status).toBe(400)
    const ok = await request(app).post("/me/phone/verify").set(auth).send({ code })
    expect(ok.body.user.phoneVerified).toBe(true)
    expect((await request(app).post("/orders").set(auth).send(order)).status).toBe(201)
    expect((await request(app).post("/me/phone/send-code").set(auth)).status).toBe(409)
  })

  it("lets a new sign-up replace an unverified account on the same number", async () => {
    const typo = await register() // someone typed this number by mistake and never verified
    const owner = await request(app).post("/auth/register").send({ name: "Real Owner", phone: "08012345678", password: "owner-pass-1" })
    expect(owner.status).toBe(201)
    expect((await request(app).get("/me").set({ Authorization: `Bearer ${typo.body.token}` })).status).toBe(401)

    // A verified account still blocks the number.
    const auth = { Authorization: `Bearer ${owner.body.token}` }
    await request(app).post("/me/phone/verify").set(auth).send({ code: await latestCode(verifyTexts) })
    expect((await request(app).post("/auth/register").send({ name: "Someone", phone: "08012345678", password: "x-pass-123" })).status).toBe(409)
  })

  it("limits resends", async () => {
    const res = await register()
    const auth = { Authorization: `Bearer ${res.body.token}` }
    const again = await request(app).post("/me/phone/send-code").set(auth) // within a minute of sign-up
    expect(again.body).toMatchObject({ sent: false, resendAfterSeconds: 60 })
    await flushMessages()
    expect(verifyTexts()).toHaveLength(1)
  })

  it("counts a password reset by SMS as verifying the phone", async () => {
    await register()
    await requestCode()
    const done = await confirm(await latestCode())
    expect(done.body.user.phoneVerified).toBe(true)
  })

  it("doesn't need verifying for logins staff create", async () => {
    const staffRes = await request(app).post("/auth/register").send({ name: "Staff", phone: "08099990000", password: "staff-pass-1" })
    await prisma.user.update({ where: { id: staffRes.body.user.id }, data: { role: "ADMIN", staffRole: "OWNER" } })
    const staff = { Authorization: `Bearer ${staffRes.body.token}` }
    const c = await request(app).post("/admin/collectors").set(staff).send({ name: "Musa", phone: "07011112222", area: "Ikeja" })
    await request(app).put(`/admin/collectors/${c.body.collector.id}/login`).set(staff).send({ password: "musa-pass-123" })
    const musa = await request(app).post("/auth/login").send({ phone: "07011112222", password: "musa-pass-123" })
    expect(musa.body.user.phoneVerified).toBe(true)
    expect((await request(app).get("/collector/jobs").set({ Authorization: `Bearer ${musa.body.token}` })).status).toBe(200)
  })
})
