import { router, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { Text } from "react-native"
import { Button, Card, ErrorBanner, Loading, Screen } from "../components/ui"
import { api } from "../lib/api"
import { naira } from "../lib/format"
import { goToPaid } from "../lib/payments"
import type { Payment } from "../lib/types"
import { font } from "../theme"

// Paystack sends the customer back here (on the web, or via a deep link if the
// app was closed during checkout). It confirms the payment with the server.
export default function PaymentReturn() {
  const { reference } = useLocalSearchParams<{ reference?: string }>()
  const [payment, setPayment] = useState<Payment | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!reference) {
      setError("Missing payment reference.")
      return
    }
    api
      .payment(reference)
      .then(({ payment }) => {
        setPayment(payment)
        if (payment.status === "SUCCESS") goToPaid(payment)
      })
      .catch((e: Error) => setError(e.message))
  }, [reference])

  if (error) {
    return (
      <Screen>
        <ErrorBanner message={error} />
        <Button title="Go home" onPress={() => router.replace("/")} />
      </Screen>
    )
  }
  if (!payment || payment.status === "SUCCESS") return <Loading />

  return (
    <Screen>
      <Card>
        <Text style={font.heading}>{payment.status === "FAILED" ? "Payment failed" : "Payment not completed"}</Text>
        <Text style={font.muted}>
          {naira(payment.amount)} wasn't charged. You can try again from your{" "}
          {payment.orderId ? "order" : "plan"}.
        </Text>
      </Card>
      <Button
        title={payment.orderId ? "Back to order" : "Back to my plan"}
        onPress={() => (payment.orderId ? router.replace(`/orders/${payment.orderId}`) : router.replace("/plan"))}
      />
    </Screen>
  )
}
