import { router } from "expo-router"
import { useState } from "react"
import { Text } from "react-native"
import { Button, Card, ErrorBanner, Row, Screen, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { confirmAction } from "../../lib/dialogs"
import { font } from "../../theme"

export default function Account() {
  const { user, setUser, signOut } = useAuth()
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const changed =
    name.trim() !== user?.name || email.trim() !== (user?.email ?? "")

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await api.updateProfile({
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      })
      setUser(res.user)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function confirmSignOut() {
    confirmAction("Sign out?", "You'll need your phone number and password to sign back in.", "Sign out", () => void signOut())
  }

  return (
    <Screen>
      <Card>
        <Row label="Phone" value={user?.phone ?? ""} />
      </Card>
      {error ? <ErrorBanner message={error} /> : null}
      <TextField label="Full name" value={name} onChangeText={setName} autoComplete="name" />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        hint="Payment receipts from Paystack are sent here."
      />
      {saved && !changed ? <Text style={font.muted}>Saved.</Text> : null}
      <Button title="Save changes" onPress={save} loading={busy} disabled={!changed || !name.trim()} />
      <Button title="My addresses" variant="secondary" onPress={() => router.push("/addresses")} />
      <Button title="Payment history" variant="secondary" onPress={() => router.push("/payments")} />
      <Button title="Prices and how to pay" variant="secondary" onPress={() => router.push("/prices")} />
      <Button title="Change password" variant="secondary" onPress={() => router.push("/change-password")} />
      <Button title="Sign out" variant="danger" onPress={confirmSignOut} />
    </Screen>
  )
}
