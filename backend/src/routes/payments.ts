import express, { Router } from "express"
import { z } from "zod"
import { currentUser, requireCustomer, requireUser } from "../auth.ts"
import { paymentReference, recordPaystackResult, subscriptionCharge } from "../billing.ts"
import { config } from "../config.ts"
import { prisma } from "../db.ts"
import { findPlan, planLabel } from "../catalog.ts"
import type { Order, Payment } from "../generated/prisma/client.ts"
import { HttpError } from "../http.ts"
import { initializeTransaction, isValidWebhookSignature, type PaystackTransaction, verifyTransaction } from "../paystack.ts"

const startSchema = z
  .object({
    orderId: z.string().optional(),
    subscriptionId: z.string().optional(),
    email: z.email("Enter a valid email address.").max(200).optional(),
    returnUrl: z.string().max(500).optional(),
  })
  .refine((b) => Boolean(b.orderId) !== Boolean(b.subscriptionId), "Choose what to pay for.")

/** Only send customers back to the app itself, never to an arbitrary site. */
function safeReturnUrl(url: string | undefined): string | null {
  if (!url) return null
  return config.appReturnUrls.some((allowed) => url.startsWith(allowed)) ? url : null
}

function publicPayment(p: Payment) {
  return {
    reference: p.reference,
    purpose: p.purpose,
    amount: p.amount,
    status: p.status,
    orderId: p.orderId,
    subscriptionId: p.subscriptionId,
    paidAt: p.paidAt,
  }
}

/** Asks Paystack for the latest state of a payment and applies it. */
async function refresh(payment: Payment): Promise<Payment> {
  if (payment.status !== "INITIALIZED") return payment
  await recordPaystackResult(payment, await verifyTransaction(payment.reference))
  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })
}

export const paymentsRouter = Router()

// Paystack calls this with a signed JSON body; the signature covers the raw bytes,
// so this route reads the body itself (it is mounted before express.json()).
export const paystackWebhook = Router()
paystackWebhook.post("/payments/paystack/webhook", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  if (!isValidWebhookSignature(raw, req.header("x-paystack-signature"))) {
    res.sendStatus(401)
    return
  }
  const event = JSON.parse(raw.toString("utf8")) as { event?: string; data?: PaystackTransaction }
  if (event.event === "charge.success" && event.data?.reference) {
    const payment = await prisma.payment.findUnique({ where: { reference: event.data.reference } })
    if (payment) await recordPaystackResult(payment, event.data)
  }
  res.sendStatus(200)
})

// Start a Paystack checkout for an unpaid order, a new plan, or a plan renewal.
paymentsRouter.post("/payments", requireUser, requireCustomer, async (req, res) => {
  const body = startSchema.parse(req.body)
  let user = currentUser(req)

  let target: { purpose: Payment["purpose"]; amount: number; orderId?: string; subscriptionId?: string }
  if (body.orderId) {
    const order = await prisma.order.findFirst({ where: { id: body.orderId, userId: user.id } })
    if (!order) throw new HttpError(404, "Order not found.")
    if (order.status === "AWAITING_PAYMENT") {
      target = { purpose: "ORDER", amount: order.amount, orderId: order.id }
    } else if (order.status === "COMPLETED" && order.extraAmount > 0 && !order.extraPaidAt) {
      // Extra bags the collector found at the pickup.
      target = { purpose: "ORDER_BALANCE", amount: order.extraAmount, orderId: order.id }
    } else {
      throw new HttpError(409, "This order doesn't need paying.")
    }
  } else {
    const sub = await prisma.subscription.findFirst({ where: { id: body.subscriptionId, userId: user.id } })
    if (!sub) throw new HttpError(404, "Plan not found.")
    target = { ...subscriptionCharge(sub), subscriptionId: sub.id }
  }
  if (target.amount < 100) throw new HttpError(409, "Nothing to pay for this.")

  if (body.email && body.email !== user.email) {
    user = await prisma.user.update({ where: { id: user.id }, data: { email: body.email.toLowerCase() } })
  }
  if (!user.email) throw new HttpError(400, "Add your email address so Paystack can send your receipt.")

  const payment = await prisma.payment.create({
    data: { ...target, reference: paymentReference(), userId: user.id, returnUrl: safeReturnUrl(body.returnUrl) },
  })
  const checkout = await initializeTransaction({
    email: user.email,
    amountKobo: payment.amount * 100,
    reference: payment.reference,
    callbackUrl: `${config.publicUrl}/payments/paystack/callback`,
    metadata: { paymentId: payment.id, purpose: payment.purpose },
  })
  res.status(201).json({ payment: publicPayment(payment), authorizationUrl: checkout.authorization_url })
})

