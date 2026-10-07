import { useMemo } from "react"
import { View } from "react-native"
import type { ServiceArea } from "../lib/types"
import LeafletMap, { type MapMarker } from "./LeafletMap"

type Point = { lat: number; lng: number }

type Props = {
  center: Point
  zoom?: number
  height?: number
  picker?: boolean
  pin?: Point | null
  areas?: ServiceArea[]
  markers?: MapMarker[]
  start?: Point | null
  onMove?: (point: Point) => void
}

/** A map of the spot (and, optionally, our service areas). See LeafletMap for how it's drawn. */
export function MapView({ center, zoom = 16, height = 280, picker, pin, areas = [], markers, start, onMove }: Props) {
  const circles = useMemo(
    () =>
      areas.map((a) => ({
        lat: a.centerLat,
        lng: a.centerLng,
        radiusKm: a.radiusKm,
        active: a.active,
        label: a.active ? `${a.name}: we're here` : `${a.name}: coming soon`,
      })),
    [areas],
  )
  return (
    <View style={{ height, borderRadius: 12, overflow: "hidden" }}>
      <LeafletMap
        center={center}
        zoom={zoom}
        height={height}
        picker={picker}
        pin={pin}
        circles={circles}
        markers={markers}
        start={start}
        onMove={onMove ? async (p) => onMove(p) : undefined}
        dom={{ style: { height }, scrollEnabled: false, matchContents: false }}
      />
    </View>
  )
}
