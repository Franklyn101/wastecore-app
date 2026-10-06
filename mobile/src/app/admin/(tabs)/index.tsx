import { useEffect, useState } from "react"
import { ScrollView, Text, View } from "react-native"
import { AdminOrderRow } from "../../../components/AdminOrderRow"
import { Card, Chip, ErrorBanner, Loading, Screen, TextField } from "../../../components/ui"
import { api } from "../../../lib/api"
import type { OrderStatus } from "../../../lib/types"
import { useFocusData } from "../../../lib/useFocusData"
import { font, spacing } from "../../../theme"

// The queue staff work through, most urgent first.
const FILTERS: { status: OrderStatus | null; label: string }[] = [
  { status: "PENDING", label: "To do" },
  { status: "ASSIGNED", label: "Assigned" },
  { status: "AWAITING_PAYMENT", label: "Unpaid" },
  { status: "COMPLETED", label: "Completed" },
  { status: "INCOMPLETE", label: "Incomplete" },
  { status: "CANCELLED", label: "Cancelled" },
  { status: null, label: "All" },
]

const EMPTY: Record<string, string> = {
  PENDING: "Nothing to do. New paid orders and plan pickups needing a collector appear here.",
  ASSIGNED: "No orders with a collector right now.",
  AWAITING_PAYMENT: "No unpaid orders.",
}

export default function AdminOrders() {
  const [status, setStatus] = useState<OrderStatus | null>("PENDING")
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")

  // Wait until typing pauses before searching.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const orders = useFocusData(() => api.admin.orders({ status: status ?? undefined, q: q || undefined }), `${status}|${q}`)
  const summary = useFocusData(() => api.admin.summary())
  const counts = summary.data?.orders

  const refresh = () => {
    orders.refresh()
    summary.refresh()
  }

  return (
    <Screen refreshing={orders.refreshing} onRefresh={refresh}>
      <TextField
        label="Search"
        placeholder="Reference, customer name or phone"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {FILTERS.map((f) => {
          const count = f.status && counts ? counts[f.status] : null
          return (
            <Chip
              key={f.label}
              label={count ? `${f.label} (${count})` : f.label}
              selected={status === f.status}
              onPress={() => setStatus(f.status)}
            />
          )
        })}
      </ScrollView>

      {orders.error ? <ErrorBanner message={orders.error} onRetry={refresh} /> : null}
      {!orders.data && !orders.error ? <Loading /> : null}

      {orders.data?.orders.length === 0 ? (
        <Card>
          <Text style={font.muted}>{q ? `No orders match "${q}".` : ((status && EMPTY[status]) ?? "No orders here.")}</Text>
        </Card>
      ) : null}

      <View style={{ gap: spacing.md }}>
        {orders.data?.orders.map((order) => (
          <AdminOrderRow key={order.id} order={order} />
        ))}
      </View>
    </Screen>
  )
}
