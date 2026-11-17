import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { prisma } from "./db.ts"
import type { User } from "./generated/prisma/client.ts"
import { HttpError } from "./http.ts"

const REMOVED = "Removed (account deleted)"
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`

/**
 * Things that must be settled before an account can go: money the customer has paid for work
 * not yet done, refunds still on their way, balances they owe, and jobs a collector holds.
 */
async function blockers(user: User): Promise<string | null> {
  if (user.role === "ADMIN") {
    return "Staff accounts can't be deleted from the app. Please ask the main admin to remove your access."
  }

  if (user.role === "COLLECTOR") {
    const collector = await prisma.collector.findUnique({ where: { userId: user.id } })
    const jobs = collector
      ? await prisma.order.count({ where: { collectorId: collector.id, status: "ASSIGNED" } })
      : 0
    if (jobs > 0) {
      return `You still have ${jobs === 1 ? "a job" : `${jobs} jobs`} assigned to you. Finish them or ask the office to reassign them, then try again.`
    }
    return null
  }

  const [onTheWay, openPaid, refunds, owed] = await Promise.all([
    prisma.order.findFirst({ where: { userId: user.id, status: "ASSIGNED", onTheWayAt: { not: null } } }),
    // Paid (or a transfer receipt waiting to be checked) but not done yet.
    prisma.order.findMany({
      where: { userId: user.id, status: { in: ["PENDING", "ASSIGNED"] }, amount: { gt: 0 } },
      select: { reference: true },
      take: 3,
    }),
    prisma.refund.count({ where: { userId: user.id, status: "PENDING" } }),
    prisma.order.findMany({
      where: { userId: user.id, extraAmount: { gt: 0 }, extraPaidAt: null, status: "COMPLETED" },
      select: { reference: true, extraAmount: true },
    }),
  ])
  if (onTheWay) return `A collector is on the way for ${onTheWay.reference}. Please wait until the pickup is done.`
  if (openPaid.length > 0) {
    const refs = openPaid.map((o) => o.reference).join(", ")
    return `You have paid orders that aren't done yet (${refs}). Wait until they're finished, or contact support for a refund, then try again.`
  }
  if (refunds > 0) return "A refund to you is still being processed. Please wait until it arrives, then try again."
  if (owed.length > 0) {
    const total = owed.reduce((sum, o) => sum + o.extraAmount, 0)
    return `You owe ${naira(total)} for extra bags (${owed.map((o) => o.reference).join(", ")}). Please pay it first, then try again.`
  }
  return null
}

/**
 * Deletes a person's account at their request. Personal details (name, phone, email, addresses,
 * map pins, notes, photos, support messages) are wiped and they can't sign in again. The phone
 * number is freed for a new sign-up. Order references, amounts and payments are kept, without
 * anything that says who or where, so the accounts still balance.
 */
export async function deleteAccount(user: User, password: string) {
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    // Not 401: that would sign the app out instead of showing the message.
    throw new HttpError(403, "That password isn't right.")
  }
  const blocked = await blockers(user)
  if (blocked) throw new HttpError(409, blocked)

  const now = new Date()
  const unusablePassword = await bcrypt.hash(randomBytes(32).toString("hex"), 4)
  const where = { userId: user.id }

  await prisma.$transaction(async (tx) => {
    await tx.address.deleteMany({ where })
    await tx.areaInterest.deleteMany({ where })
    await tx.pushToken.deleteMany({ where })
    await tx.notification.deleteMany({ where })
    await tx.oneTimeCode.deleteMany({ where })
    await tx.supportTicket.deleteMany({ where })
    await tx.quoteRequest.deleteMany({ where })

    // Unpaid orders and upcoming plan pickups won't happen now.
    await tx.order.updateMany({
      where: { ...where, status: { in: ["AWAITING_PAYMENT", "PENDING", "ASSIGNED"] } },
      data: { status: "CANCELLED" },
    })
    await tx.order.updateMany({
      where,
      data: {
        address: REMOVED,
        landmark: null,
        lat: null,
        lng: null,
        ratingComment: null,
        adminNote: null,
        customerNote: null,
        collectorNote: null,
        proofPhotoUrl: null,
      },
    })

    // Plans stop now and the saved card is forgotten, so nothing renews.
    await tx.subscription.updateMany({
      where: { ...where, status: { in: ["PENDING_PAYMENT", "ACTIVE"] } },
      data: { status: "CANCELLED", replacesId: null },
    })
    await tx.subscription.updateMany({
      where,
      data: { address: REMOVED, landmark: null, lat: null, lng: null, autoRenew: false, authorizationCode: null, cardLabel: null },
    })

    // A collector's record stays for their payouts, but it no longer has a login.
    await tx.collector.updateMany({ where, data: { userId: null, active: false } })

    await tx.user.update({
      where: { id: user.id },
      data: {
        name: "Deleted account",
        phone: `deleted:${user.id}`,
        email: null,
        address: null,
        passwordHash: unusablePassword,
        passwordChangedAt: now, // signs out every device
        phoneVerifiedAt: null,
        deletedAt: now,
      },
    })
  })
}
