import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const isStaff = roles?.some(r => ['instructor', 'admin', 'super_admin'].includes(r.role))
  if (!isStaff) return null
  return user
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('chatbot_knowledge')
    .select('*')
    .eq('organization_id', ORG_ID)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ documents: data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = await requireStaff(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { title, content, category, source } = await req.json()
  if (!title || !content) {
    return NextResponse.json({ error: 'Title and content are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('chatbot_knowledge')
    .insert({
      organization_id: ORG_ID,
      title,
      content,
      category: category || 'general',
      source: source || 'manual',
      added_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ document: data })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const user = await requireStaff(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, title, content, category, is_active } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title !== undefined) updates.title = title
  if (content !== undefined) updates.content = content
  if (category !== undefined) updates.category = category
  if (is_active !== undefined) updates.is_active = is_active

  const { data, error } = await supabase
    .from('chatbot_knowledge')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ document: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const user = await requireStaff(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('chatbot_knowledge')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
