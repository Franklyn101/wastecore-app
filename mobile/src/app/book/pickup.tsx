import { router } from "expo-router"
import { useState } from "react"
import { Text, View } from "react-native"
import { DatePicker } from "../../components/DatePicker"
import { Button, Chip, ErrorBanner, Loading, Screen, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { useCatalog } from "../../lib/catalog"
import { naira } from "../../lib/format"
import { useSubmit } from "../../lib/useSubmit"
import { font, spacing } from "../../theme"

// The bot's instant pickup flow: address -> waste type -> date -> pay.
export default function BookPickup() {
  const { user } = useAuth()
  const { catalog, error: catalogError, reload } = useCatalog()
  const [address, setAddress] = useState(user?.address ?? "")
  const [wasteType, setWasteType] = useState<string | null>(null)
  const [otherWaste, setOtherWaste] = useState("")
  const [date, setDate] = useState<string | null>(null)
  const { busy, error, submit } = useSubmit()

  if (!catalog) return catalogError ? <ErrorBanner message={catalogError} onRetry={reload} /> : <Loading />

  const waste = wasteType === "Other" ? otherWaste.trim() : wasteType
  const ready = address.trim() && waste && date

  function book() {
    if (!ready) return
    void submit(async () => {
      const { order } = await api.createOrder({
        type: "INSTANT_PICKUP",
        address: address.trim(),
        wasteType: waste!,
        pickupDate: date!,
      })
      router.replace(`/orders/${order.id}`)
    })
  }

  return (
    <Screen>
      <Text style={font.muted}>{catalog.instantPickup.description}</Text>

      <TextField
        label="Pickup address"
        placeholder="House number, street, area"
        value={address}
        onChangeText={setAddress}
        multiline
        autoComplete="street-address"
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

      <DatePicker label="Pickup date" value={date} onChange={setDate} />

      {error ? <ErrorBanner message={error} /> : null}
      <Button
        title={`Continue to payment · ${naira(catalog.instantPickup.price)}`}
        onPress={book}
        loading={busy}
        disabled={!ready}
      />
      <Text style={font.muted}>Need regular pickups? A plan works out cheaper.</Text>
    </Screen>
  )
}
