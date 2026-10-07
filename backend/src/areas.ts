import { prisma } from "./db.ts"
import type { ServiceArea } from "./generated/prisma/client.ts"
import { HttpError } from "./http.ts"

// Where WasteCore works. Areas are circles around a city centre; staff can switch them on
// and resize them in the app.

const EARTH_RADIUS_KM = 6371

/** Straight-line distance in km between two points (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

const centre = (area: ServiceArea) => ({ lat: area.centerLat, lng: area.centerLng })

/** The area a point falls in (served or not), and the nearest area either way. */
export async function locate(point: { lat: number; lng: number }) {
  const areas = await prisma.serviceArea.findMany({ orderBy: { launchOrder: "asc" } })
  const withDistance = areas
    .map((area) => ({ area, km: distanceKm(point, centre(area)) }))
    .sort((x, y) => x.km - y.km)
  const inside = withDistance.find((x) => x.km <= x.area.radiusKm)?.area ?? null
  return { area: inside, nearest: withDistance[0]?.area ?? null, nearestKm: withDistance[0]?.km ?? null }
}

/** The active area a booking address is in, or a clear error if we don't serve it yet. */
export async function requireServedArea(point: { lat: number; lng: number }): Promise<ServiceArea> {
  const { area, nearest } = await locate(point)
  if (area?.active) return area
  if (area) throw new HttpError(422, `We're not in ${area.name} yet, but we're coming soon. Tap "Notify me" and we'll tell you when we launch.`)
  throw new HttpError(
    422,
    `This spot is outside the areas we serve${nearest ? ` (the nearest is ${nearest.name}, ${nearest.state})` : ""}.`,
  )
}

export function publicArea(a: ServiceArea) {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    state: a.state,
    centerLat: a.centerLat,
    centerLng: a.centerLng,
    radiusKm: a.radiusKm,
    active: a.active,
    autoAssign: a.autoAssign,
    dailyCapacity: a.dailyCapacity,
  }
}
