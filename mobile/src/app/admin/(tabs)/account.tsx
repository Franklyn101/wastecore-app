import { router } from "expo-router"
import { useState } from "react"
import { Text } from "react-native"
import { Button, Card, ErrorBanner, Row, Screen, Section, TextField } from "../../../components/ui"
import { api } from "../../../lib/api"
import { useAuth } from "../../../lib/auth"
import { confirmAction } from "../../../lib/dialogs"
import { useSubmit } from "../../../lib/useSubmit"
import { colors, font } from "../../../theme"

export default function AdminAccount() {
  const { user, signOut } = useAuth()
  const [phone, setPhone] = useState("")
  const [temporary, setTemporary] = useState("")
  const [done, setDone] = useState<string | null>(null)
  const help = useSubmit()
  const owner = user?.staffRole === "OWNER"

  function setTemporaryPassword() {
    confirmAction(
      "Set a temporary password?",
      `The account using ${phone} will be signed out everywhere and can sign in with the new password.`,
      "Set password",
      () =>
        void help.submit(async () => {
          const { user: who } = await api.admin.setUserPassword(phone, temporary)
          setDone(`Done. Tell ${who.name} (${who.phone}) their temporary password, and ask them to change it in Account.`)
          setPhone("")
          setTemporary("")
        }),
      { destructive: false },
    )
  }

  return (
    <Screen>
      <Card>
        <Text style={font.heading}>{user?.name}</Text>
        <Row label="Phone" value={user?.phone ?? ""} />
        <Row label="Role" value={owner ? "Main admin" : "Staff"} />
      </Card>

      <Button title="Service areas" variant="secondary" onPress={() => router.push("/admin/areas")} />

      {owner ? (
        <Section title="Help someone who's locked out">
          <Text style={font.muted}>
            Customers and collectors can reset their own password with a code by SMS. If that doesn't reach them, check who
            they are on a call, then set a temporary password here.
          </Text>
          {help.error ? <ErrorBanner message={help.error} /> : null}
          {done ? <Text style={[font.label, { color: colors.primary }]}>{done}</Text> : null}
          <TextField label="Their phone number" placeholder="08012345678" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <TextField
            label="Temporary password"
            value={temporary}
            onChangeText={setTemporary}
            autoCapitalize="none"
            hint="At least 8 characters."
          />
          <Button
            title="Set temporary password"
            variant="secondary"
            loading={help.busy}
            disabled={phone.trim().length < 10 || temporary.length < 8}
            onPress={setTemporaryPassword}
          />
        </Section>
      ) : null}

      <Button title="Change my password" variant="secondary" onPress={() => router.push("/change-password")} />
      <Button
        title="Sign out"
        variant="danger"
        onPress={() => confirmAction("Sign out?", "You'll need to sign in again to manage orders.", "Sign out", () => void signOut())}
      />
    </Screen>
  )
}
