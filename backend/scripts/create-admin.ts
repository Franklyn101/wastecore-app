// Creates (or promotes) an admin account from ADMIN_NAME, ADMIN_PHONE and ADMIN_PASSWORD.
// Usage: npm run db:create-admin
import bcrypt from "bcryptjs"
import { prisma } from "../src/db.ts"
import { normalizePhone } from "../src/validation.ts"

const phone = normalizePhone(process.env.ADMIN_PHONE ?? "")
const password = process.env.ADMIN_PASSWORD ?? ""
const name = process.env.ADMIN_NAME?.trim() || "WasteCore Admin"

if (!phone) throw new Error("Set ADMIN_PHONE to a valid Nigerian phone number.")
if (password.length < 12) throw new Error("Set ADMIN_PASSWORD to at least 12 characters.")

const passwordHash = await bcrypt.hash(password, 12)
const admin = await prisma.user.upsert({
  where: { phone },
  create: { name, phone, passwordHash, role: "ADMIN" },
  update: { role: "ADMIN", passwordHash },
})
console.log(`Admin ready: ${admin.name} (${admin.phone})`)
await prisma.$disconnect()
