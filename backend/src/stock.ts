import { findBagSize } from "./catalog.ts"
import { prisma } from "./db.ts"
import { events } from "./events.ts"
import type { Order } from "./generated/prisma/client.ts"
import { HttpError } from "./http.ts"

// Waste bag packs in the store. Only sizes staff have set a stock level for are tracked.

/** Packs of a size on order but not yet delivered. */
async function reserved(size: string, exceptOrderId?: string) {
  const open = await prisma.order.aggregate({
    where: {
      type: "WASTE_BAGS",
      plan: size,
      status: { in: ["AWAITING_PAYMENT", "PENDING", "ASSIGNED"] },
      ...(exceptOrderId ? { id: { not: exceptOrderId } } : {}),
    },
    _sum: { quantity: true },
  })
  return open._sum.quantity ?? 0
}

export async function stockLevels() {
  const rows = await prisma.bagStock.findMany()
  return Promise.all(
    rows.map(async (r) => {
      const onOrder = await reserved(r.size)
      return { size: r.size, name: findBagSize(r.size)?.name ?? r.size, packs: r.packs, onOrder, available: r.packs - onOrder, lowAt: r.lowAt }
    }),
  )
}

/** Refuses a bag order there aren't enough packs for. */
export async function assertInStock(size: string, packs: number) {
  const row = await prisma.bagStock.findUnique({ where: { size } })
  if (!row) return
  const available = row.packs - (await reserved(size))
  if (packs > available) {
    const name = findBagSize(size)?.name ?? size
    throw new HttpError(
      409,
      available > 0 ? `Only ${available} pack${available === 1 ? "" : "s"} of ${name.toLowerCase()} bags left.` : `${name} bags are out of stock right now.`,
    )
  }
}

/** Takes delivered packs out of stock, and warns staff when a size runs low. */
export async function bagsDelivered(order: Order, by?: string) {
  if (order.type !== "WASTE_BAGS") return
  const row = await prisma.bagStock.findUnique({ where: { size: order.plan } })
  if (!row) return
  const [updated] = await prisma.$transaction([
    prisma.bagStock.update({ where: { size: order.plan }, data: { packs: { decrement: order.quantity } } }),
    prisma.stockMovement.create({
      data: { size: order.plan, change: -order.quantity, reason: `Delivered ${order.reference}`, orderId: order.id, createdById: by },
    }),
  ])
  if (row.packs > row.lowAt && updated.packs <= row.lowAt) await events.lowStock(findBagSize(order.plan)?.name ?? order.plan, updated.packs)
}
