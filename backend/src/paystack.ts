import { createHmac, timingSafeEqual } from "node:crypto"
import { config } from "./config.ts"
import { HttpError } from "./http.ts"

// Minimal Paystack client: https://paystack.com/docs/api/
// Amounts are in kobo (₦1 = 100 kobo).

export type PaystackTransaction = {
  reference: string
  status: string // "success", "failed", "abandoned", "ongoing", "pending"...
  amount: number
  currency: string
  channel: string | null
  paid_at: string | null
  authorization?: {
    authorization_code: string
    reusable: boolean
    last4?: string
    brand?: string
    card_type?: string
    channel?: string
  } | null
}

export const paystackEnabled = () => Boolean(config.paystack.secretKey)

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!paystackEnabled()) throw new HttpError(503, "Online payments are not set up yet. Please pay by bank transfer.")
  let res: Response
  try {
    res = await fetch(`${config.paystack.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.paystack.secretKey}`,
        "Content-Type": "application/json",
        ...(init.headers as object),
      },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    console.error("Paystack request failed:", err)
    throw new HttpError(502, "Couldn't reach the payment provider. Please try again.")
  }
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T }
  if (!res.ok || !body.status || body.data === undefined) {
    console.error(`Paystack ${path} failed (${res.status}):`, body.message)
    throw new HttpError(502, "The payment provider couldn't process this request. Please try again.")
  }
  return body.data
}

export function initializeTransaction(input: {
  email: string
  amountKobo: number
  reference: string
  callbackUrl: string
  metadata: Record<string, unknown>
}) {
  return call<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  })
}

export function verifyTransaction(reference: string) {
  return call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
}

/** Charges a saved card (used for automatic renewals). */
export function chargeAuthorization(input: {
  authorizationCode: string
  email: string
  amountKobo: number
  reference: string
  metadata: Record<string, unknown>
}) {
  return call<PaystackTransaction>("/transaction/charge_authorization", {
    method: "POST",
    body: JSON.stringify({
      authorization_code: input.authorizationCode,
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      metadata: input.metadata,
    }),
  })
}

/** Paystack signs webhook bodies with HMAC-SHA512 of the raw body using the secret key. */
export function isValidWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature || !paystackEnabled()) return false
  const expected = createHmac("sha512", config.paystack.secretKey).update(rawBody).digest()
  const given = Buffer.from(signature, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** e.g. "Visa •••• 4081", for showing which card renews a plan. */
export function cardLabel(auth: NonNullable<PaystackTransaction["authorization"]>): string {
  const brand = (auth.brand || auth.card_type || "Card").trim()
  const name = brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase()
  return auth.last4 ? `${name} •••• ${auth.last4}` : name
}
