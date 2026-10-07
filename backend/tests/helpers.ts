import { prisma } from "../src/db.ts"

/** A spot in central Yenagoa, inside the launch area. */
export const YENAGOA = { lat: 4.9247, lng: 6.2676 }
/** Central Port Harcourt: a known area that isn't live yet. */
export const PORT_HARCOURT = { lat: 4.8156, lng: 7.0498 }
/** Abuja: outside every area. */
export const ABUJA = { lat: 9.0765, lng: 7.3986 }

/** Empties every table. Deleting users cascades to their orders, plans, payments and tickets. */
export async function resetDatabase() {
  await prisma.user.deleteMany()
  await prisma.collector.deleteMany()
  // Service areas are seeded by the migration; put them back to launch state.
  await prisma.serviceArea.updateMany({ data: { active: false } })
  await prisma.serviceArea.update({ where: { slug: "yenagoa" }, data: { active: true, radiusKm: 15, centerLat: YENAGOA.lat, centerLng: YENAGOA.lng } })
  await prisma.serviceArea.update({ where: { slug: "port-harcourt" }, data: { radiusKm: 20 } })
}

/** Marks a test account's phone as verified, as if the person had entered the SMS code. */
export async function verifyPhone(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { phoneVerifiedAt: new Date() } })
}
