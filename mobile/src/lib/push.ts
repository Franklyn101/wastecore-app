import Constants, { ExecutionEnvironment } from "expo-constants"
import * as Device from "expo-device"
import * as Notifications from "expo-notifications"
import { router } from "expo-router"
import { Platform } from "react-native"
import { api } from "./api"

// Show alerts that arrive while the app is open, as a banner.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

let registeredToken: string | null = null

/**
 * Asks permission and registers this phone for push notifications.
 * Does nothing on the web, on simulators, or before the app has an EAS project id
 * (`npx eas-cli init` adds it); the in-app notification list still works then.
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return
  // Expo Go can't receive push notifications; a real build (EAS) can. The bell still works.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "WasteCore updates",
      importance: Notifications.AndroidImportance.HIGH,
    })
  }

  let { status } = await Notifications.getPermissionsAsync()
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status
  if (status !== "granted") return

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  if (!projectId) {
    console.warn("Push notifications are off: no EAS project id. Run `npx eas-cli init` in mobile/.")
    return
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
  await api.registerPushToken(token, Platform.OS === "ios" ? "ios" : "android")
  registeredToken = token
}

/** Stops this phone getting the signed-out user's alerts. */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return
  const token = registeredToken
  registeredToken = null
  await api.removePushToken(token).catch(() => {}) // best effort; the server also drops dead tokens
}

/** Opens the screen a notification points to. */
export function openNotificationUrl(url: unknown) {
  if (typeof url === "string" && url.startsWith("/")) router.push(url as never)
}
