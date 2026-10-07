import { router } from "expo-router"
import { useState } from "react"
import { KeyboardAvoidingView, Platform, Text } from "react-native"
import { Button, ErrorBanner, Screen, TextField } from "../components/ui"
import { api } from "../lib/api"
import { useAuth } from "../lib/auth"
import { notify } from "../lib/dialogs"
import { registerForPush } from "../lib/push"
import { useSubmit } from "../lib/useSubmit"
import { font } from "../theme"

export default function ChangePassword() {
  const { acceptSession } = useAuth()
  const [current, setCurrent] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const { busy, error, submit } = useSubmit()

  const mismatch = confirm.length > 0 && confirm !== password

  function save() {
    void submit(async () => {
      await acceptSession(await api.changePassword({ currentPassword: current, password }))
      // Changing the password signs out other devices and resets push; turn it back on for this phone.
      registerForPush().catch(() => {})
      notify("Password changed", "You've been signed out on your other devices.")
      router.back()
    })
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Text style={font.muted}>Changing your password signs you out on any other phones.</Text>
        {error ? <ErrorBanner message={error} /> : null}
        <TextField
          label="Current password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          value={current}
          onChangeText={setCurrent}
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
        <TextField
          label="Confirm new password"
          secureTextEntry
          autoComplete="new-password"
          value={confirm}
          onChangeText={setConfirm}
          error={mismatch ? "The passwords don't match." : undefined}
        />
        <Button
          title="Change password"
          onPress={save}
          loading={busy}
          disabled={!current || password.length < 8 || confirm !== password}
        />
      </Screen>
    </KeyboardAvoidingView>
  )
}
