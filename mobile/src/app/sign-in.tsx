import { Link } from "expo-router"
import { useState } from "react"
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { BrandLogo } from "../components/BrandLogo"
import { Button, ErrorBanner, Screen, TextField } from "../components/ui"
import { useAuth } from "../lib/auth"
import { colors, font, spacing } from "../theme"

export default function SignIn() {
  const { signIn } = useAuth()
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      await signIn(phone, password)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Screen>
          <View style={styles.hero}>
            <BrandLogo width={200} />
            <Text style={font.title}>Welcome</Text>
            <Text style={[font.muted, { textAlign: "center" }]}>
              Book pickups, manage your plan and order waste bags. Collectors and staff sign in here too.
            </Text>
          </View>

          {error ? <ErrorBanner message={error} /> : null}

          <TextField
            label="Phone number"
            placeholder="08012345678"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            value={phone}
            onChangeText={setPhone}
          />
          <TextField
            label="Password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
          <Button title="Sign in" onPress={submit} loading={busy} disabled={!phone || !password} />
          <Link href="/forgot-password" style={{ color: colors.primary, fontWeight: "700", textAlign: "center" }}>
            Forgot password?
          </Link>

          <Text style={[font.body, { textAlign: "center" }]}>
            New to WasteCore?{" "}
            <Link href="/sign-up" style={{ color: colors.primary, fontWeight: "700" }}>
              Create an account
            </Link>
          </Text>
          <Text style={[font.body, { textAlign: "center" }]}>
            Want to collect waste with us?{" "}
            <Link href={{ pathname: "/sign-up", params: { as: "collector" } }} style={{ color: colors.primary, fontWeight: "700" }}>
              Apply as a collector
            </Link>
          </Text>
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xxl, marginBottom: spacing.lg },
})
