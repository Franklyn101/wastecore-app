import type Ionicons from "@expo/vector-icons/Ionicons"
import type { ComponentProps } from "react"
import type { User } from "./types"

type IconName = ComponentProps<typeof Ionicons>["name"]

export type NavTab = {
  title: string
  icon: IconName
  /** Where the tab goes. */
  href: string
  /** Other screens that belong to this tab, so it stays highlighted on them (path prefixes). */
  owns?: string[]
}

// The bottom tabs for each kind of account. They show on every screen, not just the tab roots.
const CUSTOMER: NavTab[] = [
  { title: "Home", icon: "home-outline", href: "/", owns: ["/book/pickup", "/book/bags", "/quotes"] },
  { title: "My plan", icon: "calendar-outline", href: "/plan", owns: ["/book/plans", "/plan/"] },
  { title: "Orders", icon: "receipt-outline", href: "/orders", owns: ["/orders/", "/payment-return"] },
  { title: "Support", icon: "chatbubbles-outline", href: "/support", owns: ["/support/"] },
  { title: "Account", icon: "person-outline", href: "/account", owns: ["/addresses", "/payments", "/change-password"] },
]

const ADMIN: NavTab[] = [
  { title: "Orders", icon: "file-tray-full-outline", href: "/admin", owns: ["/admin/orders/"] },
  {
    title: "Overview",
    icon: "stats-chart-outline",
    href: "/admin/overview",
    owns: ["/admin/customers", "/admin/stock", "/admin/refunds", "/admin/exports", "/admin/quotes", "/admin/waste", "/admin/staff", "/admin/activity", "/admin/areas"],
  },
  { title: "Plans", icon: "calendar-outline", href: "/admin/plans", owns: ["/admin/plans/"] },
  { title: "Collectors", icon: "people-outline", href: "/admin/collectors", owns: ["/admin/collector"] },
  { title: "Tickets", icon: "chatbubbles-outline", href: "/admin/tickets" },
  { title: "Account", icon: "person-outline", href: "/admin/account" },
]

const COLLECTOR: NavTab[] = [
  { title: "My jobs", icon: "navigate-outline", href: "/collector", owns: ["/collector/jobs/", "/collector/route", "/collector/disposal", "/collector/earnings"] },
  { title: "History", icon: "checkmark-done-outline", href: "/collector/history" },
  { title: "Account", icon: "person-outline", href: "/collector/account" },
]

export function tabsFor(user: User | null): NavTab[] {
  if (!user) return []
  if (user.role === "ADMIN") return ADMIN
  if (!user.phoneVerified) return []
  return user.role === "COLLECTOR" ? COLLECTOR : CUSTOMER
}

/** The tab a screen belongs to: an exact tab match first, then the longest matching prefix. */
export function activeTab(tabs: NavTab[], pathname: string): NavTab | undefined {
  const exact = tabs.find((t) => t.href === pathname)
  if (exact) return exact
  let best: { tab: NavTab; length: number } | undefined
  for (const tab of tabs) {
    for (const prefix of tab.owns ?? []) {
      if (pathname.startsWith(prefix) && prefix.length > (best?.length ?? 0)) best = { tab, length: prefix.length }
    }
  }
  return best?.tab
}
