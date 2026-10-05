import { router, Stack, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Text, View } from "react-native"
import { DatePicker } from "../../components/DatePicker"
import { Button, Chip, ErrorBanner, Loading, OptionCard, Screen, Section, TextField } from "../../components/ui"
import { api, type NewOrder } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { useCatalog } from "../../lib/catalog"
import { naira } from "../../lib/format"
import { useSubmit } from "../../lib/useSubmit"
import { font, spacing } from "../../theme"

// Instant and weekly pickups share the bot's flow: (plan) -> address -> waste type -> date -> pay.
export default function BookPickup() {
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const weekly = mode === "weekly"
  const { user } = useAuth()
  const { catalog, error: catalogError, reload } = useCatalog()
  const [plan, setPlan] = useState<string | null>(null)
  const [address, setAddress] = useState(user?.address ?? "")
  const [wasteType, setWasteType] = useState<string | null>(null)
  const [otherWaste, setOtherWaste] = useState("")
  const [date, setDate] = useState<string | null>(null)
  const { busy, error, submit } = useSubmit()

  if (!catalog) return catalogError ? <ErrorBanner message={catalogError} onRetry={reload} /> : <Loading />

  const waste = wasteType === "Other" ? otherWaste.trim() : wasteType
  const price = weekly ? catalog.weeklyPlans.find((p) => p.id === plan)?.price : catalog.instantPickup.price
  const ready = (!weekly || plan) && address.trim() && waste && date

  function book() {
    if (!ready) return
    const base = { address: address.trim(), wasteType: waste!, pickupDate: date! }
    const body: NewOrder = weekly
      ? { type: "WEEKLY_PICKUP", plan: plan!, ...base }
      : { type: "INSTANT_PICKUP", ...base }
    void submit(async () => {
      const { order } = await api.createOrder(body)
      router.replace(`/orders/${order.id}`)
    })
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: weekly ? "Weekly pickup" : "Instant pickup" }} />

      {weekly ? (
        <Section title="Choose your plan">
          {catalog.weeklyPlans.map((p) => (
            <OptionCard
              key={p.id}
              title={p.name}
              trailing={`${naira(p.price)}/wk`}
              selected={plan === p.id}
              onPress={() => setPlan(p.id)}
            />
          ))}
        </Section>
      ) : (
        <Text style={font.muted}>{catalog.instantPickup.description}</Text>
      )}

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

      <DatePicker label={weekly ? "First pickup date" : "Pickup date"} value={date} onChange={setDate} />

      {error ? <ErrorBanner message={error} /> : null}
      <Button
        title={price ? `Continue to payment · ${naira(price)}` : "Continue to payment"}
        onPress={book}
        loading={busy}
        disabled={!ready}
      />
    </Screen>
  )
}
