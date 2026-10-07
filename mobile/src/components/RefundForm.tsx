import { useState } from "react"
import { Switch, Text, View } from "react-native"
import { api } from "../lib/api"
import { confirmAction } from "../lib/dialogs"
import { formatDate, naira } from "../lib/format"
import type { AdminOrder, Refund } from "../lib/types"
import { useSubmit } from "../lib/useSubmit"
import { colors, font, spacing } from "../theme"
import { Button, Card, ErrorBanner, Row, Section, TextField } from "./ui"

/** Past refunds on an order, and a form to give money back. */
export function RefundSection({ order, refunds, onRefunded }: { order: AdminOrder; refunds: Refund[]; onRefunded: () => void }) {
  const paid = (order.paidAt && order.type !== "PLAN_PICKUP" ? order.amount : 0) + (order.extraPaidAt ? order.extraAmount : 0)
  const refunded = refunds.filter((r) => r.status !== "FAILED").reduce((sum, r) => sum + r.amount, 0)
  const left = paid - refunded
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(left))
  const [reason, setReason] = useState("")
  const [cancel, setCancel] = useState(false)
  const { busy, error, submit } = useSubmit()

  if (paid === 0 && refunds.length === 0) return null
  const value = Number(amount.replace(/[^\d]/g, ""))
  const canCancel = order.status === "PENDING" || order.status === "ASSIGNED"
  const viaPaystack = order.paymentMethod === "PAYSTACK"

  function send() {
    confirmAction(
      `Refund ${naira(value)}?`,
      viaPaystack
        ? "Paystack sends it back to the customer's card or account. This can't be undone."
        : "Send the money to the customer yourself first (e.g. by bank transfer); this records it.",
      "Refund",
      () =>
        void submit(async () => {
          await api.admin.refund(order.id, { amount: value, reason: reason.trim(), cancel: cancel && canCancel })
          setOpen(false)
          setReason("")
          onRefunded()
        }),
    )
  }

  return (
    <Section title="Refunds">
      {refunds.map((r, i) => (
        <Card key={r.id ?? i} style={{ gap: spacing.xs }}>
          <Row label={formatDate(r.createdAt)} value={`${naira(r.amount)} · ${r.method === "PAYSTACK" ? "Paystack" : "Manual"} · ${r.status.toLowerCase()}`} />
          <Text style={font.muted}>{r.reason}</Text>
        </Card>
      ))}
      {left > 0 && !open ? <Button title={`Refund (up to ${naira(left)})`} variant="secondary" onPress={() => setOpen(true)} /> : null}
      {open ? (
        <Card style={{ borderColor: colors.danger }}>
          <TextField label="Amount (₦)" keyboardType="number-pad" value={amount} onChangeText={setAmount} hint={`Up to ${naira(left)}.`} />
          <TextField label="Reason" value={reason} onChangeText={setReason} maxLength={300} placeholder="e.g. Pickup missed" />
          {canCancel ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={[font.body, { flex: 1 }]}>Also cancel the order</Text>
              <Switch accessibilityLabel="Also cancel the order" value={cancel} onValueChange={setCancel} trackColor={{ true: colors.danger }} />
            </View>
          ) : null}
          {error ? <ErrorBanner message={error} /> : null}
          <Button
            title={`Refund ${value ? naira(value) : ""}`}
            variant="danger"
            loading={busy}
            disabled={!value || value > left || reason.trim().length < 3}
            onPress={send}
          />
          <Button title="Never mind" variant="secondary" onPress={() => setOpen(false)} />
        </Card>
      ) : null}
    </Section>
  )
}
