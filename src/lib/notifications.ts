import { createServiceClient } from '@/lib/supabase/service'

// Notification types must stay in sync with the CHECK constraint on the
// notifications table (see migration 014).
export type NotificationType =
  | 'attendance_accepted'
  | 'attendance_rejected'
  | 'attendance_marked'
  | 'attendance_absent'
  | 'attendance_reminder'
  | 'attendance_window_open'
  | 'low_attendance'
  | 'certificate_eligible'
  | 'account_suspended'
  | 'account_restored'
  | 'class_cancelled'
  | 'schedule_updated'
  | 'correction_approved'
  | 'correction_rejected'
  | 'system'
  | 'info'

export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  message: string
  metadata?: Record<string, unknown>
}

/**
 * Persist a notification and best-effort deliver a Web Push message to every
 * device the user has registered. Uses the service-role client so it works
 * from cron jobs and server routes regardless of the caller's RLS context.
 *
 * Push delivery is fire-and-forget: a failed push never blocks the in-app
 * notification, which the client also surfaces via realtime + polling.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const supabase = createServiceClient()

  const { error } = await supabase.from('notifications').insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    metadata: input.metadata ?? {},
  })

  if (error) {
    console.error('[notifications] insert failed:', error.message)
    return
  }

  // Best-effort web push. Only attempts if VAPID keys are configured.
  try {
    await deliverWebPush(input)
  } catch (err) {
    console.error('[notifications] push delivery failed:', err instanceof Error ? err.message : err)
  }
}

/** Fan a single notification out to many users. */
export async function createNotifications(
  userIds: string[],
  notification: Omit<CreateNotificationInput, 'userId'>,
): Promise<void> {
  await Promise.all(
    Array.from(new Set(userIds)).map((userId) =>
      createNotification({ ...notification, userId }),
    ),
  )
}

async function deliverWebPush(input: CreateNotificationInput): Promise<void> {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@attendanceai.harshpreetbhasin.com'

  if (!publicKey || !privateKey) {
    // Web push not configured — in-app notification already stored.
    return
  }

  const supabase = createServiceClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', input.userId)

  if (!subs || subs.length === 0) return

  // web-push is an optional dependency; import lazily by a computed specifier so
  // the app builds and runs even when the package (or the VAPID keys) is absent.
  interface WebPushLike {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void
    sendNotification(
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload: string,
    ): Promise<unknown>
  }
  let webpush: WebPushLike
  try {
    const mod = (await import(/* webpackIgnore: true */ 'web-push' as string)) as { default?: WebPushLike } & WebPushLike
    webpush = (mod.default ?? mod) as WebPushLike
  } catch {
    return
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)

  const payload = JSON.stringify({
    title: input.title,
    body: input.message,
    type: input.type,
    metadata: input.metadata ?? {},
  })

  const stale: string[] = []
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        // 404/410 mean the subscription is gone — clean it up.
        if (statusCode === 404 || statusCode === 410) stale.push(sub.id)
      }
    }),
  )

  if (stale.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', stale)
  }
}
