import { createServiceClient } from '@/lib/supabase/service'
import { sendPushToUser } from '@/lib/push'

type NotificationType =
  | 'attendance_accepted'
  | 'attendance_rejected'
  | 'attendance_reminder'
  | 'low_attendance'
  | 'certificate_eligible'
  | 'account_suspended'
  | 'account_restored'
  | 'system'
  | 'info'

interface NotifyInput {
  userId: string
  type: NotificationType
  title: string
  message: string
  metadata?: Record<string, unknown>
  /** Path to open when the push notification is tapped. */
  url?: string
}

/**
 * Create an in-app notification and, when Web Push is configured, deliver it to
 * the user's subscribed devices. Uses the service client so system-generated
 * notifications aren't blocked by row-level security. Push failures never block
 * the DB write.
 */
export async function sendNotification({
  userId,
  type,
  title,
  message,
  metadata,
  url,
}: NotifyInput): Promise<void> {
  const supabase = createServiceClient()

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    metadata: metadata ?? {},
  })

  if (error) {
    console.error('Failed to create notification:', error)
    return
  }

  try {
    await sendPushToUser(userId, {
      title,
      body: message,
      url: url ?? '/dashboard/notifications',
      tag: type,
    })
  } catch (err) {
    console.error('Failed to send push notification:', err)
  }
}
