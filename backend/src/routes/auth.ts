import bcrypt from "bcryptjs"
import { Router } from "express"
import rateLimit from "express-rate-limit"
import { z } from "zod"
import { currentUser, publicUser, requireUser, signToken } from "../auth.ts"
import { config } from "../config.ts"
import { prisma } from "../db.ts"
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

authRouter.post("/auth/register", authLimiter, async (req, res) => {
  const body = registerSchema.parse(req.body)
  const existing = await prisma.user.findUnique({ where: { phone: body.phone } })
  if (existing) throw new HttpError(409, "An account with this phone number already exists. Please sign in.")

  const user = await prisma.user.create({
    data: {
      name: body.name,
      phone: body.phone,
      address: body.address,
      passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
    },
  })
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
