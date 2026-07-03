export interface GeofenceZone {
  name: string
  latitude: number
  longitude: number
  radiusMeters: number
}

export const FALLBACK_ZONES: GeofenceZone[] = [
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

export function isWithinZones(
  latitude: number,
  longitude: number,
  zones: GeofenceZone[]
): { allowed: boolean; zone: GeofenceZone | null; distance: number } {
  let closestZone: GeofenceZone | null = null
  let minDistance = Infinity

  for (const zone of zones) {
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

// Legacy compatibility — uses fallback hardcoded zones
export function isWithinAnyZone(
  latitude: number,
  longitude: number
): { allowed: boolean; zone: GeofenceZone | null; distance: number } {
  return isWithinZones(latitude, longitude, FALLBACK_ZONES)
}

// Parse coordinates from various link formats:
// - Google Maps: https://maps.google.com/?q=28.6468,77.1228
//                https://www.google.com/maps/@28.6468,77.1228,17z
//                https://www.google.com/maps/place/.../@28.6468,77.1228,17z
//                https://maps.app.goo.gl/... (short links — extract from text)
// - WhatsApp location: typically contains coords like "28.6468,77.1228"
// - Apple Maps: https://maps.apple.com/?ll=28.6468,77.1228
// - Raw coordinates: "28.6468, 77.1228" or "28.6468,77.1228"
export function extractCoordinatesFromText(text: string): { lat: number; lng: number } | null {
  const trimmed = text.trim()

  // Google Maps @lat,lng pattern
  const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/
  const atMatch = trimmed.match(atPattern)
  if (atMatch) {
    const lat = parseFloat(atMatch[1])
    const lng = parseFloat(atMatch[2])
    if (isValidCoordinate(lat, lng)) return { lat, lng }
  }

  // Google Maps ?q=lat,lng or ?ll=lat,lng or &query=lat,lng
  const queryPattern = /[?&](?:q|ll|query|center)=(-?\d+\.?\d*)[,+](-?\d+\.?\d*)/
  const queryMatch = trimmed.match(queryPattern)
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1])
    const lng = parseFloat(queryMatch[2])
    if (isValidCoordinate(lat, lng)) return { lat, lng }
  }

  // Google Maps /place/ embed: !3d{lat}!4d{lng}
  const embedPattern = /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/
  const embedMatch = trimmed.match(embedPattern)
  if (embedMatch) {
    const lat = parseFloat(embedMatch[1])
    const lng = parseFloat(embedMatch[2])
    if (isValidCoordinate(lat, lng)) return { lat, lng }
  }

  // Raw coordinate pair: "28.6468, 77.1228" or "28.6468,77.1228"
  const rawPattern = /^(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)$/
  const rawMatch = trimmed.match(rawPattern)
  if (rawMatch) {
    const lat = parseFloat(rawMatch[1])
    const lng = parseFloat(rawMatch[2])
    if (isValidCoordinate(lat, lng)) return { lat, lng }
  }

  // Fallback: find any pair of decimal numbers that look like coordinates
  const fallbackPattern = /(-?\d{1,3}\.\d{3,})\s*[,\s]\s*(-?\d{1,3}\.\d{3,})/
  const fallbackMatch = trimmed.match(fallbackPattern)
  if (fallbackMatch) {
    const lat = parseFloat(fallbackMatch[1])
    const lng = parseFloat(fallbackMatch[2])
    if (isValidCoordinate(lat, lng)) return { lat, lng }
  }

  return null
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  )
}
