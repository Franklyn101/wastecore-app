import { router } from "expo-router"
import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import { Badge, Card, Chip, ErrorBanner, Loading, Screen, TextField } from "../../../components/ui"
import { api } from "../../../lib/api"
import { formatDate } from "../../../lib/format"
import { useFocusData } from "../../../lib/useFocusData"
import { font, spacing } from "../../../theme"

// Every customer account, with search by name or phone.
export default function Customers() {
  const [q, setQ] = useState("")
  const [suspended, setSuspended] = useState(false)
  const search = q.trim().length >= 2 ? q.trim() : undefined
  const { data, error, refreshing, refresh } = useFocusData(
    () => api.admin.customers({ q: search, ...(suspended ? { suspended: "true" as const } : {}) }),
    `${search ?? ""}|${suspended}`,
  )

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <TextField label="Search" placeholder="Name or phone number" value={q} onChangeText={setQ} autoCapitalize="none" />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Chip label="All" selected={!suspended} onPress={() => setSuspended(false)} />
        <Chip label="Suspended" selected={suspended} onPress={() => setSuspended(true)} />
      </View>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {!data ? <Loading /> : null}
      {data?.customers.length === 0 ? <Text style={font.muted}>No customers found.</Text> : null}
      {data?.customers.map((c) => (
        <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push(`/admin/customers/${c.id}`)}>
          <Card style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
              <Text style={font.label}>{c.name}</Text>
              {c.suspended ? <Badge label="Suspended" tone="danger" /> : c.activePlan ? <Badge label="On a plan" tone="success" /> : null}
            </View>
            <Text style={font.muted}>
              {c.phone} · {c.orders} order{c.orders === 1 ? "" : "s"} · joined {formatDate(c.createdAt)}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}
