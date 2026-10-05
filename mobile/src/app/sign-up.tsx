import { useState } from "react"
import { KeyboardAvoidingView, Platform, Text } from "react-native"
import { Button, ErrorBanner, Screen, TextField } from "../components/ui"
import { useAuth } from "../lib/auth"
import { font } from "../theme"

export default function SignUp() {
  const { signUp } = useAuth()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const passwordTooShort = password.length > 0 && password.length < 8

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      await signUp(name, phone, password)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Text style={font.muted}>Use the phone number our collectors can reach you on.</Text>
        {error ? <ErrorBanner message={error} /> : null}
        <TextField label="Full name" autoComplete="name" textContentType="name" value={name} onChangeText={setName} />
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
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          error={passwordTooShort ? "Use at least 8 characters." : undefined}
          hint="At least 8 characters."
        />
        <Button
          title="Create account"
          onPress={submit}
          loading={busy}
          disabled={!name.trim() || !phone || password.length < 8}
        />
      </Screen>
    </KeyboardAvoidingView>
  )
}
