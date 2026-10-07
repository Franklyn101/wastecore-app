import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { Loading } from "../components/ui"
import { AuthProvider, useAuth } from "../lib/auth"
import { CatalogProvider } from "../lib/catalog"
import { NotificationsProvider } from "../lib/notifications"
import { colors } from "../theme"

function RootNavigator() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />

  // Customers, staff and collectors use the same app; the screens they can reach depend on their role.
  // The server checks the role on every admin request, so this only shapes the UI.
  // Customers and collectors confirm their phone number by SMS before anything else.
  const needsVerifying = !!user && user.role !== "ADMIN" && !user.phoneVerified
  const isCustomer = user?.role === "CUSTOMER" && !needsVerifying
  const isAdmin = user?.role === "ADMIN"
  const isCollector = user?.role === "COLLECTOR" && !needsVerifying

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
        <Stack.Screen name="forgot-password" options={{ title: "Reset password" }} />
      </Stack.Protected>
      <Stack.Protected guard={needsVerifying}>
        <Stack.Screen name="verify-phone" options={{ headerShown: false }} />
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
      <Stack.Protected guard={isCollector}>
        <Stack.Screen name="collector/(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="collector/jobs/[id]" options={{ title: "Job" }} />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="change-password" options={{ title: "Change password" }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <CatalogProvider>
        <NotificationsProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </NotificationsProvider>
      </CatalogProvider>
    </AuthProvider>
  )
}
