import { router } from "expo-router"
import { useEffect, useState } from "react"
import { Text, View } from "react-native"
import { AddressPicker } from "../../components/AddressPicker"
import { DatePicker } from "../../components/DatePicker"
import { Stepper } from "../../components/Stepper"
import { TimeWindowPicker } from "../../components/TimeWindowPicker"
import { Button, Card, Chip, ErrorBanner, Loading, OptionCard, Row, Screen, Section, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useCatalog } from "../../lib/catalog"
import { hourInLagos, hourLabel, naira } from "../../lib/format"
import { pickupPrice } from "../../lib/pricing"
import type { PickupPricing, SpeedPrices, TimeWindow } from "../../lib/types"
import { useSubmit } from "../../lib/useSubmit"
import { colors, font, spacing } from "../../theme"

// One-time pickup, no subscription: address -> waste -> when -> bags -> pay.
// "As soon as possible" is an instant pickup; a chosen date is a scheduled one, which costs less.
export default function BookPickup() {
  const { catalog, error: catalogError, reload } = useCatalog()
  const [addressId, setAddressId] = useState<string | null>(null)
  const [areaId, setAreaId] = useState<string | null>(null)
  const [fullDays, setFullDays] = useState<string[]>([])
  const [wasteType, setWasteType] = useState<string | null>(null)
  const [otherWaste, setOtherWaste] = useState("")
  const [bags, setBags] = useState(1)
  const [wastecoreBags, setWastecoreBags] = useState(0)
  const [when, setWhen] = useState<"asap" | "date">("asap")
  const [date, setDate] = useState<string | null>(null)
  const [timeWindow, setTimeWindow] = useState<TimeWindow | null>(null)
  const { busy, error, submit } = useSubmit()

  // Days the customer's area is fully booked.
  useEffect(() => {
    if (!areaId) return setFullDays([])
    api.fullDays(areaId).then((r) => setFullDays(r.fullDays)).catch(() => setFullDays([]))
  }, [areaId])

  if (!catalog) return catalogError ? <ErrorBanner message={catalogError} onRetry={reload} /> : <Loading />

  const instant = catalog.instantPickup
  const cutoff = hourLabel(instant.asapCutoffHour)
  const sameDay = hourInLagos() < instant.asapCutoffHour
  const waste = wasteType === "Other" ? otherWaste.trim() : wasteType
  const pricing = catalog.pickupPricing
  const isInstant = when === "asap"
  const speed = isInstant ? pricing.instant : pricing.scheduled
  const total = pickupPrice(bags, isInstant, pricing) + wastecoreBags * pricing.wastecoreBag
  const ready = addressId && waste && (when === "asap" || date)

  function book() {
    if (!ready) return
    void submit(async () => {
      const { order } = await api.createOrder({
        type: "INSTANT_PICKUP",
        addressId: addressId!,
        wasteType: waste!,
        bags,
        wastecoreBags,
        asap: isInstant,
        ...(when === "date" ? { pickupDate: date!, timeWindow } : {}),
      })
      router.replace(`/orders/${order.id}`)
    })
  }

  return (
    <Screen>
      <Text style={font.muted}>One-time pickup, no subscription needed. Pick a date to pay less.</Text>

      <AddressPicker
        label="Pickup address"
        value={addressId}
        onChange={(id, a) => {
          setAddressId(id)
          setAreaId(a?.areaId ?? null)
        }}
      />

      <View style={{ gap: spacing.sm }}>
        <Text style={font.label}>Waste type</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {[...catalog.wasteTypes, "Other"].map((t) => (
            <Chip key={t} label={t} selected={wasteType === t} onPress={() => setWasteType(t)} />
          ))}
        </View>
        {wasteType === "Other" ? (
          <TextField label="Describe your waste" value={otherWaste} onChangeText={setOtherWaste} maxLength={100} />
        ) : null}
      </View>

      <Section title="When?">
        <OptionCard
          title="As soon as possible"
          subtitle={`${sameDay ? `Today. Book before ${cutoff} for same-day pickup.` : `Tomorrow. It's past ${cutoff}, today's last pickup time.`} From ${naira(pricing.instant.firstBags)} a bag.`}
          selected={when === "asap"}
          onPress={() => setWhen("asap")}
        />
        <OptionCard
          title="Choose a date"
          subtitle={`Cheaper: we come with other pickups in your area. From ${naira(pricing.scheduled.firstBags)} a bag.`}
          selected={when === "date"}
          onPress={() => setWhen("date")}
        />
        {when === "date" ? (
          <>
            <DatePicker label="Pickup date" value={date} onChange={setDate} unavailable={fullDays} />
            <TimeWindowPicker value={timeWindow} onChange={setTimeWindow} />
          </>
        ) : null}
      </Section>

      <Stepper label="Number of bags" hint={perBag(speed, pricing)} value={bags} onChange={setBags} max={instant.maxBags} unit="bags" />
      <Stepper
        label="WasteCore bags (optional)"
        hint={`${naira(pricing.wastecoreBag)} each. Your collector brings them.`}
        value={wastecoreBags}
        onChange={setWastecoreBags}
        min={0}
        max={instant.maxWastecoreBags}
        unit="WasteCore bags"
      />

      <PriceBreakdown bags={bags} wastecoreBags={wastecoreBags} speed={speed} pricing={pricing} total={total} />

      {error ? <ErrorBanner message={error} /> : null}
      <Button title={`Continue to payment · ${naira(total)}`} onPress={book} loading={busy} disabled={!ready} />
      <Text style={font.muted}>Need regular pickups? A plan works out cheaper.</Text>
    </Screen>
  )
}

/** e.g. "₦650 a bag for the first 3, then ₦500. At least ₦1,000." */
function perBag(speed: SpeedPrices, pricing: PickupPricing) {
  return `${naira(speed.firstBags)} a bag for the first ${pricing.tierBags}, then ${naira(speed.extraBag)}. At least ${naira(speed.minimum)}.`
}

function PriceBreakdown({
  bags,
  wastecoreBags,
  speed,
  pricing,
  total,
}: {
  bags: number
  wastecoreBags: number
  speed: SpeedPrices
  pricing: PickupPricing
  total: number
}) {
  const first = Math.min(bags, pricing.tierBags)
  const more = Math.max(bags - pricing.tierBags, 0)
  const tiered = first * speed.firstBags + more * speed.extraBag
  return (
    <Card style={{ gap: spacing.xs }}>
      <Row label={`${first} bag${first === 1 ? "" : "s"} × ${naira(speed.firstBags)}`} value={naira(first * speed.firstBags)} />
      {more ? <Row label={`${more} more × ${naira(speed.extraBag)}`} value={naira(more * speed.extraBag)} /> : null}
      {tiered < speed.minimum ? <Row label="Minimum charge" value={`+ ${naira(speed.minimum - tiered)}`} /> : null}
      {wastecoreBags ? (
        <Row label={`${wastecoreBags} WasteCore bag${wastecoreBags === 1 ? "" : "s"} × ${naira(pricing.wastecoreBag)}`} value={naira(wastecoreBags * pricing.wastecoreBag)} />
      ) : null}
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <Row label="Total" value={naira(total)} />
    </Card>
  )
}
