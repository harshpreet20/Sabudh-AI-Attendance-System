import { isIos, isStandalone, isAndroid } from './pwa'

export type PermissionKind = 'camera' | 'location'
export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

const PERMISSION_NAME: Record<PermissionKind, string> = {
  camera: 'camera',
  location: 'geolocation',
}

/**
 * Best-effort read of a permission's current state without prompting.
 * Uses the Permissions API where available; falls back to 'prompt' (unknown)
 * on engines that can't query it (e.g. Safari for camera/geolocation).
 */
export async function checkPermission(kind: PermissionKind): Promise<PermissionState> {
  if (typeof navigator === 'undefined') return 'unsupported'
  if (kind === 'camera' && !navigator.mediaDevices?.getUserMedia) return 'unsupported'
  if (kind === 'location' && !('geolocation' in navigator)) return 'unsupported'

  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({
        name: PERMISSION_NAME[kind],
      } as unknown as PermissionDescriptor)
      return status.state as PermissionState
    } catch {
      // Not queryable on this engine — assume we can still prompt.
    }
  }
  return 'prompt'
}

/**
 * Actively request camera access. Triggers the native permission prompt when
 * the state is undecided; resolves to 'denied' when blocked so the caller can
 * show guidance instead.
 */
export async function requestCamera(): Promise<PermissionState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported'
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    stream.getTracks().forEach((track) => track.stop())
    return 'granted'
  } catch (err) {
    const name = (err as DOMException)?.name
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
    if (
      name === 'NotFoundError' ||
      name === 'NotReadableError' ||
      name === 'OverconstrainedError'
    ) {
      return 'unsupported'
    }
    return 'prompt'
  }
}

/** Actively request location access. Triggers the native prompt when undecided. */
export async function requestLocation(): Promise<PermissionState> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return 'unsupported'
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => {
        resolve(err.code === err.PERMISSION_DENIED ? 'denied' : 'prompt')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  })
}

export async function requestPermission(kind: PermissionKind): Promise<PermissionState> {
  return kind === 'camera' ? requestCamera() : requestLocation()
}

export interface EnableGuidance {
  platform: string
  steps: string[]
}

/**
 * Platform-specific steps for turning a blocked permission back on. The web
 * can't open OS settings directly, so when a permission is denied we show these
 * instructions instead of a dead "Allow" button.
 */
export function getEnableGuidance(kind: PermissionKind): EnableGuidance {
  const label = kind === 'camera' ? 'Camera' : 'Location'

  if (isIos()) {
    if (isStandalone()) {
      return {
        platform: 'iPhone / iPad (installed app)',
        steps: [
          'Open the iOS Settings app.',
          'Scroll down and tap Sabudh AI.',
          `Turn ${label} on.`,
          'Return here and tap Allow again.',
        ],
      }
    }
    return {
      platform: 'iPhone / iPad (Safari)',
      steps:
        kind === 'camera'
          ? [
              'Tap the "aA" button on the left of Safari\'s address bar.',
              'Tap Website Settings → set Camera to Allow.',
              'Reload the page and tap Allow again.',
            ]
          : [
              'Open iOS Settings → Privacy & Security → Location Services.',
              'Ensure Location Services is on, then find Safari Websites → set to "While Using".',
              'Reload the page and tap Allow again.',
            ],
    }
  }

  if (isAndroid()) {
    return {
      platform: 'Android',
      steps: [
        'Tap the lock icon in the address bar (or ⋮ → Site settings).',
        `Set ${label} to Allow.`,
        'Reload the page and tap Allow again.',
      ],
    }
  }

  return {
    platform: 'Desktop browser',
    steps: [
      'Click the lock / site-info icon on the left of the address bar.',
      `Set ${label} to Allow.`,
      'Reload the page and tap Allow again.',
    ],
  }
}
