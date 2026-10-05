import { Text } from "react-native"
import { OrderCard } from "../../components/OrderCard"
import { Card, ErrorBanner, Loading, Screen } from "../../components/ui"
import { api } from "../../lib/api"
import { useFocusData } from "../../lib/useFocusData"
import { font } from "../../theme"

export default function Orders() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.orders())
  if (!data && !error) return <Loading />

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {data?.orders.length === 0 ? (
        <Card>
          <Text style={font.label}>No orders yet</Text>
          <Text style={font.muted}>Pickups, plans and bag orders you book will show up here.</Text>
        </Card>
      ) : null}
      {data?.orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </Screen>
  )
}
