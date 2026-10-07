import { useState } from "react"
import { Switch, Text, View } from "react-native"
import { MapView } from "../../components/MapView"
import { Badge, Button, Card, ErrorBanner, Loading, Row, Screen } from "../../components/ui"
import { api } from "../../lib/api"
import { confirmAction } from "../../lib/dialogs"
import type { AdminArea } from "../../lib/types"
import { useFocusData } from "../../lib/useFocusData"
import { useSubmit } from "../../lib/useSubmit"
import { colors, font, spacing } from "../../theme"

// Where we take bookings. Launch order: Yenagoa (Bayelsa), then Port Harcourt, then Lagos.
export default function AdminAreas() {
  const { data, error, refreshing, refresh, setData } = useFocusData(() => api.admin.areas().then((r) => r.areas))
  const [selected, setSelected] = useState<string | null>(null)
  const action = useSubmit()

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  const focus = data.find((a) => a.id === selected) ?? data.find((a) => a.active) ?? data[0]

  function save(area: AdminArea, body: { active?: boolean; radiusKm?: number }) {
    void action.submit(async () => {
      const { area: updated } = await api.admin.updateArea(area.id, body)
      setData((list) => list?.map((a) => (a.id === area.id ? { ...a, ...updated } : a)) ?? null)
    })
  }

  function toggle(area: AdminArea, active: boolean) {
    const message = active
      ? `Customers in ${area.name} can start booking right away.${area.waitingCustomers ? ` We'll notify the ${area.waitingCustomers} waiting.` : ""}`
      : `New bookings in ${area.name} will be refused. Orders already booked are not affected.`
    confirmAction(active ? `Launch ${area.name}?` : `Pause ${area.name}?`, message, active ? "Launch" : "Pause", () => save(area, { active }), {
      destructive: !active,
    })
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text style={font.muted}>
        Bookings are only accepted inside a live area. Customers outside one can tap "Notify me"; they're counted below.
      </Text>
      {focus ? <MapView center={{ lat: focus.centerLat, lng: focus.centerLng }} zoom={10} areas={data} height={240} /> : null}
      {action.error ? <ErrorBanner message={action.error} /> : null}
      {data.map((area) => (
        <Card key={area.id} style={area.id === focus?.id ? { borderColor: colors.primary } : undefined}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={font.heading} onPress={() => setSelected(area.id)}>
                {area.name}
              </Text>
              <Text style={font.muted}>{area.state} State</Text>
            </View>
            <Badge label={area.active ? "Live" : "Coming soon"} tone={area.active ? "success" : "warning"} />
            <Switch
              accessibilityLabel={`${area.name} taking bookings`}
              value={area.active}
              onValueChange={(v) => toggle(area, v)}
              trackColor={{ true: colors.primary }}
              disabled={action.busy}
            />
          </View>
          <Row label="Saved addresses" value={String(area.savedAddresses)} />
          <Row label="Open orders" value={String(area.openOrders)} />
          <Row label="Waiting for launch" value={String(area.waitingCustomers)} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={[font.label, { flex: 1 }]}>Reach: {area.radiusKm} km from the centre</Text>
            <Button
              title="−"
              variant="secondary"
              disabled={action.busy || area.radiusKm <= 1}
              onPress={() => save(area, { radiusKm: Math.max(1, area.radiusKm - 5) })}
            />
            <Button
              title="+"
              variant="secondary"
              disabled={action.busy || area.radiusKm >= 100}
              onPress={() => save(area, { radiusKm: Math.min(100, area.radiusKm + 5) })}
            />
          </View>
          <Text style={[font.muted, { color: colors.primary }]} onPress={() => setSelected(area.id)}>
            Show on map
          </Text>
        </Card>
      ))}
    </Screen>
  )
}
