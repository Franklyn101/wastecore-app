import { useState } from "react"
import { Text, View } from "react-native"
import { Badge, Button, Card, Chip, ErrorBanner, Loading, Screen, Section, TextField } from "../../components/ui"
import { api } from "../../lib/api"
import { useAuth } from "../../lib/auth"
import { confirmAction } from "../../lib/dialogs"
import type { StaffMember } from "../../lib/types"
import { useFocusData } from "../../lib/useFocusData"
import { useSubmit } from "../../lib/useSubmit"
import { font, spacing } from "../../theme"

// Main admin only: who can use the staff screens, and what they can do.
export default function Staff() {
  const { user } = useAuth()
  const { data, error, refreshing, refresh, setData } = useFocusData(() => api.admin.staff())
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"OWNER" | "STAFF">("STAFF")
  const add = useSubmit()
  const change = useSubmit()

  if (!data) return error ? <ErrorBanner message={error} onRetry={refresh} /> : <Loading />

  const replace = (s: StaffMember) => setData((d) => d && { staff: d.staff.map((x) => (x.id === s.id ? s : x)) })
  const update = (s: StaffMember, body: { staffRole?: "OWNER" | "STAFF"; disabled?: boolean }, title: string, message: string) =>
    confirmAction(title, message, "Confirm", () => void change.submit(async () => replace((await api.admin.updateStaff(s.id, body)).staff)), {
      destructive: body.disabled === true,
    })

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Text style={font.muted}>
        Staff handle orders, collectors, tickets, quotes and restocking. Main admins can also refund, suspend customers, pay
        collectors, change areas, download reports, manage staff and see the activity log.
      </Text>
      {change.error ? <ErrorBanner message={change.error} /> : null}
      {data.staff.map((s) => (
        <Card key={s.id} style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
            <Text style={font.label}>
              {s.name}
              {s.id === user?.id ? " (you)" : ""}
            </Text>
            {s.disabled ? (
              <Badge label="Disabled" tone="muted" />
            ) : (
              <Badge label={s.staffRole === "OWNER" ? "Main admin" : "Staff"} tone={s.staffRole === "OWNER" ? "success" : "info"} />
            )}
          </View>
          <Text style={font.muted}>{s.phone}</Text>
          {s.id !== user?.id ? (
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              {!s.disabled ? (
                <Button
                  title={s.staffRole === "OWNER" ? "Make staff" : "Make main admin"}
                  variant="secondary"
                  disabled={change.busy}
                  onPress={() =>
                    update(
                      s,
                      { staffRole: s.staffRole === "OWNER" ? "STAFF" : "OWNER" },
                      s.staffRole === "OWNER" ? `Make ${s.name} staff?` : `Make ${s.name} a main admin?`,
                      s.staffRole === "OWNER" ? "They'll lose access to money, accounts and settings." : "They'll be able to do everything you can.",
                    )
                  }
                />
              ) : null}
              <Button
                title={s.disabled ? "Re-enable login" : "Disable login"}
                variant={s.disabled ? "secondary" : "danger"}
                disabled={change.busy}
                onPress={() =>
                  update(
                    s,
                    { disabled: !s.disabled },
                    s.disabled ? `Re-enable ${s.name}?` : `Disable ${s.name}?`,
                    s.disabled ? "They can sign in again." : "They'll be signed out and can't sign in.",
                  )
                }
              />
            </View>
          ) : null}
        </Card>
      ))}

      <Section title="Add someone">
        <TextField label="Full name" value={name} onChangeText={setName} />
        <TextField label="Phone number" placeholder="08012345678" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
        <TextField
          label="Temporary password"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          hint="At least 8 characters. They can change it in Account."
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Chip label="Staff" selected={role === "STAFF"} onPress={() => setRole("STAFF")} />
          <Chip label="Main admin" selected={role === "OWNER"} onPress={() => setRole("OWNER")} />
        </View>
        {add.error ? <ErrorBanner message={add.error} /> : null}
        <Button
          title="Add"
          loading={add.busy}
          disabled={!name.trim() || phone.trim().length < 10 || password.length < 8}
          onPress={() =>
            void add.submit(async () => {
              const { staff } = await api.admin.addStaff({ name: name.trim(), phone: phone.trim(), password, staffRole: role })
              setData((d) => d && { staff: [...d.staff, staff] })
              setName("")
              setPhone("")
              setPassword("")
              setRole("STAFF")
            })
          }
        />
      </Section>
    </Screen>
  )
}
