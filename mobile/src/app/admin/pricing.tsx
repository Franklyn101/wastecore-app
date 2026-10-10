import { type ReactNode, useEffect, useState } from "react"
import { Text, View } from "react-native"
import { Button, Card, ErrorBanner, Loading, Row, Screen, Section, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useIsOwner } from "../../lib/auth"
import { confirmAction } from "../../lib/dialogs"
import { naira } from "../../lib/format"
import { pickupPrice } from "../../lib/pricing"
import type { Pricing, PricingView } from "../../lib/types"
import { useFocusData } from "../../lib/useFocusData"
import { useSubmit } from "../../lib/useSubmit"
import { colors, font, spacing } from "../../theme"

// What customers pay and what collectors earn. Everyone on staff can look; only the main admin can change it.
// New prices apply to new bookings and plan renewals; orders already booked keep their price.
export default function AdminPricing() {
  const { data, error, refresh, setData } = useFocusData(() => api.admin.pricing())
  const owner = useIsOwner()
  const save = useSubmit()
  const [draft, setDraft] = useState<Pricing | null>(null)
  // Bumped to redraw the fields after a reset.
  const [version, setVersion] = useState(0)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data && !draft) setDraft(structuredClone(data.pricing))
  }, [data, draft])

  if (!data || !draft) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  const changed = JSON.stringify(draft) !== JSON.stringify(data.pricing)
  const edit = (change: (p: Pricing) => void) => {
    const next = structuredClone(draft)
    change(next)
    setDraft(next)
    setSaved(false)
  }
  const field = (label: string, value: number, set: (p: Pricing, n: number) => void, hint?: string) => (
    <NumberField key={`${label}-${version}`} label={label} value={value} hint={hint} editable={owner} onChange={(n) => edit((p) => set(p, n))} />
  )

  function submit() {
    confirmAction("Save new prices?", "New bookings and plan renewals will use them. Orders already booked keep their price.", "Save", () =>
      void save.submit(async () => {
        const view: PricingView = await api.admin.savePricing(draft!)
        setData(view)
        setDraft(structuredClone(view.pricing))
        setVersion((v) => v + 1)
        setSaved(true)
      }),
    )
  }

  const tier = draft.tierBags
  return (
    <Screen>
      <Text style={font.muted}>
        {owner
          ? "Change any number, check the examples, then save. New bookings and plan renewals use the new prices."
          : "Only the main admin can change prices."}
      </Text>

      <Examples pricing={draft} />

      <Section title="Scheduled pickup (customer picks a date)">
        <Card>
          <Pair>
            {field(`Each of the first ${tier} bags`, draft.scheduled.firstBags, (p, n) => (p.scheduled.firstBags = n))}
            {field("Each bag after that", draft.scheduled.extraBag, (p, n) => (p.scheduled.extraBag = n))}
          </Pair>
          {field("Minimum per pickup", draft.scheduled.minimum, (p, n) => (p.scheduled.minimum = n))}
        </Card>
      </Section>

      <Section title="Instant pickup (as soon as possible)">
        <Card>
          <Pair>
            {field(`Each of the first ${tier} bags`, draft.instant.firstBags, (p, n) => (p.instant.firstBags = n))}
            {field("Each bag after that", draft.instant.extraBag, (p, n) => (p.instant.extraBag = n))}
          </Pair>
          {field("Minimum per pickup", draft.instant.minimum, (p, n) => (p.instant.minimum = n))}
        </Card>
      </Section>

      <Section title="Other charges">
        <Card>
          {field("Bags at the first-bags price", draft.tierBags, (p, n) => (p.tierBags = Math.max(1, n)), "How many bags count as the first bags.")}
          <Pair>
            {field("WasteCore bag (each)", draft.wastecoreBag, (p, n) => (p.wastecoreBag = n))}
            {field("Wasted-trip fee", draft.wastedTripFee, (p, n) => (p.wastedTripFee = n))}
          </Pair>
        </Card>
      </Section>

      <Section title="Collector pay">
        <Card>
          <Text style={font.label}>Scheduled pickups (and plan pickups)</Text>
          <Pair>
            {field("Per stop", draft.collector.scheduled.perStop, (p, n) => (p.collector.scheduled.perStop = n))}
            {field("Per bag", draft.collector.scheduled.perBag, (p, n) => (p.collector.scheduled.perBag = n))}
          </Pair>
          <Text style={font.label}>Instant pickups</Text>
          <Pair>
            {field("Per stop", draft.collector.instant.perStop, (p, n) => (p.collector.instant.perStop = n))}
            {field("Per bag", draft.collector.instant.perBag, (p, n) => (p.collector.instant.perBag = n))}
          </Pair>
          <Pair>
            {field("Per WasteCore bag handed out", draft.collector.perBagHandedOut, (p, n) => (p.collector.perBagHandedOut = n))}
            {field("Wasted trip", draft.collector.wastedTrip, (p, n) => (p.collector.wastedTrip = n))}
          </Pair>
          <Pair>
            {field("Bag delivery", draft.collector.bagDelivery, (p, n) => (p.collector.bagDelivery = n))}
            {field("Special pickup", draft.collector.specialPickup, (p, n) => (p.collector.specialPickup = n))}
          </Pair>
        </Card>
      </Section>

      <Section title="Plans">
        {data.plans.map((plan) => (
          <Card key={plan.id}>
            <Text style={font.label}>
              {plan.name} · {plan.periodLabel}
            </Text>
            <Pair>
              {field("Price", draft.plans[plan.id].price, (p, n) => (p.plans[plan.id].price = n))}
              {field("Bags per pickup", draft.plans[plan.id].bagsPerPickup, (p, n) => (p.plans[plan.id].bagsPerPickup = Math.max(1, n)))}
            </Pair>
            <PlanCheck pricing={draft} planId={plan.id} pickupsPerWeek={plan.pickupsPerWeek} weekly={plan.periodLabel.includes("4 weeks")} />
          </Card>
        ))}
      </Section>

      {save.error ? <ErrorBanner message={save.error} /> : null}
      {saved ? <Text style={[font.label, { color: colors.primaryDark }]}>Saved. New bookings use these prices.</Text> : null}
      {owner ? (
        <View style={{ gap: spacing.sm }}>
          <Button title="Save prices" onPress={submit} loading={save.busy} disabled={!changed} />
          <Button
            title="Undo changes"
            variant="secondary"
            disabled={!changed || save.busy}
            onPress={() => {
              setDraft(structuredClone(data.pricing))
              setVersion((v) => v + 1)
            }}
          />
          <Button
            title="Use the recommended prices"
            variant="secondary"
            disabled={save.busy}
            onPress={() => {
              setDraft(structuredClone(data.defaults))
              setVersion((v) => v + 1)
              setSaved(false)
            }}
          />
        </View>
      ) : null}
    </Screen>
  )
}

