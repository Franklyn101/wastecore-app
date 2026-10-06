import { Text } from "react-native"
import { Button, Card, Row, Screen } from "../../../components/ui"
import { useAuth } from "../../../lib/auth"
import { confirmAction } from "../../../lib/dialogs"
import { font } from "../../../theme"

export default function AdminAccount() {
  const { user, signOut } = useAuth()
  return (
    <Screen>
      <Card>
        <Text style={font.heading}>{user?.name}</Text>
        <Row label="Phone" value={user?.phone ?? ""} />
        <Row label="Role" value="Admin" />
      </Card>
      <Button
        title="Sign out"
        variant="danger"
        onPress={() => confirmAction("Sign out?", "You'll need to sign in again to manage orders.", "Sign out", () => void signOut())}
      />
    </Screen>
  )
}
