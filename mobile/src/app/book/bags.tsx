import { router } from "expo-router"
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Button, ErrorBanner, Loading, OptionCard, Screen, Section, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { useCatalog } from "../../lib/catalog"
import { naira } from "../../lib/format"
import { useSubmit } from "../../lib/useSubmit"
import { colors, font, radius, spacing } from "../../theme"

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

  const step = (delta: number) => setQuantity((q) => Math.min(catalog.maxBagPacks, Math.max(1, q + delta)))

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

      <View style={styles.stepperRow}>
        <Text style={font.label}>Packs</Text>
        <View style={styles.stepper}>
          <StepButton label="−" onPress={() => step(-1)} disabled={quantity <= 1} a11y="Fewer packs" />
          <Text style={styles.qty} accessibilityLiveRegion="polite">
            {quantity}
          </Text>
          <StepButton label="+" onPress={() => step(1)} disabled={quantity >= catalog.maxBagPacks} a11y="More packs" />
        </View>
      </View>

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

function StepButton({ label, onPress, disabled, a11y }: { label: string; onPress: () => void; disabled: boolean; a11y: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      disabled={disabled}
      style={[styles.stepButton, disabled && { opacity: 0.4 }]}
    >
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 22, fontWeight: "700", color: colors.primary },
  qty: { minWidth: 32, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.text },
})
