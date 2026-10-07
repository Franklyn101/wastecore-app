import Ionicons from "@expo/vector-icons/Ionicons"
import { router, usePathname } from "expo-router"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAuth } from "../lib/auth"
import { activeTab, tabsFor, type NavTab } from "../lib/navTabs"
import { colors } from "../theme"

// One bottom tab bar for the whole app, so it stays on screen everywhere (order details,
// booking, staff tools...), not only on the five main screens.

const Hidden = createContext<{ hidden: boolean; setHidden: (v: boolean) => void }>({ hidden: false, setHidden: () => {} })

export function TabBarProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false)
  return <Hidden.Provider value={{ hidden, setHidden }}>{children}</Hidden.Provider>
}

/** Hides the tab bar while the calling screen is shown (e.g. a collector waiting for approval). */
export function useHideTabBar(hide: boolean) {
  const { setHidden } = useContext(Hidden)
  useEffect(() => {
    setHidden(hide)
    return () => setHidden(false)
  }, [hide, setHidden])
}

/** Goes to a tab: back to the main screens first, so the back button doesn't lead through old pages. */
function openTab(tab: NavTab, pathname: string) {
  if (pathname === tab.href) return
  if (router.canDismiss()) router.dismissAll()
  router.navigate(tab.href as never)
}

export function AppTabBar() {
  const { user } = useAuth()
  const { hidden } = useContext(Hidden)
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const tabs = tabsFor(user)
  if (hidden || tabs.length === 0) return null
  // Not on an app screen (e.g. signing in): no tabs.
  const current = activeTab(tabs, pathname)
  if (!current && pathname !== "/notifications") return null

  return (
    <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {tabs.map((tab) => {
        const selected = tab === current
        const color = selected ? colors.primary : colors.textMuted
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="tab"
            accessibilityLabel={tab.title}
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => openTab(tab, pathname)}
            style={styles.item}
          >
            <Ionicons name={selected ? (tab.icon.replace("-outline", "") as NavTab["icon"]) : tab.icon} size={24} color={color} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {tab.title}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  item: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 2 },
  label: { fontSize: 11, fontWeight: "600" },
})