// Everything the customer has paid: card/online payments, and bank transfers staff confirmed.
paymentsRouter.get("/payments", requireUser, requireCustomer, async (req, res) => {
  const userId = currentUser(req).id
  const [online, transfers, cash] = await Promise.all([
    prisma.payment.findMany({
      where: { userId, status: "SUCCESS" },
      include: { order: true, subscription: true },
      orderBy: { paidAt: "desc" },
      take: 200,
    }),
    prisma.order.findMany({
      where: { userId, paymentMethod: "TRANSFER", paidAt: { not: null }, status: { not: "AWAITING_PAYMENT" } },
      orderBy: { paidAt: "desc" },
      take: 200,
    }),
    // Extra bags paid to the collector in cash.
    prisma.order.findMany({ where: { userId, extraPaymentMethod: "CASH" }, orderBy: { extraPaidAt: "desc" }, take: 200 }),
  ])
  const PURPOSE = { SUBSCRIPTION_START: "Plan started", SUBSCRIPTION_RENEWAL: "Plan renewed" }
  const describe = (p: (typeof online)[number]) => {
    if (p.purpose === "ORDER_BALANCE" && p.order) return `Extra bags for ${p.order.reference}`
    if (p.order) return orderDescription(p.order)
    return `${PURPOSE[p.purpose as keyof typeof PURPOSE]}: ${findPlan(p.subscription!.plan).name}`
  }
  const rows = [
    ...online.map((p) => ({
      id: p.id,
      reference: p.order?.reference ?? p.reference,
      description: describe(p),
      amount: p.amount,
      method: p.channel === "bank_transfer" ? "Paystack (transfer)" : p.channel === "ussd" ? "Paystack (USSD)" : "Paystack (card)",
      paidAt: p.paidAt!,
      orderId: p.orderId,
      subscriptionId: p.subscriptionId,
    })),
    ...transfers.map((o) => ({
      id: o.id,
      reference: o.reference,
      description: orderDescription(o),
      amount: o.amount,
      method: "Bank transfer",
      paidAt: o.paidAt!,
      orderId: o.id,
      subscriptionId: null,
    })),
    ...cash.map((o) => ({
      id: `${o.id}-extra`,
      reference: o.reference,
      description: `Extra bags for ${o.reference}`,
      amount: o.extraAmount,
      method: "Cash to collector",
      paidAt: o.extraPaidAt!,
      orderId: o.id,
      subscriptionId: null,
    })),
  ].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())
  res.json({ payments: rows, total: rows.reduce((sum, r) => sum + r.amount, 0) })
})

function orderDescription(o: Order) {
  if (o.type === "WASTE_BAGS") return `${planLabel(o.plan)} bags × ${o.quantity}`
  return `Instant pickup, ${o.quantity} bag${o.quantity === 1 ? "" : "s"}`
}

// The app calls this after checkout closes to learn whether the payment went through.
paymentsRouter.get("/payments/:reference", requireUser, requireCustomer, async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where: { reference: String(req.params.reference), userId: currentUser(req).id },
  })
  if (!payment) throw new HttpError(404, "Payment not found.")
  res.json({ payment: publicPayment(await refresh(payment)) })
})

// Paystack sends the customer's browser here after checkout.
paymentsRouter.get("/payments/paystack/callback", async (req, res) => {
  const reference = String(req.query.reference ?? req.query.trxref ?? "")
  const payment = reference ? await prisma.payment.findUnique({ where: { reference } }) : null
  if (payment) {
    try {
      await refresh(payment)
    } catch (err) {
      console.error("Payment callback verification failed:", err) // the app re-checks on return
    }
  }
  if (payment?.returnUrl) {
    const url = new URL(payment.returnUrl)
    url.searchParams.set("reference", payment.reference)
    res.redirect(302, url.toString())
    return
  }
  res
    .type("html")
    .send(
      `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;padding:24px">` +
        `<h2>Thank you</h2><p>You can return to the WasteCore app now.</p></body>`,
    )
})
