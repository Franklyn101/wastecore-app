import bcrypt from "bcryptjs"
import { Router } from "express"
import rateLimit from "express-rate-limit"
import { z } from "zod"
import { currentUser, publicUser, requireUser, signToken } from "../auth.ts"
import { config } from "../config.ts"
import { issueCode } from "../codes.ts"
import { prisma } from "../db.ts"
import { events } from "../events.ts"
import { HttpError } from "../http.ts"
import { phoneSchema, trimmed } from "../validation.ts"

const BCRYPT_ROUNDS = 12
// Compared against when the phone number is unknown, so a failed login takes
// the same time whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS)

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")

const registerSchema = z.object({
  name: trimmed(100, "Name"),
  phone: phoneSchema,
  password: passwordSchema,
  address: trimmed(300, "Address").optional(),
})

const registerCollectorSchema = registerSchema.omit({ address: true }).extend({
  area: trimmed(100, "Area"),
  // The city they'll work in (GET /areas). Optional for older app versions.
  serviceAreaId: z.string().optional(),
})

const loginSchema = z.object({
  phone: z.string(),
  password: z.string(),
})

const updateProfileSchema = z.object({
  name: trimmed(100, "Name").optional(),
  email: z.email("Enter a valid email address.").max(200).toLowerCase().optional(),
  address: trimmed(300, "Address").optional(),
})

export const authRouter = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
})

/**
 * Stops a number being blocked by someone who typed it by mistake: an unverified customer
 * account (which can't have orders, plans or tickets) gives way to a new sign-up. Only the
 * person who receives the SMS code can then verify it. Any other account on the number blocks.
 */
async function freeUnverifiedNumber(phone: string) {
  const existing = await prisma.user.findUnique({ where: { phone } })
  if (!existing) return
  if (existing.role === "CUSTOMER" && !existing.phoneVerifiedAt) {
    await prisma.user.delete({ where: { id: existing.id } })
    return
  }
  throw new HttpError(409, "An account with this phone number already exists. Please sign in.")
}

authRouter.post("/auth/register", authLimiter, async (req, res) => {
  const body = registerSchema.parse(req.body)
  await freeUnverifiedNumber(body.phone)

  const user = await prisma.user.create({
    data: {
      name: body.name,
      phone: body.phone,
      address: body.address,
      passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
    },
  })
  await issueCode(user, "PHONE_VERIFY")
  res.status(201).json({ token: signToken(user), user: publicUser(user) })
})

// Collectors can sign themselves up; they see no jobs until staff approve them.
authRouter.post("/auth/register-collector", authLimiter, async (req, res) => {
  const body = registerCollectorSchema.parse(req.body)
  const serviceAreaId = body.serviceAreaId
    ? (await prisma.serviceArea.findUnique({ where: { id: body.serviceAreaId } }))?.id
    : undefined
  await freeUnverifiedNumber(body.phone)
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)

  const user = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: body.name, phone: body.phone, passwordHash, role: "COLLECTOR" },
    })
    // If staff already added this collector (without a login), link to that record.
    // The phone number isn't verified, so it still needs approval either way.
    const existing = await tx.collector.findFirst({ where: { phone: body.phone, userId: null } })
    if (existing) {
      await tx.collector.update({ where: { id: existing.id }, data: { userId: user.id, approvedAt: null } })
    } else {
      await tx.collector.create({
        data: {
          name: body.name,
          phone: body.phone,
          area: body.area,
          serviceAreaId: serviceAreaId ?? null,
          userId: user.id,
          selfRegistered: true,
        },
      })
    }
    return user
  })
  await issueCode(user, "PHONE_VERIFY")
  await events.collectorApplied(body.name, body.area)
  res.status(201).json({ token: signToken(user), user: publicUser(user) })
})

authRouter.post("/auth/login", authLimiter, async (req, res) => {
  const body = loginSchema.parse(req.body)
  const phone = phoneSchema.safeParse(body.phone)
  const user = phone.success ? await prisma.user.findUnique({ where: { phone: phone.data } }) : null
  const valid = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !valid) throw new HttpError(401, "Incorrect phone number or password.")
  if (user.role === "COLLECTOR") {
    const collector = await prisma.collector.findUnique({ where: { userId: user.id } })
    if (!collector?.active) throw new HttpError(403, "Your collector account is inactive. Please contact the office.")
  }

  res.json({ token: signToken(user), user: publicUser(user) })
})

authRouter.get("/me", requireUser, (req, res) => {
  res.json({ user: publicUser(currentUser(req)) })
})

authRouter.patch("/me", requireUser, async (req, res) => {
  const body = updateProfileSchema.parse(req.body)
  const user = await prisma.user.update({ where: { id: currentUser(req).id }, data: body })
  res.json({ user: publicUser(user) })
})
