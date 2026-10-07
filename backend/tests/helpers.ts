import { prisma } from "../src/db.ts"

/** Empties every table. Deleting users cascades to their orders, plans, payments and tickets. */
export async function resetDatabase() {
  await prisma.user.deleteMany()
  await prisma.collector.deleteMany()
}

/** Marks a test account's phone as verified, as if the person had entered the SMS code. */
export async function verifyPhone(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { phoneVerifiedAt: new Date() } })
}
