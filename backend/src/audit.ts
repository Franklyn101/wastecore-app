import { prisma } from "./db.ts"
import type { User } from "./generated/prisma/client.ts"

/** Records a staff action for the audit log (Overview → Activity, main admin only). */
export async function audit(actor: User, action: string, target: { type: string; id?: string | null }, summary: string) {
  await prisma.auditLog.create({
    data: { actorId: actor.id, actorName: actor.name, action, targetType: target.type, targetId: target.id ?? null, summary },
  })
}
