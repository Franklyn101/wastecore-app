import { useState } from "react"
import { KeyboardAvoidingView, Platform, Text } from "react-native"
import { Button, Card, ErrorBanner, Screen, TextField } from "../components/ui"
import { api } from "../lib/api"
import { useAuth } from "../lib/auth"
import { confirmAction, notify } from "../lib/dialogs"
import { useSubmit } from "../lib/useSubmit"
import { font } from "../theme"

const CUSTOMER_POINTS = [
  "Your name, phone number, email, saved addresses and support messages are deleted.",
  "Unpaid orders and upcoming plan pickups are cancelled.",
  "Your plan stops now, even if days are left, and your saved card is removed so nothing renews.",
  "We keep order numbers and amounts paid, without your name or address, for our accounts.",
]

const COLLECTOR_POINTS = [
  "Your login is deleted and you won't get any more jobs.",
  "The office keeps your past jobs and payouts on record. Ask them about any pay still due.",
]

export default function DeleteAccount() {
  const { user, signOut } = useAuth()
  const [password, setPassword] = useState("")
  const { busy, error, submit } = useSubmit()
  const points = user?.role === "COLLECTOR" ? COLLECTOR_POINTS : CUSTOMER_POINTS

  function confirmDelete() {
    confirmAction(
      "Delete your account?",
      "This can't be undone. You'd need to sign up again to use WasteCore.",
      "Delete",
      () =>
        void submit(async () => {
          await api.deleteAccount(password)
          await signOut()
          notify("Account deleted", "Your WasteCore account has been deleted. Thank you for using WasteCore.")
        }),
      { destructive: true },
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Card>
          <Text style={font.heading}>What happens</Text>
          {points.map((p) => (
            <Text key={p} style={font.body}>
              • {p}
            </Text>
          ))}
        </Card>
        <Text style={font.muted}>
          {user?.role === "COLLECTOR"
            ? "Jobs assigned to you need to be finished or handed back to the office first."
            : "If you have a paid order that isn't done yet, a refund on its way, or money owed for extra bags, that needs to be sorted first."}
        </Text>
        {error ? <ErrorBanner message={error} /> : null}
        <TextField
          label="Your password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          hint="To check it's really you."
        />
        <Button title="Delete my account" variant="danger" onPress={confirmDelete} loading={busy} disabled={!password} />
      </Screen>
    </KeyboardAvoidingView>
  )
}
