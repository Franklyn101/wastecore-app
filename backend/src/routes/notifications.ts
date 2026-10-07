import { Router } from "express"
import { z } from "zod"
import { currentUser, requireUser } from "../auth.ts"
import { prisma } from "../db.ts"

// Registering devices for push, and the in-app notification list. For every role.
export const notificationsRouter = Router()

const tokenSchema = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/, "That isn't an Expo push token."),
  platform: z.enum(["ios", "android"]).default("android"),
})

notificationsRouter.post("/me/push-tokens", requireUser, async (req, res) => {
  const { token, platform } = tokenSchema.parse(req.body)
  const userId = currentUser(req).id
  // A phone that switches accounts moves its token to the account now signed in.
  await prisma.pushToken.upsert({
    where: { token },
    create: { token, platform, userId },
    update: { userId, platform },
  })
  res.status(204).end()
})

// Called on sign-out so a shared phone stops getting the previous user's alerts.
notificationsRouter.delete("/me/push-tokens", requireUser, async (req, res) => {
  const { token } = tokenSchema.pick({ token: true }).parse(req.body)
  await prisma.pushToken.deleteMany({ where: { token, userId: currentUser(req).id } })
  res.status(204).end()
})

notificationsRouter.get("/notifications", requireUser, async (req, res) => {
  const userId = currentUser(req).id
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ])
  res.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      url: n.url,
      read: Boolean(n.readAt),
      createdAt: n.createdAt,
    })),
    unread,
  })
})

// Marks the given notifications (or all of them) as read.
notificationsRouter.post("/notifications/read", requireUser, async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).max(200).optional() }).parse(req.body ?? {})
  await prisma.notification.updateMany({
    where: { userId: currentUser(req).id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  })
  res.status(204).end()
})
