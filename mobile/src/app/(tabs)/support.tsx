import { router } from "expo-router"
import { Text, View } from "react-native"
import { Badge, Button, Card, ErrorBanner, Screen, Section } from "../../components/ui"
import { api } from "../../lib/api"
import { formatDate, TICKET_STATUS } from "../../lib/format"
import { useFocusData } from "../../lib/useFocusData"
import { font, spacing } from "../../theme"

export default function Support() {
  const { data, error, refreshing, refresh } = useFocusData(() => api.tickets())

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Card>
        <Text style={font.heading}>Need help?</Text>
        <Text style={font.muted}>
          Missed pickup, billing issue or a change of date? Raise a ticket and a WasteCore agent will reach out.
        </Text>
        <Button title="Raise a ticket" onPress={() => router.push("/support/new")} />
      </Card>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {data && data.tickets.length > 0 ? (
        <Section title="Your tickets">
          {data.tickets.map((t) => (
            <Card key={t.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={font.label}>{t.category}</Text>
                <Badge label={TICKET_STATUS[t.status].label} tone={TICKET_STATUS[t.status].tone} />
              </View>
              <Text style={font.body} numberOfLines={3}>
                {t.message}
              </Text>
              <Text style={[font.muted, { marginTop: spacing.xs }]}>
                {t.reference} · {formatDate(t.createdAt)}
              </Text>
            </Card>
          ))}
        </Section>
      ) : null}
    </Screen>
  )
}
