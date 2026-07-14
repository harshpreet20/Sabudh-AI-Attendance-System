import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/helpers'
import { createServiceClient } from '@/lib/supabase/service'

type BulkAction = 'suspend' | 'archive' | 'expel' | 'activate' | 'delete' | 'remind'

const STATUS_BY_ACTION: Record<Exclude<BulkAction, 'delete' | 'remind'>, string> = {
  suspend: 'suspended',
  archive: 'archived',
  expel: 'expelled',
  activate: 'active',
}

interface RowResult {
  student_id: string
  name: string
  status: 'ok' | 'skipped' | 'error'
  detail?: string
}

// Bulk actions for the "never logged in" cohort. Supports reversible status
// changes (suspend / archive / expel / activate), a bulk reminder, and a hard
// delete. Destructive actions re-verify each account has genuinely never signed
// in, so an account that has actually logged in can never be removed here.
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdmin()
    const service = createServiceClient()

    const body = await request.json()
    const action = body.action as BulkAction
    const reason: string | undefined = body.reason
    const ids: string[] = Array.isArray(body.student_ids) ? body.student_ids.filter(Boolean) : []

    if (!action || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'action and student_ids are required' } },
        { status: 400 },
      )
    }
    if (ids.length > 500) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY', message: 'Limit bulk actions to 500 students at a time' } },
        { status: 400 },
      )
    }

    // Load the target profiles.
    const { data: profiles } = await service
      .from('student_profiles')
      .select('id, full_name, status, auth_user_id')
      .in('id', ids)

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'No matching students' } }, { status: 404 })
    }

    // For destructive actions, confirm each account has never signed in.
    let neverLoggedIn: Set<string> | null = null
    if (action === 'delete') {
      neverLoggedIn = await buildNeverLoggedInSet(service, profiles.map((p) => p.auth_user_id).filter(Boolean) as string[])
    }

    const results: RowResult[] = []

    for (const p of profiles) {
      try {
        if (action === 'remind') {
          await service.from('notifications').insert({
            user_id: p.auth_user_id,
            type: 'info',
            title: 'Please log in to Sabudh AI',
            message: 'You have not logged in yet. Please sign in to mark attendance and access your course.',
            metadata: { source: 'bulk_reminder' },
          })
          results.push({ student_id: p.id, name: p.full_name, status: 'ok' })
          continue
        }

        if (action === 'delete') {
          if (!p.auth_user_id || (neverLoggedIn && !neverLoggedIn.has(p.auth_user_id))) {
            results.push({ student_id: p.id, name: p.full_name, status: 'skipped', detail: 'Has logged in — not deleted' })
            continue
          }
          const detail = await hardDeleteStudent(service, p.id, p.auth_user_id)
          if (detail) {
            results.push({ student_id: p.id, name: p.full_name, status: 'error', detail })
          } else {
            await service.from('audit_logs').insert({
              actor_id: user.id,
              action: 'student_deleted',
              target_table: 'student_profiles',
              target_id: p.id,
              old_value: { status: p.status },
              new_value: { deleted: true },
              reason: reason || 'Never logged in — bulk removal',
            })
            results.push({ student_id: p.id, name: p.full_name, status: 'ok' })
          }
          continue
        }

        // Status-change actions.
        const newStatus = STATUS_BY_ACTION[action]
        if (!newStatus) {
          results.push({ student_id: p.id, name: p.full_name, status: 'error', detail: 'Unknown action' })
          continue
        }

        const { error: updErr } = await service
          .from('student_profiles')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', p.id)

        if (updErr) {
          results.push({ student_id: p.id, name: p.full_name, status: 'error', detail: updErr.message })
          continue
        }

        const auditAction =
          action === 'suspend' ? 'student_suspended'
          : action === 'archive' ? 'student_archived'
          : action === 'expel' ? 'student_expelled'
          : 'student_restored'
        await service.from('audit_logs').insert({
          actor_id: user.id,
          action: auditAction,
          target_table: 'student_profiles',
          target_id: p.id,
          old_value: { status: p.status },
          new_value: { status: newStatus, reason: reason || null },
          reason: reason || null,
        })

        // Notify on suspend / restore, matching the single-student flow.
        if ((action === 'suspend' || action === 'activate') && p.auth_user_id) {
          await service.from('notifications').insert({
            user_id: p.auth_user_id,
            type: action === 'suspend' ? 'account_suspended' : 'account_restored',
            title: action === 'suspend' ? 'Account Suspended' : 'Account Restored',
            message:
              action === 'suspend'
                ? `Your account has been suspended.${reason ? ` Reason: ${reason}` : ' Please contact your administrator.'}`
                : 'Your account has been restored. You can now log in and mark attendance.',
          })
        }

        results.push({ student_id: p.id, name: p.full_name, status: 'ok' })
      } catch (err) {
        results.push({ student_id: p.id, name: p.full_name, status: 'error', detail: err instanceof Error ? err.message : 'Failed' })
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const errors = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      success: true,
      data: {
        action,
        ok,
        skipped,
        errors,
        message: `${ok} ${labelFor(action)}${skipped ? `, ${skipped} skipped` : ''}${errors ? `, ${errors} failed` : ''}.`,
        results,
      },
    })
  } catch (error) {
    console.error('[admin/inactive-users/bulk] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Bulk action failed' } }, { status: 500 })
  }
}

function labelFor(action: BulkAction): string {
  switch (action) {
    case 'suspend': return 'suspended'
    case 'archive': return 'archived'
    case 'expel': return 'expelled'
    case 'activate': return 'activated'
    case 'delete': return 'deleted'
    case 'remind': return 'reminded'
  }
}

async function buildNeverLoggedInSet(
  service: ReturnType<typeof createServiceClient>,
  authIds: string[],
): Promise<Set<string>> {
  const set = new Set<string>()
  if (authIds.length === 0) return set
  const wanted = new Set(authIds)
  let page = 1
  for (;;) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 1000 })
    if (!data?.users?.length) break
    for (const u of data.users) {
      if (wanted.has(u.id) && !u.last_sign_in_at) set.add(u.id)
    }
    if (data.users.length < 1000) break
    page++
  }
  return set
}

// Best-effort hard delete for a never-logged-in student. Removes the few tables
// that could reference the profile, then the profile, roles and the auth user.
// Returns an error string if the profile could not be removed (e.g. unexpected
// activity data), in which case the auth user is left intact.
async function hardDeleteStudent(
  service: ReturnType<typeof createServiceClient>,
  studentId: string,
  authUserId: string,
): Promise<string | null> {
  // Clear rows that reference the profile without ON DELETE CASCADE.
  await service.from('attendance').delete().eq('student_id', studentId)
  await service.from('student_devices').delete().eq('student_id', studentId)
  await service.from('leave_requests').delete().eq('student_id', studentId)
  await service.from('instructor_notes').delete().eq('student_id', studentId)
  await service.from('notifications').delete().eq('user_id', authUserId)

  // Deleting the profile cascades enrollment_images, risk_assessments and flags.
  const { error: profErr } = await service.from('student_profiles').delete().eq('id', studentId)
  if (profErr) return `Profile delete blocked: ${profErr.message}`

  await service.from('user_roles').delete().eq('user_id', authUserId)

  const { error: authErr } = await service.auth.admin.deleteUser(authUserId)
  if (authErr) return `Auth delete failed: ${authErr.message}`

  return null
}
