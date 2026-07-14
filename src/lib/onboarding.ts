// Bump this whenever the onboarding tutorial content changes. Users whose
// stored onboarding version is below this value are shown the updated tour once
// on their next visit — for students via student_profiles.onboarding_version,
// for instructors/admins via a versioned localStorage key.
//
// v2: introduced the feature-enhancement suite (QR backup attendance, offline
//     mode, push notifications, analytics/AI insights, at-risk & bulk upload).
// v3: AI-Powered Previous Class Workspace (secure viewer, AI Team, summary,
//     takeaways, self-grading quiz, collaborative whiteboard, notes) plus
//     AI-assisted lecture matching + auto-convert on curriculum upload.
export const ONBOARDING_VERSION = 3

// localStorage key prefixes carry the version so a bump invalidates the old
// "completed" flag automatically without touching stored values.
export function teacherOnboardingKey(userId: string): string {
  return `teacher_onboarding_v${ONBOARDING_VERSION}_${userId}`
}

export function adminOnboardingKey(userId: string): string {
  return `admin_onboarding_v${ONBOARDING_VERSION}_${userId}`
}
