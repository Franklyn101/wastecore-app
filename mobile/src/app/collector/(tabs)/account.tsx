import { router } from "expo-router"
import { Text } from "react-native"
import { Button, Card, ErrorBanner, Row, Screen } from "../../../components/ui"
import { api } from "../../../lib/api"
import { useAuth } from "../../../lib/auth"
import { confirmAction } from "../../../lib/dialogs"
import { useFocusData } from "../../../lib/useFocusData"
import { font } from "../../../theme"

export default function CollectorAccount() {
  const { user, signOut } = useAuth()
  const { data, error } = useFocusData(() => api.collector.me())

  return (
    <Screen>
      <Card>
        <Text style={font.heading}>{user?.name}</Text>
        <Row label="Phone" value={user?.phone ?? ""} />
        <Row label="Area" value={data?.collector.area ?? "…"} />
        <Row label="Role" value="Collector" />
      </Card>
      {error ? <ErrorBanner message={error} /> : null}
      <Text style={font.muted}>To change your name, phone or area, ask the WasteCore office.</Text>
      <Button title="Change password" variant="secondary" onPress={() => router.push("/change-password")} />
      <Button
        title="Sign out"
        variant="danger"
        onPress={() => confirmAction("Sign out?", "You'll need your phone number and password to sign back in.", "Sign out", () => void signOut())}
      />
    </Screen>
  )
}
