export interface GeofenceZone {
  name: string
  latitude: number
  longitude: number
  radiusMeters: number
}

export const ALLOWED_ZONES: GeofenceZone[] = [
  {
    name: 'GK Duggal Memorial Centre, Rajouri Garden',
    latitude: 28.6468,
    longitude: 77.1228,
    radiusMeters: 500,
  },
  {
    name: 'Sabudh Foundation Centre',
    latitude: 28.6512,
    longitude: 77.1262,
    radiusMeters: 500,
  },
]

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function isWithinAnyZone(
  latitude: number,
  longitude: number
): { allowed: boolean; zone: GeofenceZone | null; distance: number } {
  let closestZone: GeofenceZone | null = null
  let minDistance = Infinity

  for (const zone of ALLOWED_ZONES) {
    const dist = haversineDistance(latitude, longitude, zone.latitude, zone.longitude)
    if (dist < minDistance) {
      minDistance = dist
      closestZone = zone
    }
    if (dist <= zone.radiusMeters) {
      return { allowed: true, zone, distance: dist }
    }
  }

  return { allowed: false, zone: closestZone, distance: minDistance }
}
