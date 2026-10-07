import { useState } from "react"
import { Text, View } from "react-native"
import { DisposalForm } from "../../components/DisposalForm"
import { Card, Chip, ErrorBanner, Loading, Row, Screen, Section } from "../../components/ui"
import { api } from "../../lib/api"
import { DISPOSAL_KIND_LABELS, upcomingDates } from "../../lib/format"
import { useFocusData } from "../../lib/useFocusData"
import { colors, font, spacing } from "../../theme"

const RANGES = [7, 30, 90, 365]

const kg = (n: number) => `${n.toLocaleString("en-NG")} kg`
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

// How much waste we collected, what kind, and where it went (dump site vs recycling).
export default function WasteReport() {
  const [days, setDays] = useState(30)
  const [to] = upcomingDates(1)
  const from = new Date(Date.parse(to) - (days - 1) * 86_400_000).toISOString().slice(0, 10)
  const report = useFocusData(() => api.admin.wasteReport({ from, to }), String(days))
  const disposals = useFocusData(() => api.admin.disposals())
  const data = report.data

  return (
    <Screen refreshing={report.refreshing} onRefresh={report.refresh}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {RANGES.map((d) => (
          <Chip key={d} label={d === 365 ? "Last year" : `Last ${d} days`} selected={days === d} onPress={() => setDays(d)} />
        ))}
      </View>
      {report.error ? <ErrorBanner message={report.error} onRetry={report.refresh} /> : !data ? <Loading /> : null}
      {data ? (
        <>
          <Section title="Collected">
            <Card>
              <Row label="Pickups done" value={String(data.collected.pickups)} />
              <Row label="Bags" value={String(data.collected.bags)} />
              <Row label={`Weighed (${count(data.collected.weighedPickups, "pickup")})`} value={kg(data.collected.kg)} />
            </Card>
            {data.collected.byWasteType.map((r) => (
              <Card key={r.name} style={{ paddingVertical: spacing.md }}>
                <Row label={r.name} value={`${count(r.pickups, "pickup")} · ${count(r.bags, "bag")}${r.kg ? ` · ${kg(r.kg)}` : ""}`} />
              </Card>
            ))}
            {data.collected.byArea.length > 1
              ? data.collected.byArea.map((r) => (
                  <Text key={r.name} style={font.muted}>
                    {r.name}: {count(r.pickups, "pickup")}
                  </Text>
                ))
              : null}
          </Section>

          <Section title="Where it went">
            <Card style={data.disposed.divertedPercent ? { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft } : undefined}>
              <Row label={`Dropped off (${count(data.disposed.loads, "load")})`} value={kg(data.disposed.kg)} />
              <Row
                label="Kept out of the dump site"
                value={data.disposed.divertedPercent === null ? "—" : `${data.disposed.divertedPercent}% recycled or composted`}
              />
            </Card>
            {data.disposed.bySite.map((s) => (
              <Card key={s.site} style={{ paddingVertical: spacing.md, gap: 2 }}>
                <Row label={s.site} value={kg(s.kg)} />
                <Text style={font.muted}>
                  {DISPOSAL_KIND_LABELS[s.kind]} · {count(s.loads, "load")}
                </Text>
              </Card>
            ))}
          </Section>
        </>
      ) : null}

      <DisposalForm
        recentSites={disposals.data?.recentSites ?? []}
        onSave={async (input) => {
          await api.admin.addDisposal(input)
          disposals.refresh()
          report.refresh()
        }}
      />
      <Text style={font.muted}>Collectors log their own drop-offs in the app. The CSV report under Reports lists them all.</Text>
    </Screen>
  )
}
