import * as Location from "expo-location"
import { useCallback, useEffect, useState } from "react"
import { api } from "./api"
import type { ServiceArea } from "./types"

type Point = { lat: number; lng: number }

/** The phone's current position, or null if the customer says no or it can't be found. */
export async function currentPosition(): Promise<Point | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== "granted") return null
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 })
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }))
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch {
    return null
  }
}

/** Opens the phone's maps app with directions to a spot (or a written address if there's no pin). */
export function directionsUrl(to: { lat?: number | null; lng?: number | null; address: string }) {
  const destination = to.lat != null && to.lng != null ? `${to.lat},${to.lng}` : to.address
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

/**
 * Service areas, and where to start the map: the customer's own location if they allow it,
 * otherwise the first live area (Yenagoa at launch).
 */
export function useMapStart(initial?: Point | null) {
  const [areas, setAreas] = useState<ServiceArea[]>([])
  const [start, setStart] = useState<Point | null>(initial ?? null)
  const [usingGps, setUsingGps] = useState(false)
  const [locating, setLocating] = useState(false)

  const locateMe = useCallback(async () => {
    setLocating(true)
    const here = await currentPosition()
    setLocating(false)
    if (here) {
      setStart(here)
      setUsingGps(true)
    }
    return here
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = await api.areas().then((r) => r.areas).catch(() => [] as ServiceArea[])
      if (cancelled) return
      setAreas(list)
      if (initial) return
      const here = await currentPosition()
      if (cancelled) return
      const firstLive = list.find((a) => a.active) ?? list[0]
      if (here) {
        setStart(here)
        setUsingGps(true)
      } else {
        setStart(firstLive ? { lat: firstLive.centerLat, lng: firstLive.centerLng } : { lat: 4.9247, lng: 6.2676 })
      }
    })()
    return () => {
      cancelled = true
    }
    // Runs once per screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { areas, start, usingGps, locating, locateMe }
}
