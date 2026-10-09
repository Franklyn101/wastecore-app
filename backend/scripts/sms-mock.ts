// A stand-in for Termii's SMS API, for trying the app locally without sending real texts.
// The API "texts" codes here; open http://localhost:4597 to read them.
//
// Run it with `npm run sms:mock`, then start the API with TERMII_BASE_URL=http://localhost:4597
// and any TERMII_API_KEY / TERMII_SENDER_ID.
import { createServer } from "node:http"

type Text = { to: string; from: string; sms: string; at: Date }
const texts: Text[] = []

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const port = Number(process.env.PORT) || 4597
createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/sms/send") {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    texts.unshift({ to: `+${body.to}`, from: body.from, sms: body.sms, at: new Date() })
    texts.length = Math.min(texts.length, 200)
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ message_id: String(Date.now()), message: "Successfully Sent", balance: 999 }))
    return
  }

  const rows = texts
    .map((t) => {
      const code = t.sms.match(/\b\d{6}\b/)?.[0]
      return `<li><div class="meta">To <b>${escape(t.to)}</b> · ${t.at.toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos" })}</div>
        ${code ? `<div class="code">${code}</div>` : ""}<div>${escape(t.sms)}</div></li>`
    })
    .join("")
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
  res.end(`<!doctype html><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="5">
    <title>WasteCore test texts</title>
    <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#14211a}
    li{list-style:none;border:1px solid #dce3df;border-radius:12px;padding:12px 16px;margin:10px 0}
    .meta{color:#5e6b64;font-size:14px}.code{font-size:28px;font-weight:800;letter-spacing:4px;color:#2e820b}</style>
    <h1>Test text messages</h1><p>SMS the API would have sent. Refreshes every 5 seconds.</p>
    <ul style="padding:0">${rows || "<p>No texts yet.</p>"}</ul>`)
}).listen(port, () => console.log(`SMS inbox on http://localhost:${port}`))
