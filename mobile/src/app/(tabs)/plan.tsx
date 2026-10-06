import { router } from "expo-router"
import { useState } from "react"
import { Switch, Text, View } from "react-native"
import { Badge, Button, Card, ErrorBanner, Loading, Row, Screen, Section } from "../../components/ui"
import { api } from "../../lib/api"
import { confirmAction } from "../../lib/dialogs"
import { daysUntil, formatDate, naira, orderStatus, SUBSCRIPTION_STATUS } from "../../lib/format"
import type { Subscription } from "../../lib/types"
import { useFocusData } from "../../lib/useFocusData"
import { useSubmit } from "../../lib/useSubmit"
import { colors, font, spacing } from "../../theme"

/** The plan to show: the active one, else an unpaid sign-up, else the most recent expired one. */
function pickCurrent(subs: Subscription[]) {
  return (
    subs.find((s) => s.status === "ACTIVE") ??
    subs.find((s) => s.status === "PENDING_PAYMENT" && !s.replacesId) ??
    subs.find((s) => s.status === "EXPIRED") ??
    null
  )
}

export default function MyPlan() {
  const list = useFocusData(() => api.subscriptions())
  const current = list.data ? pickCurrent(list.data.subscriptions) : null
  const detail = useFocusData(
    () => (current ? api.subscription(current.id) : Promise.resolve(null)),
    current?.id ?? "none",
  )
  const toggle = useSubmit()
  const [sub, setSub] = useState<Subscription | null>(null)

  const refresh = () => {
    list.refresh()
    detail.refresh()
  }

  if (!list.data) return list.error ? <ErrorBanner message={list.error} onRetry={refresh} /> : <Loading />

  if (!current) {
    return (
      <Screen refreshing={list.refreshing} onRefresh={refresh}>
        <Card>
          <Text style={font.heading}>No plan yet</Text>
          <Text style={font.muted}>
            Get regular pickups on a weekly or premium plan, paid every 4 weeks or monthly. Your pickups are scheduled
            automatically.
          </Text>
          <Button title="Choose a plan" onPress={() => router.push("/book/plans")} />
        </Card>
      </Screen>
    )
  }

  const plan = sub?.id === current.id ? sub : current
  const status = SUBSCRIPTION_STATUS[plan.status]
  const daysLeft = plan.currentPeriodEnd ? daysUntil(plan.currentPeriodEnd) : null
  const canRenew =
    plan.status === "EXPIRED" ||
    (plan.status === "ACTIVE" && daysLeft !== null && daysLeft <= list.data.renewWindowDays && !plan.autoRenew)
  const pendingChange = list.data.subscriptions.find((s) => s.status === "PENDING_PAYMENT" && s.replacesId === plan.id)

  return (
    <Screen refreshing={list.refreshing || detail.refreshing} onRefresh={refresh}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={font.heading}>{plan.planName}</Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <Text style={font.muted}>
          {naira(plan.price)} {plan.periodLabel} ·{" "}
          {plan.pickupsPerWeek === 7 ? "daily pickups" : `${plan.pickupsPerWeek} pickup${plan.pickupsPerWeek > 1 ? "s" : ""} a week`}
        </Text>
        {plan.status === "ACTIVE" && plan.currentPeriodEnd ? (
          <Row
            label={plan.autoRenew ? "Renews on" : "Ends on"}
            value={`${formatDate(plan.currentPeriodEnd)}${daysLeft !== null && daysLeft <= 7 ? ` (${daysLeft} day${daysLeft === 1 ? "" : "s"})` : ""}`}
          />
        ) : null}
        {plan.status === "EXPIRED" && plan.currentPeriodEnd ? (
          <Row label="Ended on" value={formatDate(plan.currentPeriodEnd)} />
        ) : null}
        <Row label="Address" value={plan.address} />
      </Card>

      {plan.status === "PENDING_PAYMENT" ? (
        <Card>
          <Text style={font.muted}>Your plan starts once it's paid for.</Text>
          <Button
            title="Complete payment"
            onPress={() => router.push({ pathname: "/plan/checkout", params: { id: plan.id } })}
          />
        </Card>
      ) : null}

      {pendingChange ? (
        <Card style={{ borderColor: colors.warning, backgroundColor: colors.warningSoft }}>
          <Text style={font.label}>Plan change to {pendingChange.planName} isn't paid yet</Text>
          <Button
            title="Finish changing plan"
            variant="secondary"
            onPress={() => router.push({ pathname: "/plan/checkout", params: { id: pendingChange.id } })}
          />
        </Card>
      ) : null}

      {canRenew ? (
        <Button
          title={plan.status === "EXPIRED" ? `Restart plan · ${naira(plan.price)}` : `Renew now · ${naira(plan.price)}`}
          onPress={() => router.push({ pathname: "/plan/checkout", params: { id: plan.id } })}
        />
      ) : null}

      {plan.status === "ACTIVE" ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={font.label}>Automatic renewal</Text>
              <Text style={font.muted}>
                {plan.hasSavedCard
                  ? `${plan.cardLabel ?? "Your card"} is charged ${naira(plan.price)} a day before the plan ends.`
                  : "Pay by card once to turn this on."}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Automatic renewal"
              value={plan.autoRenew}
              disabled={!plan.hasSavedCard || toggle.busy}
              trackColor={{ true: colors.primary, false: colors.border }}
              onValueChange={(value) => {
                const apply = () => void toggle.submit(async () => setSub((await api.setAutoRenew(plan.id, value)).subscription))
                if (value) apply()
                else
                  confirmAction(
                    "Turn off automatic renewal?",
                    `Your plan will end on ${formatDate(plan.currentPeriodEnd!)} unless you renew it.`,
                    "Turn off",
                    apply,
                  )
              }}
            />
          </View>
          {toggle.error ? <ErrorBanner message={toggle.error} /> : null}
          <Button
            title="Change or upgrade plan"
            variant="secondary"
            onPress={() => router.push({ pathname: "/book/plans", params: { change: plan.id, current: plan.plan } })}
          />
        </Card>
      ) : null}

      {plan.status === "EXPIRED" ? (
        <Button title="Choose a different plan" variant="secondary" onPress={() => router.push("/book/plans")} />
      ) : null}

      {detail.data && detail.data.upcomingPickups.length > 0 ? (
        <Section title="Upcoming pickups">
          {detail.data.upcomingPickups.map((o) => (
            <Card key={o.id} style={{ paddingVertical: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={font.label}>{formatDate(o.scheduledDate)}</Text>
                <Badge label={orderStatus(o).label} tone={orderStatus(o).tone} />
              </View>
            </Card>
          ))}
        </Section>
      ) : null}
    </Screen>
  )
}
