import * as Notifications from "expo-notifications"
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { AppState, Platform } from "react-native"
import { api } from "./api"
import { useAuth } from "./auth"
import { openNotificationUrl, registerForPush } from "./push"

type NotificationsState = { unread: number; refresh: () => void }

const NotificationsContext = createContext<NotificationsState>({ unread: 0, refresh: () => {} })

/**
 * For a signed-in user: registers the phone for push, keeps the unread count
 * fresh, and opens the right screen when a notification is tapped.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [unread, setUnread] = useState(0)
  const userId = user?.id

  const refresh = useCallback(() => {
    if (!userId) return
    api
      .notifications()
      .then((r) => setUnread(r.unread))
      .catch(() => {}) // offline: keep the last count
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setUnread(0)
      return
    }
    refresh()
    registerForPush().catch((e) => console.warn("Push registration failed:", e))

    // Refresh when the app comes back to the foreground, and every minute while open.
    const appState = AppState.addEventListener("change", (s) => s === "active" && refresh())
    const timer = setInterval(refresh, 60_000)
    return () => {
      appState.remove()
      clearInterval(timer)
    }
  }, [userId, refresh])

  // Push events only exist on phones.
  const handledLaunch = useRef(false)
  useEffect(() => {
    if (!userId || Platform.OS === "web") return
    const received = Notifications.addNotificationReceivedListener(refresh)
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      refresh()
      openNotificationUrl(response.notification.request.content.data?.url)
    })
    // The app was opened by tapping a notification.
    if (!handledLaunch.current) {
      handledLaunch.current = true
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) openNotificationUrl(response.notification.request.content.data?.url)
      })
    }
    return () => {
      received.remove()
      tapped.remove()
    }
  }, [userId, refresh])

  return <NotificationsContext.Provider value={{ unread, refresh }}>{children}</NotificationsContext.Provider>
}

export const useNotifications = () => useContext(NotificationsContext)
