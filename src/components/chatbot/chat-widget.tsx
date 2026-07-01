'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, X, Send, Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setLoading(true)

    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId }),
      })

      const data = await res.json()

      if (res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
        if (data.conversationId) setConversationId(data.conversationId)
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.error || 'Sorry, something went wrong. Please try again.',
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error. Please check your internet and try again.',
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleNewChat() {
    setMessages([])
    setConversationId(null)
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:bg-indigo-600 hover:shadow-xl hover:shadow-indigo-500/40 active:scale-95 lg:bottom-6"
          aria-label="Open AI Assistant"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[500px] w-[360px] flex-col overflow-hidden rounded-2xl border border-white/30 bg-white/95 shadow-2xl backdrop-blur-xl lg:bottom-6 sm:w-[400px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-indigo-500 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                <Bot className="h-4.5 w-4.5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Sabudh AI Assistant</h3>
                <p className="text-xs text-indigo-100">Ask me anything</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewChat}
                className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/20 hover:text-white"
                aria-label="New chat"
                title="New chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/20 hover:text-white"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
                  <MessageSquare className="h-6 w-6 text-indigo-400" />
                </div>
                <p className="mt-3 text-sm font-medium text-gray-700">How can I help you?</p>
                <p className="mt-1 text-xs text-gray-400">Ask about the platform, your courses, or anything else</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    'How do I mark attendance?',
                    'Where are my assignments?',
                    'How to apply for leave?',
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); setTimeout(handleSend, 0) }}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'mb-3 flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-indigo-500 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  )}
                >
                  {msg.content.split('\n').map((line, j) => (
                    <span key={j}>
                      {line}
                      {j < msg.content.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {loading && (
              <div className="mb-3 flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3">
            <form
              onSubmit={e => { e.preventDefault(); handleSend() }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-200"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white transition hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
