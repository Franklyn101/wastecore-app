import { config } from "./config.ts"
import { prisma } from "./db.ts"

// Notifications are saved (for the in-app list) and pushed to the user's phones
// through Expo's push service: https://docs.expo.dev/push-notifications/sending-notifications/

type Message = { title: string; body: string; url?: string }

const EXPO_BATCH = 100
const pending = new Set<Promise<void>>()

/** Waits for pushes still being sent. Used by tests and on shutdown. */
export async function flushPushes() {
  await Promise.all([...pending])
}

async function sendPushes(userIds: string[], msg: Message) {
  const tokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } })
  for (let i = 0; i < tokens.length; i += EXPO_BATCH) {
    const batch = tokens.slice(i, i + EXPO_BATCH)
    try {
      const res = await fetch(config.expoPushUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(config.expoAccessToken ? { Authorization: `Bearer ${config.expoAccessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((t) => ({
            to: t.token,
            title: msg.title,
            body: msg.body,
            data: msg.url ? { url: msg.url } : {},
            sound: "default",
            channelId: "default",
          })),
        ),
        signal: AbortSignal.timeout(15_000),
      })
      const result = (await res.json().catch(() => ({}))) as {
        data?: { status: string; details?: { error?: string } }[]
      }
      // Forget tokens for apps that were uninstalled or signed out elsewhere.
      const dead = batch.filter((_, j) => result.data?.[j]?.details?.error === "DeviceNotRegistered").map((t) => t.token)
      if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } })
      if (!res.ok) console.error(`Expo push failed (${res.status}).`)
    } catch (err) {
      console.error("Expo push failed:", err)
    }
  }
}

/**
 * Notifies users: saves the notification (awaited) and pushes it to their devices
 * in the background, so a slow push service never slows down a request.
 */
export async function notify(userIds: string | string[], msg: Message) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])]
  if (ids.length === 0) return
  await prisma.notification.createMany({
    data: ids.map((userId) => ({ userId, title: msg.title, body: msg.body, url: msg.url })),
  })
  const push = sendPushes(ids, msg).finally(() => pending.delete(push))
  pending.add(push)
}

/** Notifies every staff account. */
export async function notifyStaff(msg: Message) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })
  await notify(
    admins.map((a) => a.id),
    msg,
  )
}

/** Notifies the collector's app login, if they have one. */
export async function notifyCollector(collectorId: string | null | undefined, msg: Message) {
  if (!collectorId) return
  const collector = await prisma.collector.findUnique({ where: { id: collectorId }, select: { userId: true } })
  if (collector?.userId) await notify(collector.userId, msg)
}
