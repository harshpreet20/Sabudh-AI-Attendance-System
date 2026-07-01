import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('discussion_topics')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ topics: data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const isStaff = roles?.some(r => ['instructor', 'admin', 'super_admin'].includes(r.role))
  if (!isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, description, color, icon, batch_id } = await req.json()
  if (!name) {
    return NextResponse.json({ error: 'Topic name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('discussion_topics')
    .insert({
      name,
      description: description || null,
      color: color || '#6366f1',
      icon: icon || 'hash',
      batch_id: batch_id || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ topic: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const isStaff = roles?.some(r => ['instructor', 'admin', 'super_admin'].includes(r.role))
  if (!isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'Topic ID is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('discussion_topics')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
