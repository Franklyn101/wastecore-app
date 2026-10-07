// A stand-in for Paystack's API, for tests and for trying the app without Paystack keys.
// Implements initialize, verify and charge_authorization, plus a checkout page
// with "Pay" and "Cancel" buttons that redirects back like the real one.
//
// Run it with `npm run paystack:mock`, then start the API with
// PAYSTACK_BASE_URL=http://localhost:4599 and any PAYSTACK_SECRET_KEY.
import { createServer, type Server } from "node:http"

type Txn = {
  reference: string
  amount: number
  email: string
  callbackUrl: string
  status: "ongoing" | "success" | "failed" | "abandoned"
  channel: string | null
  paidAt: string | null
  authorization: Record<string, unknown> | null
}

export type MockPaystack = {
  server: Server
  transactions: Map<string, Txn>
  /** Marks a transaction paid, as if the customer completed checkout. */
  pay: (reference: string, channel?: "card" | "bank_transfer") => void
  /** Makes the next charge_authorization calls succeed or fail. */
  setCardCharges: (outcome: "success" | "failed") => void
  close: () => Promise<void>
}

const card = (code = "AUTH_mock_reusable") => ({
  authorization_code: code,
  reusable: true,
  last4: "4081",
  brand: "visa",
  card_type: "visa",
  channel: "card",
})

export function startMockPaystack(port = 4599): Promise<MockPaystack> {
  const transactions = new Map<string, Txn>()
  let cardCharges: "success" | "failed" = "success"

  const pay = (reference: string, channel: "card" | "bank_transfer" = "card") => {
    const t = transactions.get(reference)
    if (!t) throw new Error(`Unknown mock transaction ${reference}`)
    Object.assign(t, {
      status: "success",
      channel,
      paidAt: new Date().toISOString(),
      authorization: channel === "card" ? card() : { reusable: false, channel },
    })
  }

  const view = (t: Txn) => ({
    reference: t.reference,
    status: t.status,
    amount: t.amount,
    currency: "NGN",
    channel: t.channel,
    paid_at: t.paidAt,
    authorization: t.authorization,
  })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`)
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" })
      res.end(JSON.stringify(data))
    }
    const authed = (req.headers.authorization ?? "").startsWith("Bearer sk_")

    if (url.pathname === "/transaction/initialize" && req.method === "POST") {
      if (!authed) return send(401, { status: false, message: "Invalid key" })
      transactions.set(body.reference, {
        reference: body.reference,
        amount: body.amount,
        email: body.email,
        callbackUrl: body.callback_url,
        status: "ongoing",
        channel: null,
        paidAt: null,
        authorization: null,
      })
      return send(200, {
        status: true,
        message: "Authorization URL created",
        data: {
          // CHECKOUT_PUBLIC_URL lets a phone on the same Wi-Fi open the checkout (e.g. http://192.168.1.20:4599).
          authorization_url: `${(process.env.CHECKOUT_PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, "")}/checkout/${encodeURIComponent(body.reference)}`,
          access_code: `ac_${body.reference}`,
          reference: body.reference,
        },
      })
    }

    const verify = url.pathname.match(/^\/transaction\/verify\/(.+)$/)
    if (verify && req.method === "GET") {
      const t = transactions.get(decodeURIComponent(verify[1]))
      if (!t) return send(404, { status: false, message: "Transaction reference not found" })
      return send(200, { status: true, message: "Verification successful", data: view(t) })
    }

    if (url.pathname === "/refund" && req.method === "POST") {
      const t = transactions.get(body.transaction)
      if (!t || t.status !== "success") return send(400, { status: false, message: "Transaction not found or not successful" })
      const amount = body.amount ?? t.amount
      if (amount > t.amount) return send(400, { status: false, message: "Refund amount is more than the transaction amount" })
      return send(200, { status: true, message: "Refund has been queued for processing", data: { id: Date.now(), status: "pending", amount } })
    }

    if (url.pathname === "/transaction/charge_authorization" && req.method === "POST") {
      const t: Txn = {
        reference: body.reference,
        amount: body.amount,
        email: body.email,
        callbackUrl: "",
        status: cardCharges,
        channel: "card",
        paidAt: cardCharges === "success" ? new Date().toISOString() : null,
        authorization: card(body.authorization_code),
      }
      transactions.set(t.reference, t)
      return send(200, { status: true, message: "Charge attempted", data: view(t) })
    }

    // The hosted checkout page the customer sees.
    const checkout = url.pathname.match(/^\/checkout\/(.+)$/)
    if (checkout) {
      const t = transactions.get(decodeURIComponent(checkout[1]))
      if (!t) return send(404, { status: false, message: "Not found" })
      const outcome = url.searchParams.get("outcome")
      if (outcome) {
        if (outcome === "pay") pay(t.reference, "card")
        else t.status = "abandoned"
        res.writeHead(302, { Location: `${t.callbackUrl}?trxref=${t.reference}&reference=${t.reference}` })
        return res.end()
      }
      res.writeHead(200, { "Content-Type": "text/html" })
      return res.end(`<!doctype html><meta name="viewport" content="width=device-width">
        <body style="font-family:sans-serif;padding:24px;max-width:420px;margin:auto">
        <p style="color:#888">Paystack (test mode stand-in)</p>
        <h2>Pay ₦${(t.amount / 100).toLocaleString("en-NG")}</h2><p>${t.email}</p>
        <p>Card: 4084 0840 8408 4081</p>
        <a href="?outcome=pay" style="display:block;background:#0BA4DB;color:#fff;padding:14px;text-align:center;border-radius:8px;text-decoration:none">Pay</a>
        <p><a href="?outcome=cancel">Cancel payment</a></p></body>`)
    }

    send(404, { status: false, message: "Not found" })
  })

  return new Promise((resolve) => {
    server.listen(port, () =>
      resolve({
        server,
        transactions,
        pay,
        setCardCharges: (o) => (cardCharges = o),
        close: () => new Promise((r) => server.close(() => r())),
      }),
    )
  })
}

if (process.argv[1]?.endsWith("paystack-mock.ts")) {
  const port = Number(process.env.PORT) || 4599
  await startMockPaystack(port)
  console.log(`Mock Paystack listening on http://localhost:${port}`)
}
