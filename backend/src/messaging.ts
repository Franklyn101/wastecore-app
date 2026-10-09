import nodemailer, { type Transporter } from "nodemailer"
import { config } from "./config.ts"

// Sends one-off texts (Termii SMS) and emails (any SMTP provider).
// Sending happens in the background so callers never wait on, or reveal, delivery.

const pending = new Set<Promise<unknown>>()

/** Waits for messages still being sent. Used by tests. */
export async function flushMessages() {
  await Promise.all([...pending])
}

function background(task: Promise<unknown>) {
  const p = task.catch((err) => console.error("Message sending failed:", err)).finally(() => pending.delete(p))
  pending.add(p)
}

export const smsEnabled = () => Boolean(config.termii.apiKey && config.termii.senderId)
export const emailEnabled = () => Boolean(config.smtp.host && config.smtp.from)

/** Texts a Nigerian number via Termii: https://developers.termii.com/messaging-api */
async function termiiSend(phone: string, text: string) {
  const res = await fetch(`${config.termii.baseUrl}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: config.termii.apiKey,
      to: phone.replace(/^\+/, ""),
      from: config.termii.senderId,
      sms: text,
      type: "plain",
      // "dnd" reaches numbers on Do-Not-Disturb, which is most Nigerian lines; it needs an approved sender ID.
      channel: config.termii.channel,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Termii responded ${res.status}: ${await res.text().catch(() => "")}`)
}

let transport: Transporter | null = null
function mailer() {
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  })
  return transport
}

export function sendSms(phone: string, text: string) {
  if (!smsEnabled()) {
    if (config.isProduction) console.error("SMS is not set up (TERMII_API_KEY, TERMII_SENDER_ID). Message not sent.")
    else console.log(`[dev] SMS to ${phone}: ${text}`)
    return
  }
  background(termiiSend(phone, text))
}

export function sendEmail(to: string, subject: string, text: string) {
  if (!emailEnabled()) {
    if (!config.isProduction) console.log(`[dev] Email to ${to}: ${subject} / ${text}`)
    return
  }
  background(mailer().sendMail({ from: config.smtp.from, to, subject, text, html: brandedHtml(text) }))
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** The plain-text email, laid out under the WasteCore logo. Email apps that don't show HTML use the text. */
function brandedHtml(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("")
  return `<!doctype html><html><body style="margin:0;background:#F6F8F7;font-family:Arial,Helvetica,sans-serif;color:#14211A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:12px">
<tr><td align="center" style="padding:28px 24px 8px"><img src="${config.publicUrl}/brand/wastecore-logo.png" width="160" alt="WasteCore" style="display:block;border:0"></td></tr>
<tr><td style="padding:16px 28px 12px;font-size:15px;line-height:1.5">${paragraphs}</td></tr>
</table>
<p style="font-size:12px;color:#5E6B64;margin:16px 0 0">WasteCore · Yenagoa, Bayelsa</p>
</td></tr></table></body></html>`
}
