import { createHmac, randomInt, timingSafeEqual } from "node:crypto"
import bcrypt from "bcryptjs"
import { Router } from "express"
import rateLimit from "express-rate-limit"
import { z } from "zod"
import { currentUser, publicUser, requireAdmin, requireUser, signToken } from "../auth.ts"
import { config } from "../config.ts"
import { prisma } from "../db.ts"
import type { User } from "../generated/prisma/client.ts"
import { HttpError } from "../http.ts"
import { sendEmail, sendSms } from "../messaging.ts"
import { phoneSchema } from "../validation.ts"

const CODE_TTL_MINUTES = 15
const MAX_ATTEMPTS = 5
const RESEND_AFTER_SECONDS = 60
const MAX_CODES_PER_HOUR = 5

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")

const hashCode = (userId: string, code: string) =>
  createHmac("sha256", config.jwtSecret).update(`${userId}:${code}`).digest()

/** Saves a new password and signs the account out everywhere else. */
async function setPassword(userId: string, password: string): Promise<User> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12), passwordChangedAt: new Date() },
  })
  // Other devices are signed out, so they shouldn't keep getting this account's alerts either.
  await prisma.pushToken.deleteMany({ where: { userId } })
  return user
}

export const passwordRouter = Router()

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
})

// Step 1: send a code. The answer is the same whether or not the number has an account,
// so this can't be used to find out who uses WasteCore.
passwordRouter.post("/auth/password-reset/request", resetLimiter, async (req, res) => {
  const { phone } = z.object({ phone: phoneSchema }).parse(req.body)
  const user = await prisma.user.findUnique({ where: { phone } })

  if (user) {
    const recent = await prisma.passwordReset.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
    })
    const tooSoon = recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_AFTER_SECONDS * 1000
    if (!tooSoon && recent.length < MAX_CODES_PER_HOUR) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0")
      // Only the newest code works.
      await prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } })
      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          codeHash: hashCode(user.id, code).toString("hex"),
          expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
        },
      })
      const text = `Your WasteCore code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. Don't share it with anyone.`
      sendSms(user.phone, text)
      if (user.email) sendEmail(user.email, "Your WasteCore password reset code", `Hello ${user.name},\n\n${text}\n\nIf you didn't ask to reset your password, you can ignore this message.`)
    }
  }
  res.json({
    message: `If ${phone} has a WasteCore account, we've sent a 6-digit code to it (and to the account's email, if it has one).`,
    resendAfterSeconds: RESEND_AFTER_SECONDS,
  })
})

// Step 2: the code and a new password. Signs the person in.
passwordRouter.post("/auth/password-reset/confirm", resetLimiter, async (req, res) => {
  const body = z
    .object({
      phone: phoneSchema,
      code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
      password: passwordSchema,
    })
    .parse(req.body)
  const wrong = new HttpError(400, "That code is wrong or has expired. Check it, or request a new one.")

  const user = await prisma.user.findUnique({ where: { phone: body.phone } })
  if (!user) throw wrong
  const reset = await prisma.passwordReset.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  })
  if (!reset) throw wrong
  if (reset.attempts >= MAX_ATTEMPTS) throw new HttpError(400, "Too many wrong codes. Request a new code.")

  const matches = timingSafeEqual(hashCode(user.id, body.code), Buffer.from(reset.codeHash, "hex"))
  if (!matches) {
    await prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } })
    throw wrong
  }
  // Use the code exactly once, even if two requests race.
  const used = await prisma.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } })
  if (used.count === 0) throw wrong

  const updated = await setPassword(user.id, body.password)
  res.json({ token: signToken(updated), user: publicUser(updated) })
})

// Change password while signed in. Returns a new sign-in token for this device.
passwordRouter.post("/me/password", requireUser, async (req, res) => {
  const body = z.object({ currentPassword: z.string(), password: passwordSchema }).parse(req.body)
  const user = currentUser(req)
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Your current password is wrong.")
  }
  const updated = await setPassword(user.id, body.password)
  res.json({ token: signToken(updated), user: publicUser(updated) })
})

// Staff help someone who's locked out (e.g. no SMS signal) by giving them a temporary password.
passwordRouter.post("/admin/users/password", requireUser, requireAdmin, async (req, res) => {
  const body = z.object({ phone: phoneSchema, password: passwordSchema }).parse(req.body)
  const user = await prisma.user.findUnique({ where: { phone: body.phone } })
  if (!user) throw new HttpError(404, "No account uses that phone number.")
  if (user.role === "ADMIN") throw new HttpError(403, "Staff passwords can't be reset here.")
  await setPassword(user.id, body.password)
  res.json({ user: { name: user.name, phone: user.phone, role: user.role } })
})
