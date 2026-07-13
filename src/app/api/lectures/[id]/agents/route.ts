import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getLectureAccess } from '@/lib/lecture-access'
import { gatherLectureContext } from '@/lib/lectures'
import { orchestrate, AGENTS } from '@/lib/agents'

// GET: list conversations, or ?conversation_id= to fetch its messages + the
// available agent roster.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    const roster = AGENTS.map((a) => ({ key: a.key, name: a.name, emoji: a.emoji, description: a.description }))
    const conversationId = new URL(request.url).searchParams.get('conversation_id')

    if (conversationId) {
      const { data: conv } = await service
        .from('ai_agent_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!conv) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
      const { data: messages } = await service
        .from('ai_agent_messages')
        .select('id, role, content, metadata, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      return NextResponse.json({ success: true, data: { messages: messages || [], agents: roster } })
    }

    const { data: conversations } = await service
      .from('ai_agent_conversations')
      .select('id, title, updated_at')
      .eq('session_id', id)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(30)

    return NextResponse.json({ success: true, data: { conversations: conversations || [], agents: roster } })
  } catch (error) {
    console.error('[lectures/:id/agents] GET error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}

// POST: send a message; the orchestrator delegates to agents and returns a
// merged answer + the plan and per-agent outputs.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })

    const service = createServiceClient()
    const access = await getLectureAccess(service, id, user.id)
    if (!access.ok) return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 })

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ success: false, error: { code: 'AI_UNCONFIGURED', message: 'AI is not configured.' } }, { status: 503 })
    }

    const body = await request.json()
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    let conversationId: string | undefined = body.conversation_id
    if (!message) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Message required' } }, { status: 400 })

    // Ensure a conversation exists (owned by this user + lecture).
    if (conversationId) {
      const { data: conv } = await service
        .from('ai_agent_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!conv) conversationId = undefined
    }
    if (!conversationId) {
      const { data: created } = await service
        .from('ai_agent_conversations')
        .insert({ session_id: id, user_id: user.id, title: message.slice(0, 60) })
        .select('id')
        .single()
      conversationId = created?.id
    }
    if (!conversationId) return NextResponse.json({ success: false, error: { code: 'INSERT_FAILED' } }, { status: 500 })

    await service.from('ai_agent_messages').insert({ conversation_id: conversationId, role: 'user', content: message })

    const { context } = await gatherLectureContext(service, id)
    const lectureContext = context && context.length > 20 ? context : `Lecture topic: ${access.session?.topic_taught || 'this lecture'}`

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const result = await orchestrate(openai, lectureContext, message)

    await service.from('ai_agent_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: result.answer,
      metadata: { plan: result.plan, agents: result.agentOutputs.map((o) => ({ agent: o.agent, name: o.name, emoji: o.emoji, task: o.task, output: o.output })) },
    })
    await service.from('ai_agent_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)

    return NextResponse.json({
      success: true,
      data: {
        conversation_id: conversationId,
        answer: result.answer,
        agents: result.agentOutputs.map((o) => ({ agent: o.agent, name: o.name, emoji: o.emoji, task: o.task, output: o.output })),
      },
    })
  } catch (error) {
    console.error('[lectures/:id/agents] POST error:', error)
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
  }
}
