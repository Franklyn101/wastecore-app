import { router, useLocalSearchParams } from "expo-router"
import { Text } from "react-native"
import { PayButton } from "../../components/PayButton"
import { Button, Card, ErrorBanner, Loading, Row, Screen } from "../../components/ui"
import { api } from "../../lib/api"
import { useCatalog } from "../../lib/catalog"
import { formatDate, naira, upcomingDates } from "../../lib/format"
import { useFocusData } from "../../lib/useFocusData"
import { useSubmit } from "../../lib/useSubmit"
import { font } from "../../theme"

// Pay for a new plan, a plan change, or a renewal (?id=<subscription id>).
export default function PlanCheckout() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { catalog } = useCatalog()
  const { data, error, refresh } = useFocusData(() => api.subscription(id))
  const cancel = useSubmit()

  const sub = data?.subscription
  if (!sub) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  const isNew = sub.status === "PENDING_PAYMENT"
  const amount = isNew ? Math.max(0, sub.price - sub.credit) : sub.price
  const done = () => router.replace("/plan")

  if (!catalog?.onlinePayments) {
    return (
      <Screen>
        <ErrorBanner message="Online payment isn't available yet. Please contact support to set up your plan." />
      </Screen>
    )
  }

  return (
    <Screen>
      <Card>
        <Text style={font.heading}>{isNew ? (sub.replacesId ? "Change plan" : "Start your plan") : "Renew your plan"}</Text>
        <Row label="Plan" value={sub.planName} />
        <Row label="Price" value={`${naira(sub.price)} ${sub.periodLabel}`} />
        {sub.credit > 0 && isNew ? <Row label="Credit from current plan" value={`−${naira(sub.credit)}`} /> : null}
        <Row label="Pickups" value={`${sub.pickupsPerWeek === 7 ? "Daily" : `${sub.pickupsPerWeek}× a week`}`} />
        <Row label="Address" value={sub.address} />
        {isNew ? (
          <Row label="Starts" value={formatDate(sub.replacesId ? upcomingDates(1)[0] : sub.startDate)} />
        ) : sub.status === "EXPIRED" || !sub.currentPeriodEnd ? (
          <Row label="Starts" value={formatDate(upcomingDates(1)[0])} />
        ) : (
          <Row label="Continues from" value={formatDate(sub.currentPeriodEnd)} />
        )}
        <Row label="Due now" value={naira(amount)} />
      </Card>

      <PayButton
        amount={amount}
        target={{ subscriptionId: sub.id }}
        onPaid={done}
        note="Paying by card turns on automatic renewal. You can turn it off any time on your plan page."
      />

      {isNew ? (
        <>
          {cancel.error ? <ErrorBanner message={cancel.error} /> : null}
          <Button
            title="Not now"
            variant="secondary"
            loading={cancel.busy}
            onPress={() =>
              void cancel.submit(async () => {
                await api.cancelSubscription(sub.id)
                router.back()
              })
            }
          />
        </>
      ) : null}
    </Screen>
  )
}
