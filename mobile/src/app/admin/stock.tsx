import { useState } from "react"
import { Text, View } from "react-native"
import { Badge, Button, Card, Chip, ErrorBanner, Loading, Row, Screen, Section, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { formatDate } from "../../lib/format"
import type { StockSize } from "../../lib/types"
import { useFocusData } from "../../lib/useFocusData"
import { useSubmit } from "../../lib/useSubmit"
import { colors, font, spacing } from "../../theme"

const tracked = (s: StockSize): s is Extract<StockSize, { packs: number }> => "packs" in s

// Waste bag packs in the store. Bag orders are refused when a size runs out.
export default function Stock() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.admin.stock())
  const [size, setSize] = useState<string | null>(null)
  const [direction, setDirection] = useState<"in" | "out">("in")
  const [packs, setPacks] = useState("")
  const [reason, setReason] = useState("")
  const [lowAt, setLowAt] = useState("")
  const { busy, error: saveError, submit } = useSubmit()

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />
  const count = Number(packs.replace(/\D/g, ""))
  const selected = data.sizes.find((s) => s.size === size)

  function save() {
    void submit(async () => {
      await api.admin.changeStock(size!, {
        change: direction === "in" ? count : -count,
        reason: reason.trim(),
        ...(lowAt ? { lowAt: Number(lowAt) } : {}),
      })
      setPacks("")
      setReason("")
      setLowAt("")
      refresh()
    })
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {data.sizes.map((s) => (
        <Card key={s.size} style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={font.heading}>{s.name}</Text>
            {!tracked(s) ? (
              <Badge label="Not tracked" tone="muted" />
            ) : s.available <= 0 ? (
              <Badge label="Out of stock" tone="danger" />
            ) : s.available <= s.lowAt ? (
              <Badge label="Low" tone="warning" />
            ) : (
              <Badge label="In stock" tone="success" />
            )}
          </View>
          {tracked(s) ? (
            <>
              <Row label="In the store" value={`${s.packs} packs`} />
              <Row label="On order (not delivered)" value={`${s.onOrder} packs`} />
              <Row label="Available to order" value={`${s.available} packs`} />
              <Row label="Warn at" value={`${s.lowAt} packs`} />
            </>
          ) : (
            <Text style={font.muted}>Customers can order any amount. Add stock to start tracking it.</Text>
          )}
        </Card>
      ))}

      <Section title="Change stock">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {data.sizes.map((s) => (
            <Chip key={s.size} label={s.name} selected={size === s.size} onPress={() => setSize(s.size)} />
          ))}
        </View>
        {size ? (
          <Card>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Chip label="Add (restock)" selected={direction === "in"} onPress={() => setDirection("in")} />
              <Chip label="Remove (damaged, lost)" selected={direction === "out"} onPress={() => setDirection("out")} />
            </View>
            <TextField label="Packs" keyboardType="number-pad" value={packs} onChangeText={setPacks} />
            <TextField
              label="Reason"
              placeholder={direction === "in" ? "e.g. Delivery from supplier" : "e.g. Damaged in the rain"}
              value={reason}
              onChangeText={setReason}
              maxLength={200}
            />
            <TextField
              label="Warn when available falls to (optional)"
              keyboardType="number-pad"
              value={lowAt}
              onChangeText={setLowAt}
              hint={selected && tracked(selected) ? `Now ${selected.lowAt} packs.` : "Default 20 packs."}
            />
            {saveError ? <ErrorBanner message={saveError} /> : null}
            <Button title="Save" loading={busy} disabled={!count || reason.trim().length < 2} onPress={save} />
          </Card>
        ) : null}
      </Section>

      {data.movements.length ? (
        <Section title="Recent changes">
          {data.movements.map((m) => (
            <Card key={m.id} style={{ paddingVertical: spacing.md, gap: 2 }}>
              <Row
                label={`${data.sizes.find((s) => s.size === m.size)?.name ?? m.size} · ${formatDate(m.createdAt)}`}
                value={`${m.change > 0 ? "+" : ""}${m.change}`}
              />
              <Text style={[font.muted, m.change < 0 ? undefined : { color: colors.primaryDark }]}>{m.reason}</Text>
            </Card>
          ))}
        </Section>
      ) : null}
    </Screen>
  )
}
