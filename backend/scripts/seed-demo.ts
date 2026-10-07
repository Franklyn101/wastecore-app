// Adds demo accounts for trying the app locally. Safe to run more than once.
// Usage: npm run db:seed-demo   (never run this against a real database)
import bcrypt from "bcryptjs"
import { prisma } from "../src/db.ts"

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error("Refusing to add demo accounts in production. Set ALLOW_DEMO_SEED=true if you really mean it.")
}

const now = new Date()
const hash = (p: string) => bcrypt.hash(p, 10)

async function user(phone: string, name: string, password: string, role: "ADMIN" | "CUSTOMER" | "COLLECTOR", address?: string) {
  return prisma.user.upsert({
    where: { phone },
    create: { phone, name, role, address, passwordHash: await hash(password), phoneVerifiedAt: now },
    update: {},
  })
}

// Yenagoa, Bayelsa is the launch area (seeded by the service_areas migration).
const yenagoa = await prisma.serviceArea.findUniqueOrThrow({ where: { slug: "yenagoa" } })

await user("+2348090000001", "Grace (Ops)", "staff-password-123", "ADMIN")
const ada = await user("+2348035551234", "Ada Obi", "customer-pass-1", "CUSTOMER", "14 Azikoro Road, Ekeki, Yenagoa")
if ((await prisma.address.count({ where: { userId: ada.id } })) === 0) {
  await prisma.address.create({
    data: {
      userId: ada.id,
      label: "Home",
      address: "14 Azikoro Road, Ekeki, Yenagoa",
      landmark: "Opposite the filling station, green gate",
      lat: 4.9334,
      lng: 6.2735,
      areaId: yenagoa.id,
    },
  })
}

for (const c of [
  { phone: "+2347011112222", name: "Musa Bello", area: "Ekeki, Kpansia", login: true },
  { phone: "+2347033334444", name: "Ebiere Tari", area: "Amarata, Opolo", login: false },
]) {
  const existing = await prisma.collector.findFirst({ where: { phone: c.phone } })
  const login = c.login ? await user(c.phone, c.name, "collector-pass-1", "COLLECTOR") : null
  if (!existing) {
    await prisma.collector.create({
      data: { name: c.name, phone: c.phone, area: c.area, serviceAreaId: yenagoa.id, approvedAt: now, userId: login?.id },
    })
  }
}

console.log(`Demo accounts ready (password in brackets):
  Staff      08090000001 (staff-password-123)
  Customer   08035551234 (customer-pass-1)
  Collector  07011112222 (collector-pass-1)`)
await prisma.$disconnect()
