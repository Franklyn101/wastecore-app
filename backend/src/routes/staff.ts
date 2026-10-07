import bcrypt from "bcryptjs"
import { Router } from "express"
import { z } from "zod"
import { audit } from "../audit.ts"
import { currentUser, requireAdmin, requireOwner, requireUser } from "../auth.ts"
import { prisma } from "../db.ts"
import { HttpError } from "../http.ts"
import { phoneSchema, trimmed } from "../validation.ts"

// The main admin adds staff, sets what they can do, and reads the activity log.
export const staffRouter = Router()
staffRouter.use("/admin/staff", requireUser, requireAdmin, requireOwner)
staffRouter.use("/admin/audit", requireUser, requireAdmin, requireOwner)

const staffRoleSchema = z.enum(["OWNER", "STAFF"], "Choose main admin or staff.")

const publicStaff = (u: { id: string; name: string; phone: string; staffRole: string | null; suspendedAt: Date | null; createdAt: Date }) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  staffRole: u.staffRole ?? "STAFF",
  disabled: Boolean(u.suspendedAt),
  createdAt: u.createdAt,
})

staffRouter.get("/admin/staff", async (_req, res) => {
  const staff = await prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: [{ suspendedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }] })
  res.json({ staff: staff.map(publicStaff) })
})

staffRouter.post("/admin/staff", async (req, res) => {
  const body = z
    .object({
      name: trimmed(100, "Name"),
      phone: phoneSchema,
      password: z.string().min(8, "Password must be at least 8 characters.").max(128),
      staffRole: staffRoleSchema.default("STAFF"),
    })
    .parse(req.body)
  if (await prisma.user.findUnique({ where: { phone: body.phone } })) {
    throw new HttpError(409, "This phone number already has a WasteCore account.")
  }
  const user = await prisma.user.create({
    data: {
      name: body.name,
      phone: body.phone,
      passwordHash: await bcrypt.hash(body.password, 12),
      role: "ADMIN",
      staffRole: body.staffRole,
      phoneVerifiedAt: new Date(), // the main admin vouches for the number
    },
  })
  await audit(currentUser(req), "staff.add", { type: "staff", id: user.id }, `Added ${body.staffRole === "OWNER" ? "main admin" : "staff"} ${user.name} (${user.phone})`)
  res.status(201).json({ staff: publicStaff(user) })
})

// Change someone's role, or disable/re-enable their login.
staffRouter.patch("/admin/staff/:id", async (req, res) => {
  const body = z
    .object({ staffRole: staffRoleSchema.optional(), disabled: z.boolean().optional() })
    .refine((b) => b.staffRole !== undefined || b.disabled !== undefined, "Nothing to update.")
    .parse(req.body)
  const me = currentUser(req)
  const target = await prisma.user.findFirst({ where: { id: String(req.params.id), role: "ADMIN" } })
  if (!target) throw new HttpError(404, "Staff member not found.")
  if (target.id === me.id) throw new HttpError(409, "You can't change your own access. Ask another main admin.")

  const demoting = body.staffRole === "STAFF" || body.disabled === true
  if (demoting && target.staffRole === "OWNER") {
    const owners = await prisma.user.count({ where: { role: "ADMIN", staffRole: "OWNER", suspendedAt: null } })
    if (owners <= 1) throw new HttpError(409, "There must always be at least one main admin.")
  }
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      staffRole: body.staffRole,
      ...(body.disabled !== undefined ? { suspendedAt: body.disabled ? new Date() : null, suspendedReason: body.disabled ? "Staff access removed" : null } : {}),
    },
  })
  if (body.disabled) await prisma.pushToken.deleteMany({ where: { userId: target.id } })
  const what = [
    body.staffRole && body.staffRole !== target.staffRole ? (body.staffRole === "OWNER" ? "made main admin" : "made staff") : null,
    body.disabled === true ? "login disabled" : body.disabled === false ? "login re-enabled" : null,
  ].filter(Boolean)
  await audit(me, "staff.update", { type: "staff", id: target.id }, `${target.name}: ${what.join(", ") || "no change"}`)
  res.json({ staff: publicStaff(updated) })
})

staffRouter.get("/admin/audit", async (req, res) => {
  const { q, targetType, targetId } = z
    .object({ q: z.string().trim().max(100).optional(), targetType: z.string().max(40).optional(), targetId: z.string().max(40).optional() })
    .parse(req.query)
  const entries = await prisma.auditLog.findMany({
    where: {
      targetType,
      targetId,
      ...(q ? { OR: [{ summary: { contains: q, mode: "insensitive" } }, { actorName: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  res.json({ entries })
})
