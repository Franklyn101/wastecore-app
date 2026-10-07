import { Text, View } from "react-native"
import { Card, ErrorBanner, Loading, Row, Screen, Section } from "../../components/ui"
import { api } from "../../lib/api"
import { formatDate, naira } from "../../lib/format"
import { useFocusData } from "../../lib/useFocusData"
import { colors, font, spacing } from "../../theme"

// What the collector has earned since they were last paid, and past payouts.
export default function CollectorEarnings() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.collector.earnings())

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />
  const { unpaid, rates } = data

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Text style={font.muted}>Due at your next payout</Text>
        <Text style={[font.title, { color: colors.primaryDark }]}>{naira(unpaid.due)}</Text>
        <Row label={`Earned (${unpaid.jobs} job${unpaid.jobs === 1 ? "" : "s"})`} value={naira(unpaid.earned)} />
        {unpaid.cashHeld ? <Row label="Cash you collected for extra bags" value={`− ${naira(unpaid.cashHeld)}`} /> : null}
      </Card>

      <Card>
        <Row label="Last 7 days" value={`${naira(data.lastSevenDays.earned)} · ${data.lastSevenDays.jobs} jobs`} />
      </Card>

      <Section title="How pay works">
        <Text style={font.muted}>
          {naira(rates.pickup)} per pickup plus {naira(rates.perBag)} per bag collected. {naira(rates.bagDelivery)} per bag
          delivery. Any cash customers give you for extra bags is taken off your next payout.
        </Text>
      </Section>

      <Section title="Payouts">
        {data.payouts.length === 0 ? <Text style={font.muted}>No payouts yet.</Text> : null}
        {data.payouts.map((p) => (
          <Card key={p.id} style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={font.label}>{formatDate(p.createdAt)}</Text>
              <Text style={font.label}>{naira(p.amount)}</Text>
            </View>
            <Text style={font.muted}>
              {p.jobs} job{p.jobs === 1 ? "" : "s"}
              {p.note ? ` · ${p.note}` : ""}
            </Text>
          </Card>
        ))}
      </Section>
    </Screen>
  )
}