function Pair({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", gap: spacing.sm }}>{children}</View>
}

/** A naira (or count) field that only takes whole numbers. */
function NumberField({ label, value, hint, editable, onChange }: { label: string; value: number; hint?: string; editable: boolean; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  return (
    <View style={{ flex: 1 }}>
      <TextField
        label={label}
        hint={hint}
        value={text}
        editable={editable}
        keyboardType="number-pad"
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, "").slice(0, 8)
          setText(digits)
          onChange(digits ? Number(digits) : 0)
        }}
      />
    </View>
  )
}

/** What the customer pays, the collector earns and WasteCore keeps, for a few typical pickups. */
function Examples({ pricing }: { pricing: Pricing }) {
  const rows: [string, number, boolean][] = [
    ["Scheduled, 1 bag", 1, false],
    ["Scheduled, 3 bags", 3, false],
    ["Scheduled, 5 bags", 5, false],
    ["Instant, 1 bag", 1, true],
    ["Instant, 3 bags", 3, true],
    ["Instant, 10 bags", 10, true],
  ]
  return (
    <Card style={{ gap: spacing.xs }}>
      <Text style={font.heading}>Examples</Text>
      <Text style={font.muted}>Customer pays · collector earns · WasteCore keeps (before card fees)</Text>
      {rows.map(([label, bags, instant]) => {
        const pays = pickupPrice(bags, instant, pricing)
        const rates = instant ? pricing.collector.instant : pricing.collector.scheduled
        const earns = rates.perStop + rates.perBag * bags
        const keeps = pays - earns
        return (
          <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
            <Text style={[font.muted, { flex: 1 }]}>{label}</Text>
            <Text style={[font.body, { color: keeps < 0 ? colors.danger : colors.text }]}>
              {naira(pays)} · {naira(earns)} · {naira(keeps)}
            </Text>
          </View>
        )
      })}
    </Card>
  )
}

/** Warns when a full plan pickup would cost WasteCore money. */
function PlanCheck({ pricing, planId, pickupsPerWeek, weekly }: { pricing: Pricing; planId: string; pickupsPerWeek: number; weekly: boolean }) {
  const plan = pricing.plans[planId]
  const pickups = pickupsPerWeek * (weekly ? 4 : 52 / 12)
  const perPickup = Math.round(plan.price / pickups)
  const collector = pricing.collector.scheduled.perStop + pricing.collector.scheduled.perBag * plan.bagsPerPickup
  const keeps = perPickup - collector
  return (
    <Row
      label={`About ${naira(perPickup)} a pickup; full pickup pays the collector ${naira(collector)}`}
      value={keeps < 0 ? `Loses ${naira(-keeps)}` : `Keeps ${naira(keeps)}`}
    />
  )
}
