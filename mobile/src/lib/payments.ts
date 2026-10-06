import * as Linking from "expo-linking"
import { router } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import { Platform } from "react-native"
import { api } from "./api"
import type { Payment } from "./types"

/**
 * Takes the customer through Paystack checkout and reports how it ended.
 * On phones checkout opens in an in-app browser that closes when Paystack
 * redirects back to the app. On the web the page itself goes to Paystack and
 * comes back to /payment-return, which finishes the job (this never resolves).
 */
export async function payWithPaystack(target: { orderId?: string; subscriptionId?: string }, email?: string): Promise<Payment> {
  const returnUrl = Linking.createURL("payment-return")
  const { payment, authorizationUrl } = await api.startPayment({ ...target, email, returnUrl })

  if (Platform.OS === "web") {
    window.location.assign(authorizationUrl)
    return new Promise<never>(() => {})
  }

  await WebBrowser.openAuthSessionAsync(authorizationUrl, returnUrl)
  // Whether checkout finished or the customer closed it, ask the server for the outcome.
  return (await api.payment(payment.reference)).payment
}

/** Where to take the customer after a successful payment. */
export function goToPaid(payment: Payment) {
  if (payment.orderId) router.replace(`/orders/${payment.orderId}`)
  else router.replace("/plan")
}
