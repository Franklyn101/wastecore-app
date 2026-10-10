import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { View } from "react-native"
import { AppTabBar, TabBarProvider } from "../components/AppTabBar"
import { AppLoader } from "../components/AppLoader"
import { AuthProvider, useAuth } from "../lib/auth"
import { CatalogProvider } from "../lib/catalog"
import { NotificationsProvider } from "../lib/notifications"
import { colors } from "../theme"

function RootNavigator() {
  const { user, loading } = useAuth()
  // The launch loader covers the screen until the saved sign-in has been checked.
  if (loading) return null

  // Customers, staff and collectors use the same app; the screens they can reach depend on their role.
  // The server checks the role on every admin request, so this only shapes the UI.
  // Customers and collectors confirm their phone number by SMS before anything else.
  const needsVerifying = !!user && user.role !== "ADMIN" && !user.phoneVerified
  const isCustomer = user?.role === "CUSTOMER" && !needsVerifying
  const isAdmin = user?.role === "ADMIN"
  const isCollector = user?.role === "COLLECTOR" && !needsVerifying

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
          <Stack.Screen name="book/pickup" options={{ title: "Book a pickup" }} />
          <Stack.Screen name="book/plans" options={{ title: "Choose a plan" }} />
          <Stack.Screen name="book/bags" options={{ title: "Order waste bags" }} />
          <Stack.Screen name="plan/checkout" options={{ title: "Payment" }} />
          <Stack.Screen name="payment-return" options={{ title: "Payment" }} />
          <Stack.Screen name="orders/[id]" options={{ title: "Order details" }} />
          <Stack.Screen name="support/new" options={{ title: "Contact support" }} />
          <Stack.Screen name="addresses/index" options={{ title: "My addresses" }} />
          <Stack.Screen name="payments" options={{ title: "Payment history" }} />
          <Stack.Screen name="quotes/index" options={{ title: "Special waste" }} />
          <Stack.Screen name="quotes/new" options={{ title: "Ask for a quote" }} />
          <Stack.Screen name="quotes/[id]" options={{ title: "Quote" }} />
          <Stack.Screen name="addresses/edit" options={{ title: "Address" }} />
        </Stack.Protected>
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="admin/(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="admin/orders/[id]" options={{ title: "Manage order" }} />
          <Stack.Screen name="admin/collector" options={{ title: "Collector" }} />
          <Stack.Screen name="admin/plans/[id]" options={{ title: "Customer plan" }} />
          <Stack.Screen name="admin/areas" options={{ title: "Service areas" }} />
          <Stack.Screen name="admin/pricing" options={{ title: "Pricing" }} />
          <Stack.Screen name="admin/customers/index" options={{ title: "Customers" }} />
          <Stack.Screen name="admin/customers/[id]" options={{ title: "Customer" }} />
          <Stack.Screen name="admin/stock" options={{ title: "Bag stock" }} />
          <Stack.Screen name="admin/refunds" options={{ title: "Refunds" }} />
          <Stack.Screen name="admin/exports" options={{ title: "Reports" }} />
          <Stack.Screen name="admin/quotes/index" options={{ title: "Special waste quotes" }} />
          <Stack.Screen name="admin/quotes/[id]" options={{ title: "Quote" }} />
          <Stack.Screen name="admin/staff" options={{ title: "Staff and access" }} />
          <Stack.Screen name="admin/activity" options={{ title: "Activity log" }} />
          <Stack.Screen name="admin/waste" options={{ title: "Waste report" }} />
        </Stack.Protected>
        <Stack.Protected guard={isCollector}>
          <Stack.Screen name="collector/(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="collector/jobs/[id]" options={{ title: "Job" }} />
          <Stack.Screen name="collector/route" options={{ title: "Today's route" }} />
          <Stack.Screen name="collector/earnings" options={{ title: "Earnings" }} />
          <Stack.Screen name="collector/disposal" options={{ title: "Drop-offs" }} />
        </Stack.Protected>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="change-password" options={{ title: "Change password" }} />
        </Stack.Protected>
      </Stack>
      <AppTabBar />
    </View>
  )
}

/** The logo screen shown when the app first opens. */
function LaunchLoader() {
  const { loading } = useAuth()
  return <AppLoader ready={!loading} />
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <CatalogProvider>
        <NotificationsProvider>
          <TabBarProvider>
            <StatusBar style="dark" />
            <View style={{ flex: 1, backgroundColor: colors.background }}>
              <RootNavigator />
              <LaunchLoader />
            </View>
          </TabBarProvider>
        </NotificationsProvider>
      </CatalogProvider>
    </AuthProvider>
  )
}
