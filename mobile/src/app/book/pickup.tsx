import { router } from "expo-router"
import { useEffect, useState } from "react"
import { Text, View } from "react-native"
import { AddressPicker } from "../../components/AddressPicker"
import { DatePicker } from "../../components/DatePicker"
import { Stepper } from "../../components/Stepper"
import { TimeWindowPicker } from "../../components/TimeWindowPicker"
import { Button, Chip, ErrorBanner, Loading, OptionCard, Screen, Section, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useCatalog } from "../../lib/catalog"
import { hourInLagos, hourLabel, naira } from "../../lib/format"
import type { TimeWindow } from "../../lib/types"
import { useSubmit } from "../../lib/useSubmit"
import { font, spacing } from "../../theme"

// One-time pickup, no subscription: address -> waste -> bags -> when -> pay.
export default function BookPickup() {
  const { catalog, error: catalogError, reload } = useCatalog()
  const [addressId, setAddressId] = useState<string | null>(null)
  const [areaId, setAreaId] = useState<string | null>(null)
  const [fullDays, setFullDays] = useState<string[]>([])
  const [wasteType, setWasteType] = useState<string | null>(null)
  const [otherWaste, setOtherWaste] = useState("")
  const [bags, setBags] = useState(1)
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
  const total = instant.pricePerBag * bags
  const ready = addressId && waste && (when === "asap" || date)

  function book() {
    if (!ready) return
    void submit(async () => {
      const { order } = await api.createOrder({
        type: "INSTANT_PICKUP",
        addressId: addressId!,
        wasteType: waste!,
        bags,
        asap: when === "asap",
        ...(when === "date" ? { pickupDate: date!, timeWindow } : {}),
      })
      router.replace(`/orders/${order.id}`)
    })
  }

  return (
    <Screen>
      <Text style={font.muted}>One-time pickup, no subscription needed. {naira(instant.pricePerBag)} per bag.</Text>

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

      <Stepper
        label="Number of bags"
        hint={`${naira(instant.pricePerBag)} each`}
        value={bags}
        onChange={setBags}
        max={instant.maxBags}
        unit="bags"
      />

      <Section title="When?">
        <OptionCard
          title="As soon as possible"
          subtitle={sameDay ? `Today. Book before ${cutoff} for same-day pickup.` : `Tomorrow. It's past ${cutoff}, today's last pickup time.`}
          selected={when === "asap"}
          onPress={() => setWhen("asap")}
        />
        <OptionCard title="Choose a date" selected={when === "date"} onPress={() => setWhen("date")} />
        {when === "date" ? (
          <>
            <DatePicker label="Pickup date" value={date} onChange={setDate} unavailable={fullDays} />
            <TimeWindowPicker value={timeWindow} onChange={setTimeWindow} />
          </>
        ) : null}
      </Section>

      {error ? <ErrorBanner message={error} /> : null}
      <Button title={`Continue to payment · ${naira(total)}`} onPress={book} loading={busy} disabled={!ready} />
      <Text style={font.muted}>Need regular pickups? A plan works out cheaper.</Text>
    </Screen>
  )
}
