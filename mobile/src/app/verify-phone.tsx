import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useState } from "react"
import { KeyboardAvoidingView, Platform, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Button, Card, ErrorBanner, Screen, TextField } from "../components/ui"
import { api } from "../lib/api"
import { useAuth } from "../lib/auth"
import { useSubmit } from "../lib/useSubmit"
import { colors, font, spacing } from "../theme"

// Shown right after sign-up: the 6-digit code we texted proves the phone number is real.
export default function VerifyPhone() {
  const { user, setUser, signOut } = useAuth()
  const [code, setCode] = useState("")
  // A code was sent at sign-up, so the first resend waits a minute.
  const [cooldown, setCooldown] = useState(60)
  const [resent, setResent] = useState(false)
  const verify = useSubmit()
  const resend = useSubmit()

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  function submit() {
    void verify.submit(async () => setUser((await api.verifyPhone(code)).user))
  }

  function sendAgain() {
    void resend.submit(async () => {
      const res = await api.sendPhoneCode()
      setCooldown(res.resendAfterSeconds)
      setResent(res.sent)
    })
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Screen>
          <View style={{ alignItems: "center", gap: spacing.sm, marginTop: spacing.xl }}>
            <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.primary} />
            <Text style={font.title}>Verify your phone</Text>
            <Text style={[font.muted, { textAlign: "center" }]}>
              We texted a 6-digit code to {user?.phone}. Enter it to finish setting up your account.
            </Text>
          </View>

          {verify.error ? <ErrorBanner message={verify.error} /> : null}
          {resend.error ? <ErrorBanner message={resend.error} /> : null}
          {resent ? (
            <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary }}>
              <Text style={font.body}>We've sent a new code. Only the newest code works.</Text>
            </Card>
          ) : null}

          <TextField
            label="6-digit code"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
            onSubmitEditing={submit}
          />
          <Button title="Verify" onPress={submit} loading={verify.busy} disabled={code.length !== 6} />
          <Button
            title={cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
            variant="secondary"
            loading={resend.busy}
            disabled={cooldown > 0}
            onPress={sendAgain}
          />
          <Text style={[font.muted, { textAlign: "center" }]}>
            Wrong number? Sign out and create your account again with the right one.
          </Text>
          <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
