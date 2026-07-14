import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Admin-only: lock/unlock course-material uploads for a batch. When locked,
// instructors can no longer add materials (enforced by RLS); admins still can.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const { data: roleRow } = await service.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    if (!['admin', 'super_admin'].includes(roleRow?.role || '')) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Admins only' } }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const batchId: string | undefined = body.batch_id
    const locked = Boolean(body.locked)
    if (!batchId) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'batch_id required' } }, { status: 400 })
    }

    const { error } = await service.from('batches').update({ uploads_locked: locked }).eq('id', batchId)
    if (error) {
      console.error('[admin/batch-lock] update error:', error.message)
      return NextResponse.json({ success: false, error: { code: 'UPDATE_FAILED' } }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: { batch_id: batchId, uploads_locked: locked } })
  } catch (error) {
    console.error('[admin/batch-lock] error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
