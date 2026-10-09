import { Image, View } from "react-native"
import { spacing } from "../theme"

// The WasteCore logo. Source vectors are in assets/brand/.
const LOGO_RATIO = 109 / 220

/** The full logo: emblem and "WasteCore". */
export function BrandLogo({ width = 180 }: { width?: number }) {
  return (
    <Image
      source={require("../../assets/logo.png")}
      style={{ width, height: width * LOGO_RATIO }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="WasteCore"
    />
  )
}

/** Just the round emblem, for headers. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={require("../../assets/logo-mark.png")}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="WasteCore"
    />
  )
}

/** The emblem at the left of a screen header. */
export function HeaderMark() {
  return (
    <View style={{ marginLeft: spacing.lg, marginRight: spacing.sm }}>
      <BrandMark size={28} />
    </View>
  )
}
