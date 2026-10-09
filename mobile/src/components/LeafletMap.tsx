"use dom"

// An OpenStreetMap map, drawn with Leaflet in a web view (an Expo DOM component), so it needs no
// Google Maps key. Use it through <MapView> (components/MapView.tsx), not directly.
import "leaflet/dist/leaflet.css"
import L from "leaflet"
import { useEffect, useRef } from "react"
import type { DOMProps } from "expo/dom"

type Point = { lat: number; lng: number }
export type MapCircle = Point & { radiusKm: number; active: boolean; label: string }
export type MapMarker = Point & { label: string; title?: string }

type Props = {
  center: Point
  zoom: number
  height: number
  /** Picker mode: a pin stays in the middle and the customer moves the map under it. */
  picker?: boolean
  /** View mode: a pin at this spot. */
  pin?: Point | null
  /** Service areas to outline. */
  circles?: MapCircle[]
  /** Numbered stops (e.g. a route). The map zooms to fit them, and the start point if given. */
  markers?: MapMarker[]
  /** Where the route starts (the collector), shown as a dot. */
  start?: Point | null
  /** Picker mode: called with the spot under the pin when the map stops moving. */
  onMove?: (point: Point) => Promise<void>
  dom?: DOMProps
}

const GREEN = "#2E820B"

const pinIcon = L.divIcon({
  className: "",
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  html: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C7.2 0 0 7 0 15.8 0 27.6 16 42 16 42s16-14.4 16-26.2C32 7 24.8 0 16 0z" fill="${GREEN}"/>
    <circle cx="16" cy="15.5" r="6" fill="#fff"/></svg>`,
})

const stopIcon = (label: string) =>
  L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;border-radius:14px;background:${GREEN};color:#fff;border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.4);font:700 13px/24px sans-serif;text-align:center">${label}</div>`,
  })

export default function LeafletMap({ center, zoom, height, picker, pin, circles = [], markers = [], start, onMove }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef<L.LayerGroup | null>(null)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    layers.current = L.layerGroup().addTo(m)
    if (picker) {
      m.on("moveend", () => {
        const c = m.getCenter()
        void onMoveRef.current?.({ lat: round(c.lat), lng: round(c.lng) })
      })
      // Tapping a spot moves it under the pin.
      m.on("click", (e: L.LeafletMouseEvent) => m.panTo(e.latlng))
    }
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
    // The map is created once; center changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Follow the center when it changes (e.g. the phone's location arrives, or "Use my location").
  useEffect(() => {
    const m = map.current
    if (!m) return
    const c = m.getCenter()
    if (Math.abs(c.lat - center.lat) > 1e-6 || Math.abs(c.lng - center.lng) > 1e-6) m.setView([center.lat, center.lng], zoom)
  }, [center.lat, center.lng, zoom])

  useEffect(() => {
    const group = layers.current
    if (!group) return
    group.clearLayers()
    for (const c of circles) {
      L.circle([c.lat, c.lng], {
        radius: c.radiusKm * 1000,
        color: c.active ? GREEN : "#9A6700",
        weight: 2,
        dashArray: c.active ? undefined : "6 6",
        fillOpacity: c.active ? 0.06 : 0.03,
      })
        .bindTooltip(c.label)
        .addTo(group)
    }
    if (pin && !picker) L.marker([pin.lat, pin.lng], { icon: pinIcon }).addTo(group)
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], { icon: stopIcon(m.label) }).addTo(group)
      if (m.title) marker.bindTooltip(m.title)
    }
    if (start) L.circleMarker([start.lat, start.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#1F5FAD", fillOpacity: 1 }).addTo(group)
    if (markers.length > 1 && map.current) {
      const route = [...(start ? [[start.lat, start.lng] as [number, number]] : []), ...markers.map((m) => [m.lat, m.lng] as [number, number])]
      L.polyline(route, { color: GREEN, weight: 3, opacity: 0.6, dashArray: "4 8" }).addTo(group)
      map.current.fitBounds(L.latLngBounds(route), { padding: [30, 30] })
    }
  }, [circles, pin, picker, markers, start])

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden" }}>
      <div ref={el} data-testid="map" style={{ position: "absolute", inset: 0 }} />
      {picker ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -100%)",
            zIndex: 1000,
            pointerEvents: "none",
          }}
          dangerouslySetInnerHTML={{ __html: pinIcon.options.html as string }}
        />
      ) : null}
    </div>
  )
}

/** About 1 m precision is plenty for a pickup. */
const round = (n: number) => Math.round(n * 1e5) / 1e5
