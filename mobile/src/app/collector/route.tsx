import { router } from "expo-router"
import { useEffect, useState } from "react"
import { Linking, Pressable, Text, View } from "react-native"
import { MapView } from "../../components/MapView"
import { Badge, Button, Card, ErrorBanner, Loading, Screen } from "../../components/ui"
import { api } from "../../lib/api"
import { pickupWhen } from "../../lib/format"
import { currentPosition, directionsUrl } from "../../lib/location"
import type { RouteStop } from "../../lib/types"
import { colors, font, spacing } from "../../theme"

type Point = { lat: number; lng: number }

/** Google Maps allows a destination plus up to 9 stops on the way. */
const MAX_WAYPOINTS = 9

function navigationUrl(stops: RouteStop[]) {
  const pinned = stops.filter((s) => s.lat != null && s.lng != null).slice(0, MAX_WAYPOINTS + 1)
  if (pinned.length === 0) return null
  const destination = pinned[pinned.length - 1]
  const waypoints = pinned.slice(0, -1).map((s) => `${s.lat},${s.lng}`).join("|")
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${destination.lat},${destination.lng}${
    waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""
  }`
}

// Today's (and overdue) stops, nearest first from where the collector is now.
export default function TodaysRoute() {
  const [here, setHere] = useState<Point | null | undefined>(undefined)
  const [data, setData] = useState<{ stops: RouteStop[]; totalKm: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setError(null)
    const position = await currentPosition()
    setHere(position)
    try {
      setData(await api.collector.route(position))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (!data) return error ? <ErrorBanner message={error} onRetry={() => void load()} /> : <Loading />

  const pinned = data.stops.filter((s) => s.lat != null && s.lng != null)
  const markers = pinned.map((s, i) => ({ lat: s.lat!, lng: s.lng!, label: String(i + 1), title: s.customer.name }))
  const navigate = navigationUrl(data.stops)

  return (
    <Screen>
      {data.stops.length === 0 ? (
        <Card>
          <Text style={font.muted}>No stops left for today.</Text>
        </Card>
      ) : (
        <>
          <Text style={font.muted}>
            {data.stops.length} stop{data.stops.length === 1 ? "" : "s"}
            {data.totalKm ? ` · about ${data.totalKm} km in a straight line` : ""}
            {here ? " · starting from where you are" : ""}
          </Text>
          {markers.length ? (
            <MapView center={markers[0]} zoom={13} markers={markers} start={here ?? null} height={300} />
          ) : null}
          {navigate ? <Button title="Navigate all stops in Google Maps" onPress={() => void Linking.openURL(navigate)} /> : null}
          {data.stops.map((s, i) => (
            <Pressable key={s.id} accessibilityRole="button" onPress={() => router.push(`/collector/jobs/${s.id}`)}>
              <Card style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: s.lat != null ? colors.primary : colors.textMuted,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>{s.lat != null ? i + 1 : "?"}</Text>
                  </View>
                  <Text style={[font.label, { flex: 1 }]}>{s.customer.name}</Text>
                  {s.asap ? <Badge label="ASAP" tone="warning" /> : null}
                  {s.legKm !== null ? <Text style={font.muted}>{s.legKm} km</Text> : null}
                </View>
                <Text style={font.body}>{s.address}</Text>
                {s.landmark ? <Text style={font.muted}>{s.landmark}</Text> : null}
                <Text style={font.muted}>{pickupWhen(s)}</Text>
                <Text
                  style={[font.label, { color: colors.primary }]}
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(directionsUrl(s))}
                >
                  Directions
                </Text>
              </Card>
            </Pressable>
          ))}
          {pinned.length < data.stops.length ? (
            <Text style={font.muted}>Stops marked ? have no map pin. Call the customer for directions.</Text>
          ) : null}
        </>
      )}
      <Button title="Refresh" variant="secondary" onPress={() => void load()} />
    </Screen>
  )
}
