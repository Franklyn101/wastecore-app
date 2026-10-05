import { router } from "expo-router"
import { useState } from "react"
import { Text } from "react-native"
import { DatePicker } from "../../components/DatePicker"
import { Button, ErrorBanner, Loading, OptionCard, Screen, Section, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { useCatalog } from "../../lib/catalog"
import { naira } from "../../lib/format"
import { useSubmit } from "../../lib/useSubmit"
import { font } from "../../theme"

export default function BookUpgrade() {
  const { user } = useAuth()
  const { catalog, error: catalogError, reload } = useCatalog()
  const [plan, setPlan] = useState<string | null>(null)
  const [address, setAddress] = useState(user?.address ?? "")
  const [date, setDate] = useState<string | null>(null)
  const { busy, error, submit } = useSubmit()

  if (!catalog) return catalogError ? <ErrorBanner message={catalogError} onRetry={reload} /> : <Loading />

  const price = catalog.upgradePlans.find((p) => p.id === plan)?.price
  const ready = plan && address.trim() && date

  function book() {
    if (!ready) return
    void submit(async () => {
      const { order } = await api.createOrder({ type: "UPGRADE", plan: plan!, address: address.trim(), startDate: date! })
      router.replace(`/orders/${order.id}`)
    })
  }

  return (
    <Screen>
      <Section title="Choose a plan">
        {catalog.upgradePlans.map((p) => (
          <OptionCard
            key={p.id}
            title={p.name}
            trailing={`${naira(p.price)}/mo`}
            selected={plan === p.id}
            onPress={() => setPlan(p.id)}
          >
            {p.features.map((f) => (
              <Text key={f} style={font.muted}>
                • {f}
              </Text>
            ))}
          </OptionCard>
        ))}
      </Section>

      <TextField label="Pickup address for this plan" value={address} onChangeText={setAddress} multiline />
      <DatePicker label="Start date" value={date} onChange={setDate} />

      {error ? <ErrorBanner message={error} /> : null}
      <Button
        title={price ? `Continue to payment · ${naira(price)}` : "Continue to payment"}
        onPress={book}
        loading={busy}
        disabled={!ready}
      />
      <Text style={font.muted}>Our team activates your plan within 24 hours of confirming payment.</Text>
    </Screen>
  )
}
