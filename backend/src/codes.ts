import { createHmac, randomInt, timingSafeEqual } from "node:crypto"
import { config } from "./config.ts"
import { prisma } from "./db.ts"
import type { CodePurpose, User } from "./generated/prisma/client.ts"
import { HttpError } from "./http.ts"
import { sendEmail, sendSms } from "./messaging.ts"

// 6-digit codes sent by SMS, used for password resets and phone verification.

export const CODE_TTL_MINUTES = 15
export const RESEND_AFTER_SECONDS = 60
const MAX_ATTEMPTS = 5
const MAX_CODES_PER_HOUR = 5

const hashCode = (userId: string, purpose: CodePurpose, code: string) =>
  createHmac("sha256", config.jwtSecret).update(`${userId}:${purpose}:${code}`).digest()

/**
 * Sends a new code, unless one went out in the last minute or five in the last hour.
 * Returns whether a code was sent. Only the newest code for each purpose works.
 */
export async function issueCode(user: User, purpose: CodePurpose): Promise<boolean> {
  const recent = await prisma.oneTimeCode.findMany({
    where: { userId: user.id, purpose, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
  })
  const tooSoon = recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_AFTER_SECONDS * 1000
  if (tooSoon || recent.length >= MAX_CODES_PER_HOUR) return false

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0")
  await prisma.oneTimeCode.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { usedAt: new Date() } })
  await prisma.oneTimeCode.create({
    data: {
      userId: user.id,
      purpose,
      codeHash: hashCode(user.id, purpose, code).toString("hex"),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
    },
  })

  const why = purpose === "PHONE_VERIFY" ? "verification" : "password reset"
  const text = `Your WasteCore ${why} code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. Don't share it with anyone.`
  sendSms(user.phone, text)
  // Verifying a phone has to go by SMS; a reset code can also go to the account's email.
  if (purpose === "PASSWORD_RESET" && user.email) {
    sendEmail(
      user.email,
      "Your WasteCore password reset code",
      `Hello ${user.name},\n\n${text}\n\nIf you didn't ask to reset your password, you can ignore this message.`,
    )
  }
  return true
}

/** Checks a code and uses it up. Throws a 400 for a wrong, expired or used code. */
export async function useCode(userId: string | null, purpose: CodePurpose, code: string): Promise<void> {
  const wrong = new HttpError(400, "That code is wrong or has expired. Check it, or request a new one.")
  if (!userId) throw wrong
  const current = await prisma.oneTimeCode.findFirst({
    where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  })
  if (!current) throw wrong
  if (current.attempts >= MAX_ATTEMPTS) throw new HttpError(400, "Too many wrong codes. Request a new code.")

  if (!timingSafeEqual(hashCode(userId, purpose, code), Buffer.from(current.codeHash, "hex"))) {
    await prisma.oneTimeCode.update({ where: { id: current.id }, data: { attempts: { increment: 1 } } })
    throw wrong
  }
  // Use the code exactly once, even if two requests race.
  const used = await prisma.oneTimeCode.updateMany({ where: { id: current.id, usedAt: null }, data: { usedAt: new Date() } })
  if (used.count === 0) throw wrong
}
