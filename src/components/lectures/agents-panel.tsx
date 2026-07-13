'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Bot, Send, Sparkles, ChevronDown, Plus } from 'lucide-react'

interface AgentContribution { agent: string; name: string; emoji: string; task: string; output: string }
interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  metadata?: { agents?: AgentContribution[] }
}
interface AgentInfo { key: string; name: string; emoji: string; description: string }

const QUICK = [
  'Explain this lecture simply',
  'Give me concise revision notes',
  'Quiz me on this lecture',
  'Find references and further reading',
  'Draw a mind map of the key ideas',
]

// Multi-agent AI assistant for a lecture: an orchestrator delegates to
// specialised agents and returns a merged answer; each assistant reply shows
// which agents contributed, with their individual outputs on demand.
export function AgentsPanel({ lectureId }: { lectureId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const endRef = useRef<HTMLDivElement>(null)

  const init = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/lectures/${lectureId}/agents`)
      const json = await res.json()
      if (json.success) {
        setAgents(json.data.agents)
        const recent = json.data.conversations?.[0]
        if (recent) {
          setConversationId(recent.id)
          const m = await fetch(`/api/lectures/${lectureId}/agents?conversation_id=${recent.id}`).then((r) => r.json())
          if (m.success) setMessages(m.data.messages)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [lectureId])

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send(text: string) {
    const message = text.trim()
    if (!message || sending) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setSending(true)
    try {
      const res = await fetch(`/api/lectures/${lectureId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversation_id: conversationId }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error?.message || 'The AI team could not respond')
        setMessages((prev) => prev.slice(0, -1))
        return
      }
      setConversationId(json.data.conversation_id)
      setMessages((prev) => [...prev, { role: 'assistant', content: json.data.answer, metadata: { agents: json.data.agents } }])
    } finally {
      setSending(false)
    }
  }

  function newChat() {
    setConversationId(null)
    setMessages([])
    setExpanded(new Set())
  }

  if (loading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {agents.map((a) => (
            <Badge key={a.key} variant="secondary" title={a.description}>
              <span className="mr-1">{a.emoji}</span>{a.name}
            </Badge>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={newChat} disabled={sending}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New chat
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="max-h-[52vh] overflow-y-auto space-y-3">
            {messages.length === 0 && (
              <div className="py-8 text-center">
                <Bot className="mx-auto h-8 w-8 text-indigo-400" />
                <p className="mt-2 text-sm text-gray-600">Ask the AI team anything about this lecture.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {QUICK.map((q) => (
                    <button key={q} onClick={() => send(q)} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs text-indigo-700 hover:bg-indigo-100">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={m.id || i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${m.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-gray-50 text-gray-800'}`}>
                  {m.role === 'assistant' && m.metadata?.agents && m.metadata.agents.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap items-center gap-1">
                      {m.metadata.agents.map((a) => (
                        <span key={a.agent} className="inline-flex items-center gap-0.5 rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 border border-gray-200">
                          {a.emoji} {a.name}
                        </span>
                      ))}
                      <button onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })} className="text-[11px] text-indigo-500 inline-flex items-center">
                        details <ChevronDown className={`h-3 w-3 transition-transform ${expanded.has(i) ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  )}
                  <div className="whitespace-pre-line leading-relaxed">{m.content}</div>
                  {m.role === 'assistant' && expanded.has(i) && m.metadata?.agents && (
                    <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
                      {m.metadata.agents.map((a) => (
                        <details key={a.agent} className="text-xs">
                          <summary className="cursor-pointer font-medium text-gray-700">{a.emoji} {a.name}</summary>
                          <p className="mt-1 whitespace-pre-line text-gray-600">{a.output}</p>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-gray-50 px-3.5 py-2.5 text-sm text-gray-500 inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 animate-pulse text-indigo-400" /> The AI team is working…
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input) }}
            className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3"
          >
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this lecture…" disabled={sending} />
            <Button type="submit" size="icon" disabled={sending || !input.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
