import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { addressLine } from "../../components/AddressPicker"
import { Button, Card, ErrorBanner, Loading, Screen } from "../../components/ui"
import { api } from "../../lib/api"
import { confirmAction } from "../../lib/dialogs"
import { useFocusData } from "../../lib/useFocusData"
import { colors, font, spacing } from "../../theme"

// The customer's saved addresses, each pinned on the map.
export default function Addresses() {
  const { data, error, refreshing, refresh, setData } = useFocusData(() => api.addresses().then((r) => r.addresses))

  function remove(id: string, label: string) {
    confirmAction("Remove address?", `"${label}" will no longer be offered when you book.`, "Remove", () => {
      void api.deleteAddress(id).then(() => setData((list) => list?.filter((a) => a.id !== id) ?? null))
    })
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {!data ? (
        <Loading />
      ) : data.length === 0 ? (
        <Text style={font.muted}>No saved addresses yet. Add one to book pickups faster.</Text>
      ) : (
        data.map((a) => (
          <Card key={a.id} style={{ gap: spacing.xs }}>
            <Text style={font.label}>{a.label}</Text>
            <Text style={font.body}>{addressLine(a)}</Text>
            {a.areaName ? <Text style={font.muted}>{a.areaName}</Text> : null}
            <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm }}>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/addresses/edit", params: { id: a.id } })}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Edit</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => remove(a.id, a.label)}>
                <Text style={{ color: colors.danger, fontWeight: "700" }}>Remove</Text>
              </Pressable>
            </View>
          </Card>
        ))
      )}
      <Button title="+ Add a new address" onPress={() => router.push("/addresses/edit")} />
    </Screen>
  )
}
