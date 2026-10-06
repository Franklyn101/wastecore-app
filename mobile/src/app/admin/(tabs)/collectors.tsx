import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { Badge, Button, Card, ErrorBanner, Loading, Screen } from "../../../components/ui"
import { api } from "../../../lib/api"
import { useFocusData } from "../../../lib/useFocusData"
import { colors, font, radius, spacing } from "../../../theme"

export default function AdminCollectors() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.admin.collectors())

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Button title="Add collector" onPress={() => router.push("/admin/collector")} />
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {!data && !error ? <Loading /> : null}
      {data?.collectors.length === 0 ? (
        <Card>
          <Text style={font.muted}>No collectors yet. Add your drivers so you can assign them to pickups.</Text>
        </Card>
      ) : null}
      {data?.collectors.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${c.name}`}
          onPress={() => router.push({ pathname: "/admin/collector", params: { id: c.id } })}
          style={({ pressed }) => ({
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.lg,
            gap: spacing.xs,
            opacity: pressed ? 0.85 : c.active ? 1 : 0.7,
          })}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={font.label}>{c.name}</Text>
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              {c.hasLogin ? <Badge label="App login" tone="info" /> : null}
              <Badge label={c.active ? "Active" : "Inactive"} tone={c.active ? "success" : "muted"} />
            </View>
          </View>
          <Text style={font.muted}>
            {c.area} · {c.phone}
          </Text>
        </Pressable>
      ))}
    </Screen>
  )
}
