import { useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { Linking, Text, View } from "react-native"
import { Badge, Button, Card, ErrorBanner, Loading, OptionCard, Row, Screen, Section } from "../../../components/ui"
import { api } from "../../../lib/api"
import { assignable, formatDate, naira, SUBSCRIPTION_STATUS } from "../../../lib/format"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { font, spacing } from "../../../theme"

export default function AdminPlan() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, error, refresh, setData } = useFocusData(async () => {
    const [{ subscriptions }, { collectors }] = await Promise.all([api.admin.subscriptions(), api.admin.collectors()])
    const sub = subscriptions.find((s) => s.id === id)
    if (!sub) throw new Error("Plan not found.")
    return { sub, collectors: collectors.filter(assignable) }
  })
  const [collectorId, setCollectorId] = useState<string | null>(null)
  const save = useSubmit()

  useEffect(() => {
    if (data) setCollectorId(data.sub.collector?.id ?? null)
  }, [data])

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />
  const { sub, collectors } = data
  const status = SUBSCRIPTION_STATUS[sub.status]

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={font.heading}>{sub.planName}</Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <Row label="Customer" value={sub.customer.name} />
        <Row label="Phone" value={sub.customer.phone} />
        <Row label="Address" value={sub.address} />
        <Row label="Waste" value={sub.wasteType} />
        <Row label="Price" value={`${naira(sub.price)} ${sub.periodLabel}`} />
        {sub.currentPeriodStart && sub.currentPeriodEnd ? (
          <Row label="Current period" value={`${formatDate(sub.currentPeriodStart)} – ${formatDate(sub.currentPeriodEnd)}`} />
        ) : null}
        <Row label="Auto-renew" value={sub.autoRenew ? `On (${sub.cardLabel ?? "card"})` : "Off"} />
        <Button
          title="Call customer"
          variant="secondary"
          onPress={() => void Linking.openURL(`tel:${sub.customer.phone}`)}
        />
      </Card>

      <Section title="Regular collector">
        <Text style={font.muted}>
          Saving assigns this collector to all of the plan's upcoming unassigned pickups, and to every pickup in future
          periods.
        </Text>
        <View style={{ gap: spacing.sm }}>
          {collectors.map((c) => (
            <OptionCard
              key={c.id}
              title={c.name}
              subtitle={`${c.area} · ${c.phone}`}
              selected={collectorId === c.id}
              onPress={() => setCollectorId(c.id)}
            />
          ))}
        </View>
        {collectors.length === 0 ? <Text style={font.muted}>Add a collector in the Collectors tab first.</Text> : null}
        {save.error ? <ErrorBanner message={save.error} /> : null}
        <Button
          title="Save collector"
          loading={save.busy}
          disabled={!collectorId || collectorId === sub.collector?.id}
          onPress={() =>
            void save.submit(async () => {
              const { subscription } = await api.admin.setPlanCollector(sub.id, collectorId)
              setData({ sub: subscription, collectors })
            })
          }
        />
      </Section>
    </Screen>
  )
}
