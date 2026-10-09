import * as SplashScreen from "expo-splash-screen"
import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Animated, Platform, StyleSheet, View } from "react-native"
import { colors } from "../theme"
import { BrandLogo } from "./BrandLogo"

// Keep the phone's own splash (the logo on white) up until our loader, which looks the same,
// is drawn, so there's no flash in between.
if (Platform.OS !== "web") void SplashScreen.preventAutoHideAsync().catch(() => {})

/** Same size as the logo on the native splash (app.json: imageWidth 220 of a 1024 image whose logo is 800 wide). */
const LOGO_WIDTH = Math.round((220 * 800) / 1024)

/** Shown at launch while the app gets ready; shown for at least `minMs`, then fades away. */
export function AppLoader({ ready, minMs = 1200 }: { ready: boolean; minMs?: number }) {
  const [minDone, setMinDone] = useState(false)
  const [gone, setGone] = useState(false)
  const opacity = useRef(new Animated.Value(1)).current
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {})
    const timer = setTimeout(() => setMinDone(true), minMs)
    // A gentle breathing effect on the logo.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: Platform.OS !== "web" }),
      ]),
    )
    loop.start()
    return () => {
      clearTimeout(timer)
      loop.stop()
    }
  }, [minMs, pulse])

  useEffect(() => {
    if (!ready || !minDone) return
    Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== "web" }).start(() => setGone(true))
  }, [ready, minDone, opacity])

  if (gone) return null
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] })
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.screen, { opacity }]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading WasteCore"
      pointerEvents={ready && minDone ? "none" : "auto"}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <BrandLogo width={LOGO_WIDTH} />
      </Animated.View>
      <View style={styles.spinner}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", zIndex: 10 },
  spinner: { position: "absolute", bottom: "22%" },
})
