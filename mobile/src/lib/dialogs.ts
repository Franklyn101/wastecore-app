import { Alert, Platform } from "react-native"

/** Asks the user to confirm a destructive or important action. Works on native and web. */
export function confirmAction(
  title: string,
  message: string,
  action: string,
  onConfirm: () => void,
  options: { destructive?: boolean; cancelText?: string } = {},
) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm()
    return
  }
  Alert.alert(title, message, [
    { text: options.cancelText ?? "Cancel", style: "cancel" },
    { text: action, style: options.destructive === false ? "default" : "destructive", onPress: onConfirm },
  ])
}

/** Shows a short message. Works on native and web. */
export function notify(title: string, message: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${message}`)
  else Alert.alert(title, message)
}
