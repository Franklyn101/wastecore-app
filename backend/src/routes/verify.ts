import { Router } from "express"
import rateLimit from "express-rate-limit"
import { z } from "zod"
import { currentUser, publicUser, requireUser } from "../auth.ts"
import { issueCode, RESEND_AFTER_SECONDS, useCode } from "../codes.ts"
import { config } from "../config.ts"
import { prisma } from "../db.ts"
import { HttpError } from "../http.ts"

// Proving the account's phone number is real: a code is texted at sign-up and entered in the app.
export const verifyRouter = Router()

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
})

verifyRouter.post("/me/phone/send-code", limiter, requireUser, async (req, res) => {
  const user = currentUser(req)
  if (user.phoneVerifiedAt) throw new HttpError(409, "Your phone number is already verified.")
  const sent = await issueCode(user, "PHONE_VERIFY")
  res.json({ sent, resendAfterSeconds: RESEND_AFTER_SECONDS })
})

verifyRouter.post("/me/phone/verify", limiter, requireUser, async (req, res) => {
  const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") }).parse(req.body)
  const user = currentUser(req)
  if (user.phoneVerifiedAt) {
    res.json({ user: publicUser(user) })
    return
  }
  await useCode(user.id, "PHONE_VERIFY", code)
  const verified = await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } })
  res.json({ user: publicUser(verified) })
})
