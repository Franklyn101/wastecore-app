import { router } from "expo-router"
import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import { Badge, Button, Card, ErrorBanner, Loading, Row, Screen, Section } from "../../../components/ui"
import { api } from "../../../lib/api"
import { naira } from "../../../lib/format"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { colors, font, radius, spacing } from "../../../theme"

// The day at a glance, and the way into customers, stock, refunds and reports.
export default function Overview() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.admin.dashboard())
  const assign = useSubmit()
  const [assigned, setAssigned] = useState<string | null>(null)

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />
  const anyAutoAssign = data.areas.some((a) => a.autoAssign)

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Section title="Today">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Tile label="Due (incl. overdue)" value={data.today.due} onPress={() => router.push("/admin")} />
          <Tile label="Done" value={data.today.done} />
          <Tile label="Not done" value={data.today.notDone} tone={data.today.notDone ? "danger" : undefined} />
          <Tile label="Need a collector" value={data.today.unassigned} tone={data.today.unassigned ? "warning" : undefined} />
          <Tile label="Receipts to check" value={data.today.waitingPayment} tone={data.today.waitingPayment ? "warning" : undefined} />
          <Tile label="Collectors on duty" value={data.collectorsOnDuty} />
        </View>
        {data.today.unassigned && anyAutoAssign ? (
          <>
            {assign.error ? <ErrorBanner message={assign.error} /> : null}
            {assigned ? <Text style={[font.label, { color: colors.primary }]}>{assigned}</Text> : null}
            <Button
              title="Auto-assign waiting orders"
              variant="secondary"
              loading={assign.busy}
              onPress={() =>
                void assign.submit(async () => {
                  const { assigned: n } = await api.admin.autoAssign()
                  setAssigned(n ? `Assigned ${n} order${n === 1 ? "" : "s"}.` : "No on-duty collectors free in those areas.")
                  refresh()
                })
              }
            />
          </>
        ) : null}
      </Section>

      <Section title="Areas today">
        {data.areas.map((a) => (
          <Card key={a.id} style={{ paddingVertical: spacing.md }}>
            <Row label={a.name} value={a.capacity ? `${a.today} of ${a.capacity} pickups` : `${a.today} pickups`} />
            {a.autoAssign ? <Badge label="Auto-assign on" tone="info" /> : null}
          </Card>
        ))}
      </Section>

      <Section title="Money in (after refunds)">
        <Card>
          <Row label="Today" value={naira(data.revenue.today)} />
          <Row label="Last 7 days" value={naira(data.revenue.last7Days)} />
          <Row label="Last 30 days" value={naira(data.revenue.last30Days)} />
        </Card>
      </Section>

      <Section title="Customers">
        <Card>
          <Row label="Active plans" value={String(data.activePlans)} />
          <Row label="New this week" value={String(data.newCustomers7Days)} />
          <Row label="Open tickets" value={String(data.openTickets)} />
          <Row
            label="Rating (30 days)"
            value={data.rating.average ? `${data.rating.average}★ from ${data.rating.count}` : "No ratings yet"}
          />
        </Card>
      </Section>

      {data.stock.length ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
          <Text style={font.label}>Bag stock running low</Text>
          {data.stock.map((s) => (
            <Text key={s.size} style={font.body}>
              {s.name}: {s.available} pack{s.available === 1 ? "" : "s"} available
            </Text>
          ))}
        </Card>
      ) : null}

      <Section title="Manage">
        <Button title="Customers" variant="secondary" onPress={() => router.push("/admin/customers")} />
        <Button title="Bag stock" variant="secondary" onPress={() => router.push("/admin/stock")} />
        <Button title="Refunds" variant="secondary" onPress={() => router.push("/admin/refunds")} />
        <Button title="Reports (CSV)" variant="secondary" onPress={() => router.push("/admin/exports")} />
        <Button title="Service areas" variant="secondary" onPress={() => router.push("/admin/areas")} />
      </Section>
    </Screen>
  )
}

function Tile({ label, value, tone, onPress }: { label: string; value: number; tone?: "warning" | "danger"; onPress?: () => void }) {
  const bg = tone === "danger" ? colors.dangerSoft : tone === "warning" ? colors.warningSoft : colors.primarySoft
  const fg = tone === "danger" ? colors.danger : tone === "warning" ? colors.warning : colors.primaryDark
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={{ backgroundColor: bg, borderRadius: radius.lg, padding: spacing.md, minWidth: "30%", flexGrow: 1, gap: 2 }}
    >
      <Text style={[font.title, { color: fg }]}>{value}</Text>
      <Text style={font.muted}>{label}</Text>
    </Pressable>
  )
}
