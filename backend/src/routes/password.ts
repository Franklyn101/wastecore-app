import bcrypt from "bcryptjs"
import { Router } from "express"
import rateLimit from "express-rate-limit"
import { z } from "zod"
import { currentUser, publicUser, requireAdmin, requireOwner, requireUser, signToken } from "../auth.ts"
import { issueCode, RESEND_AFTER_SECONDS, useCode } from "../codes.ts"
import { config } from "../config.ts"
import { audit } from "../audit.ts"
import { prisma } from "../db.ts"
import type { User } from "../generated/prisma/client.ts"
import { HttpError } from "../http.ts"
import { phoneSchema } from "../validation.ts"

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")

/** Saves a new password and signs the account out everywhere else. */
async function setPassword(userId: string, password: string, extra: { phoneVerifiedAt?: Date } = {}): Promise<User> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12), passwordChangedAt: new Date(), ...extra },
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

  if (user) await issueCode(user, "PASSWORD_RESET")
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
  // Unknown numbers get the same "wrong code" error as wrong codes.
  const user = await prisma.user.findUnique({ where: { phone: body.phone } })
  await useCode(user?.id ?? null, "PASSWORD_RESET", body.code)
  if (!user) throw new HttpError(400, "That code is wrong or has expired.") // unreachable: useCode threw

  // Receiving the SMS code also proves the phone number works.
  const updated = await setPassword(user.id, body.password, user.phoneVerifiedAt ? {} : { phoneVerifiedAt: new Date() })
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
passwordRouter.post("/admin/users/password", requireUser, requireAdmin, requireOwner, async (req, res) => {
  const body = z.object({ phone: phoneSchema, password: passwordSchema }).parse(req.body)
  const user = await prisma.user.findUnique({ where: { phone: body.phone } })
  if (!user) throw new HttpError(404, "No account uses that phone number.")
  if (user.role === "ADMIN") throw new HttpError(403, "Staff passwords can't be reset here.")
  await setPassword(user.id, body.password)
  await audit(currentUser(req), "account.temporary_password", { type: user.role.toLowerCase(), id: user.id }, `Set a temporary password for ${user.name} (${user.phone})`)
  res.json({ user: { name: user.name, phone: user.phone, role: user.role } })
})
