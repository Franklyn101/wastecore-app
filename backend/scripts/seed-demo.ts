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

await user("+2348090000001", "Grace (Ops)", "staff-password-123", "ADMIN")
await user("+2348035551234", "Ada Obi", "customer-pass-1", "CUSTOMER", "12 Allen Avenue, Ikeja, Lagos")

for (const c of [
  { phone: "+2347011112222", name: "Musa Bello", area: "Ikeja, Ogba", login: true },
  { phone: "+2347033334444", name: "Bola Ahmed", area: "Lekki, Ajah", login: false },
]) {
  const existing = await prisma.collector.findFirst({ where: { phone: c.phone } })
  const login = c.login ? await user(c.phone, c.name, "collector-pass-1", "COLLECTOR") : null
  if (!existing) {
    await prisma.collector.create({
      data: { name: c.name, phone: c.phone, area: c.area, approvedAt: now, userId: login?.id },
    })
  }
}

console.log(`Demo accounts ready (password in brackets):
  Staff      08090000001 (staff-password-123)
  Customer   08035551234 (customer-pass-1)
  Collector  07011112222 (collector-pass-1)`)
await prisma.$disconnect()
