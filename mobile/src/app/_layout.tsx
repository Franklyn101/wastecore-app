import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { Loading } from "../components/ui"
import { AuthProvider, useAuth } from "../lib/auth"
import { CatalogProvider } from "../lib/catalog"
import { colors } from "../theme"

function RootNavigator() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />

  // Customers and staff use the same app; the screens they can reach depend on their role.
  // The server checks the role on every admin request, so this only shapes the UI.
  const isCustomer = user?.role === "CUSTOMER"
  const isAdmin = user?.role === "ADMIN"

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!user}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: "Create account" }} />
      </Stack.Protected>
      <Stack.Protected guard={isCustomer}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/pickup" options={{ title: "Instant pickup" }} />
        <Stack.Screen name="book/plans" options={{ title: "Choose a plan" }} />
        <Stack.Screen name="book/bags" options={{ title: "Order waste bags" }} />
        <Stack.Screen name="plan/checkout" options={{ title: "Payment" }} />
        <Stack.Screen name="payment-return" options={{ title: "Payment" }} />
        <Stack.Screen name="orders/[id]" options={{ title: "Order details" }} />
        <Stack.Screen name="support/new" options={{ title: "Contact support" }} />
      </Stack.Protected>
      <Stack.Protected guard={isAdmin}>
        <Stack.Screen name="admin/(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="admin/orders/[id]" options={{ title: "Manage order" }} />
        <Stack.Screen name="admin/collector" options={{ title: "Collector" }} />
        <Stack.Screen name="admin/plans/[id]" options={{ title: "Customer plan" }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <CatalogProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </CatalogProvider>
    </AuthProvider>
  )
}
