import { useState } from "react"
import { Text, View } from "react-native"
import { api } from "../lib/api"
import { useAuth } from "../lib/auth"
import { naira } from "../lib/format"
import { payWithPaystack } from "../lib/payments"
import type { Payment } from "../lib/types"
import { useSubmit } from "../lib/useSubmit"
import { font, spacing } from "../theme"
import { Button, ErrorBanner, TextField } from "./ui"

/** Pays for an order or a plan through Paystack (card, bank transfer or USSD). */
export function PayButton({
  amount,
  target,
  onPaid,
  note,
}: {
  amount: number
  target: { orderId?: string; subscriptionId?: string }
  onPaid: (payment: Payment) => void
  note?: string
}) {
  const { user, setUser } = useAuth()
  const [email, setEmail] = useState(user?.email ?? "")
  const [notice, setNotice] = useState<string | null>(null)
  const { busy, error, submit } = useSubmit()
  const needsEmail = !user?.email
  const emailLooksValid = /^\S+@\S+\.\S+$/.test(email.trim())

  function pay() {
    setNotice(null)
    void submit(async () => {
      const payment = await payWithPaystack(target, needsEmail ? email.trim() : undefined)
      if (needsEmail) setUser((await api.me()).user)
      if (payment.status === "SUCCESS") onPaid(payment)
      else if (payment.status === "FAILED") setNotice("The payment didn't go through. Please try again or use another method.")
      else setNotice("Payment not completed. If you were charged, it will show here within a few minutes.")
    })
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {needsEmail ? (
        <TextField
          label="Email for your receipt"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          hint="Paystack sends your payment receipt here. We'll remember it."
        />
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {notice ? <ErrorBanner message={notice} /> : null}
      <Button
        title={`Pay ${naira(amount)} with Paystack`}
        onPress={pay}
        loading={busy}
        disabled={needsEmail && !emailLooksValid}
      />
      <Text style={[font.muted, { textAlign: "center" }]}>{note ?? "Card, bank transfer or USSD · secured by Paystack"}</Text>
    </View>
  )
}
