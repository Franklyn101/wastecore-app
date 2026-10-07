import { useEffect, useState } from "react"
import { KeyboardAvoidingView, Platform, Text } from "react-native"
import { Button, Card, ErrorBanner, Screen, TextField } from "../components/ui"
import { api } from "../lib/api"
import { useAuth } from "../lib/auth"
import { useSubmit } from "../lib/useSubmit"
import { colors, font } from "../theme"

// Forgot password: phone -> 6-digit code (SMS, plus email if the account has one) -> new password.
export default function ForgotPassword() {
  const { acceptSession } = useAuth()
  const [phone, setPhone] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [cooldown, setCooldown] = useState(0)
  const send = useSubmit()
  const reset = useSubmit()

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  function sendCode() {
    void send.submit(async () => {
      const res = await api.requestPasswordReset(phone)
      setSentTo(res.message)
      setCooldown(res.resendAfterSeconds)
    })
  }

  function confirm() {
    void reset.submit(async () => {
      await acceptSession(await api.confirmPasswordReset({ phone, code: code.trim(), password }))
    })
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        {!sentTo ? (
          <>
            <Text style={font.muted}>Enter the phone number you sign in with. We'll text you a 6-digit code.</Text>
            {send.error ? <ErrorBanner message={send.error} /> : null}
            <TextField
              label="Phone number"
              placeholder="08012345678"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={phone}
              onChangeText={setPhone}
              onSubmitEditing={sendCode}
            />
            <Button title="Send code" onPress={sendCode} loading={send.busy} disabled={phone.trim().length < 10} />
          </>
        ) : (
          <>
            <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary }}>
              <Text style={font.body}>{sentTo}</Text>
            </Card>
            {reset.error ? <ErrorBanner message={reset.error} /> : null}
            <TextField
              label="6-digit code"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
            />
            <TextField
              label="New password"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              hint="At least 8 characters."
            />
            <Button
              title="Reset password and sign in"
              onPress={confirm}
              loading={reset.busy}
              disabled={code.length !== 6 || password.length < 8}
            />
            <Button
              title={cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
              variant="secondary"
              loading={send.busy}
              disabled={cooldown > 0}
              onPress={sendCode}
            />
            <Text style={font.muted}>Didn't get a code? Check the number, or contact WasteCore and we can help.</Text>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  )
}
