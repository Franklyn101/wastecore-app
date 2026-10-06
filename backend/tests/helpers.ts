import { prisma } from "../src/db.ts"

/** Empties every table. Deleting users cascades to their orders, plans, payments and tickets. */
export async function resetDatabase() {
  await prisma.user.deleteMany()
  await prisma.collector.deleteMany()
}
