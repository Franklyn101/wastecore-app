import { useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { KeyboardAvoidingView, Platform, Text } from "react-native"
import { Button, ErrorBanner, OptionCard, Screen, Section, TextField } from "../components/ui"
import { useAuth } from "../lib/auth"
import { font } from "../theme"

type Kind = "customer" | "collector"

export default function SignUp() {
  const { as } = useLocalSearchParams<{ as?: string }>()
  const { signUp, signUpCollector } = useAuth()
  const [kind, setKind] = useState<Kind>(as === "collector" ? "collector" : "customer")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [area, setArea] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const collector = kind === "collector"
  const passwordTooShort = password.length > 0 && password.length < 8
  const ready = name.trim() && phone && password.length >= 8 && (!collector || area.trim())

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      if (collector) await signUpCollector(name, phone, password, area)
      else await signUp(name, phone, password)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Section title="I want to">
          <OptionCard
            title="Get my waste picked up"
            subtitle="Book pickups, subscribe to a plan, order bags"
            selected={!collector}
            onPress={() => setKind("customer")}
          />
          <OptionCard
            title="Work as a collector"
            subtitle="Collect waste for WasteCore customers"
            selected={collector}
            onPress={() => setKind("collector")}
          />
        </Section>

        <Text style={font.muted}>
          {collector
            ? "The WasteCore office will check your details and approve your account before you get jobs."
            : "Use the phone number our collectors can reach you on."}
        </Text>
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
        {collector ? (
          <TextField
            label="Area you can cover"
            placeholder="e.g. Ikeja, Yaba, Surulere"
            value={area}
            onChangeText={setArea}
            maxLength={100}
          />
        ) : null}
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
          title={collector ? "Apply as a collector" : "Create account"}
          onPress={submit}
          loading={busy}
          disabled={!ready}
        />
      </Screen>
    </KeyboardAvoidingView>
  )
}
