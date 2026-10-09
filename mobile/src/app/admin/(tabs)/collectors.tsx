import { router } from "expo-router"
import { Pressable, Text, View } from "react-native"
import { Badge, Button, Card, ErrorBanner, Loading, Screen, Section } from "../../../components/ui"
import { api } from "../../../lib/api"
import { confirmAction } from "../../../lib/dialogs"
import type { Collector } from "../../../lib/types"
import { useFocusData } from "../../../lib/useFocusData"
import { useSubmit } from "../../../lib/useSubmit"
import { colors, font, hairline, radius, shadow, spacing } from "../../../theme"

export default function AdminCollectors() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.admin.collectors())
  const pending = data?.collectors.filter((c) => c.pending) ?? []
  const team = data?.collectors.filter((c) => !c.pending) ?? []

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {!data && !error ? <Loading /> : null}

      {pending.length > 0 ? (
        <Section title={`Waiting for approval (${pending.length})`}>
          {pending.map((c) => (
            <PendingCollector key={c.id} collector={c} onDone={refresh} />
          ))}
        </Section>
      ) : null}

      <Button title="Add collector" onPress={() => router.push("/admin/collector")} />

      {data && team.length === 0 ? (
        <Card>
          <Text style={font.muted}>No collectors yet. Add your drivers, or approve them when they apply in the app.</Text>
        </Card>
      ) : null}
      {team.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${c.name}`}
          onPress={() => router.push({ pathname: "/admin/collector", params: { id: c.id } })}
          style={({ pressed }) => ({
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: hairline,
            padding: spacing.lg,
            gap: spacing.xs,
            ...shadow.card,
            opacity: pressed ? 0.9 : c.active ? 1 : 0.7,
          })}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={font.label}>{c.name}</Text>
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              {c.onDuty ? <Badge label="On duty" tone="success" /> : null}
              {c.hasLogin ? <Badge label="App login" tone="info" /> : null}
              <Badge label={c.active ? "Active" : "Inactive"} tone={c.active ? "success" : "muted"} />
            </View>
          </View>
          <Text style={font.muted}>
            {c.area} · {c.phone}
          </Text>
        </Pressable>
      ))}
    </Screen>
  )
}

/** A collector who signed up in the app, with approve and reject buttons. */
function PendingCollector({ collector: c, onDone }: { collector: Collector; onDone: () => void }) {
  const { busy, error, submit } = useSubmit()
  const act = (fn: () => Promise<unknown>) =>
    void submit(async () => {
      await fn()
      onDone()
    })

  return (
    <Card style={{ borderColor: colors.warning }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={font.label}>{c.name}</Text>
        <Badge label="Applied in app" tone="warning" />
      </View>
      <Text style={font.muted}>
        {c.area} · {c.phone}
      </Text>
      <Text style={font.muted}>Check who they are (for example, call them) before approving. They'll see customers' addresses and numbers.</Text>
      {error ? <ErrorBanner message={error} /> : null}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button
          title="Reject"
          variant="danger"
          style={{ flex: 1 }}
          disabled={busy}
          onPress={() =>
            confirmAction(`Reject ${c.name}?`, "Their app login will be removed.", "Reject", () =>
              act(() => api.admin.rejectCollector(c.id)),
            )
          }
        />
        <Button title="Approve" style={{ flex: 1 }} loading={busy} onPress={() => act(() => api.admin.approveCollector(c.id))} />
      </View>
    </Card>
  )
}
