import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

const SYSTEM_PROMPT = `You are Sabudh AI Assistant, the helpful chatbot for the Sabudh Foundation's GEN AI Course platform. You help students, teachers, and admins navigate the platform, find information, and get answers.

Your personality:
- Friendly, concise, and helpful
- You know about the Sabudh Foundation, their GEN AI Course at GK Duggal Memorial Centre, Rajouri Garden, New Delhi
- You can guide users to the right pages and features

Platform features you can help with:
- Dashboard: Overview of attendance, announcements, schedules
- Attendance: Mark attendance (location-verified, AI face verification)
- Discussions: Forum with threads, upvotes, moderation
- Assignments: Submit and track assignments
- Projects: Collaborative project management
- Schedules: Class schedules and events
- Leave: Apply for leave, track status
- Announcements: View important announcements
- Certificates: Track eligibility and download certificates
- Profile: Update personal information
- Notifications: View alerts and updates

Navigation hints:
- Students: /dashboard, /dashboard/attendance, /dashboard/discussions, /dashboard/assignments, /dashboard/projects, /dashboard/schedules, /dashboard/leave, /dashboard/announcements, /dashboard/certificate, /dashboard/profile
- Teachers: /teacher, /teacher/students, /teacher/attendance, /teacher/discussions, /teacher/assignments, /teacher/projects, /teacher/schedules, /teacher/announcements, /teacher/leave, /teacher/progress
- Admins: /admin, /admin/approvals, /admin/users, /admin/students, /admin/sessions, /admin/classrooms, /admin/analytics, /admin/certificates, /admin/import, /admin/audit-logs, /admin/settings

When answering, use the knowledge base content provided to give accurate, specific answers. If you don't know something, say so honestly. Keep responses concise - 2-3 sentences when possible.`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { message, conversationId } = await req.json()
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  let convId = conversationId

  if (!convId) {
    const { data: conv, error: convErr } = await supabase
      .from('chatbot_conversations')
      .insert({ user_id: user.id, title: message.slice(0, 100) })
      .select('id')
      .single()
    if (convErr) {
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }
    convId = conv.id
  }

  await supabase.from('chatbot_messages').insert({
    conversation_id: convId,
    role: 'user',
    content: message,
  })

  const { data: history } = await supabase
    .from('chatbot_messages')
    .select('role, content')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(20)

  const { data: knowledge } = await supabase
    .from('chatbot_knowledge')
    .select('title, content, category')
    .eq('organization_id', ORG_ID)
    .eq('is_active', true)
    .limit(50)

  let knowledgeContext = ''
  if (knowledge && knowledge.length > 0) {
    const keywords = message.toLowerCase().split(/\s+/)
    const scored = knowledge.map(doc => {
      const text = `${doc.title} ${doc.content} ${doc.category}`.toLowerCase()
      const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0)
      return { ...doc, score }
    })
    const relevant = scored.filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)
    if (relevant.length > 0) {
      knowledgeContext = '\n\nRelevant knowledge base:\n' +
        relevant.map(d => `[${d.category}] ${d.title}:\n${d.content}`).join('\n\n')
    }
  }

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const userContext = `\n\nCurrent user role: ${userRole?.role || 'student'}`

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system' as const, content: SYSTEM_PROMPT + knowledgeContext + userContext },
    ...(history || []).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  try {
    const openai = getOpenAI()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    })

    const reply = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.'

    await supabase.from('chatbot_messages').insert({
      conversation_id: convId,
      role: 'assistant',
      content: reply,
    })

    return NextResponse.json({ reply, conversationId: convId })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('OpenAI error:', errMsg)
    return NextResponse.json({ error: 'Failed to get AI response. Please check API key configuration.' }, { status: 500 })
  }
}
