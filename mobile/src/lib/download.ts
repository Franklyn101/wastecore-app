import { File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"
import { Platform } from "react-native"

/** Saves a text file: a browser download on the web, the share sheet (Drive, WhatsApp, email…) on a phone. */
export async function saveTextFile(name: string, text: string, mimeType = "text/csv") {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }
  const file = new File(Paths.cache, name)
  file.create({ overwrite: true })
  file.write(text)
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name, UTI: "public.comma-separated-values-text" })
}
