import { router } from "expo-router"
import { useState } from "react"
import { Text } from "react-native"
import { Stepper } from "../../components/Stepper"
import { Button, ErrorBanner, Loading, OptionCard, Screen, Section, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { useCatalog } from "../../lib/catalog"
import { naira } from "../../lib/format"
import { useSubmit } from "../../lib/useSubmit"
import { font } from "../../theme"

export default function OrderBags() {
  const { user } = useAuth()
  const { catalog, error: catalogError, reload } = useCatalog()
  const [size, setSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [address, setAddress] = useState(user?.address ?? "")
  const { busy, error, submit } = useSubmit()

  if (!catalog) return catalogError ? <ErrorBanner message={catalogError} onRetry={reload} /> : <Loading />

  const bag = catalog.bagSizes.find((b) => b.id === size)
  const total = bag ? bag.price * quantity : null
  const ready = bag && address.trim()

  function order() {
    if (!ready) return
    void submit(async () => {
      const res = await api.createOrder({ type: "WASTE_BAGS", bagSize: bag!.id, quantity, address: address.trim() })
      router.replace(`/orders/${res.order.id}`)
    })
  }

  return (
    <Screen>
      <Section title="Bag size">
        {catalog.bagSizes.map((b) => (
          <OptionCard
            key={b.id}
            title={b.name}
            subtitle={`Pack of ${b.packSize}`}
            trailing={naira(b.price)}
            selected={size === b.id}
            onPress={() => setSize(b.id)}
          />
        ))}
      </Section>

      <Stepper label="Packs" value={quantity} onChange={setQuantity} max={catalog.maxBagPacks} unit="packs" />

      <TextField label="Delivery address" value={address} onChangeText={setAddress} multiline />

      {error ? <ErrorBanner message={error} /> : null}
      <Button
        title={total ? `Continue to payment · ${naira(total)}` : "Continue to payment"}
        onPress={order}
        loading={busy}
        disabled={!ready}
      />
      <Text style={font.muted}>Delivery within 1–2 business days after payment is confirmed.</Text>
    </Screen>
  )
}
