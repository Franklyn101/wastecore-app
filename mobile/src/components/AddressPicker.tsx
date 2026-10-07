import { router } from "expo-router"
import { useEffect, useRef } from "react"
import { Text, View } from "react-native"
import { api } from "../lib/api"
import type { SavedAddress } from "../lib/types"
import { useFocusData } from "../lib/useFocusData"
import { font, spacing } from "../theme"
import { Button, ErrorBanner, Loading, OptionCard } from "./ui"

/** Pick one of the customer's saved, map-pinned addresses for a booking, or add a new one. */
export function AddressPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (id: string | null) => void
}) {
  const { data, error, refresh } = useFocusData(() => api.addresses().then((r) => r.addresses))
  const addresses = data ?? []

  // Choose the first address by default, and select one just added when coming back.
  const known = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!data) return
    const added = known.current ? data.find((a) => !known.current!.has(a.id)) : undefined
    known.current = new Set(data.map((a) => a.id))
    if (added) onChange(added.id)
    else if (!value || !data.some((a) => a.id === value)) onChange(data[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={font.label}>{label}</Text>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : !data ? <Loading /> : null}
      {addresses.map((a) => (
        <OptionCard
          key={a.id}
          title={a.label}
          subtitle={addressLine(a)}
          selected={value === a.id}
          onPress={() => onChange(a.id)}
        />
      ))}
      {data && addresses.length === 0 ? (
        <Text style={font.muted}>Add your address and pin it on the map so the collector can find you.</Text>
      ) : null}
      <Button title="+ Add a new address" variant="secondary" onPress={() => router.push("/addresses/edit")} />
    </View>
  )
}

export const addressLine = (a: Pick<SavedAddress, "address" | "landmark">) =>
  a.landmark ? `${a.address} · ${a.landmark}` : a.address
