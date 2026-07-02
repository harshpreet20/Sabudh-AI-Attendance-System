'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Search,
  Plus,
  Users,
  Trash2,
} from 'lucide-react'

interface Channel {
  id: string
  participant_1: string
  participant_2: string
  last_message_at: string | null
  created_at: string
  other_id: string
  other_name: string
  other_avatar: string | null
  other_role: 'student' | 'teacher'
  last_message_preview: string | null
  unread_count: number
}

interface Message {
  id: string
  channel_id: string
  sender_id: string
  content: string
  read_at: string | null
  created_at: string
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function AdminMessagesPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [newDialog, setNewDialog] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [contacts, setContacts] = useState<{ id: string; name: string; avatar: string | null; role: string }[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const resolveParticipants = useCallback(async (participantIds: string[], currentUserId: string) => {
    if (participantIds.length === 0) return new Map<string, { name: string; avatar: string | null; role: 'student' | 'teacher' }>()

    const [{ data: students }, { data: teachers }] = await Promise.all([
      supabase.from('student_profiles').select('auth_user_id, full_name, profile_image_url').in('auth_user_id', participantIds),
      supabase.from('teacher_profiles').select('auth_user_id, full_name, profile_image_url').in('auth_user_id', participantIds),
    ])

    const map = new Map<string, { name: string; avatar: string | null; role: 'student' | 'teacher' }>()
    students?.forEach((s) => map.set(s.auth_user_id, { name: s.full_name, avatar: s.profile_image_url, role: 'student' }))
    teachers?.forEach((t) => map.set(t.auth_user_id, { name: t.full_name, avatar: t.profile_image_url, role: 'teacher' }))
    return map
  }, [supabase])

  const fetchChannels = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: channelData } = await supabase
      .from('direct_message_channels')
      .select('*')
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (!channelData || channelData.length === 0) {
      setChannels([])
      setLoading(false)
      return
    }

    const otherIds = channelData.map((c) =>
      c.participant_1 === user.id ? c.participant_2 : c.participant_1
    )

    const participantMap = await resolveParticipants(otherIds, user.id)

    const channelIds = channelData.map((c) => c.id)

    const { data: lastMessages } = await supabase
      .from('direct_messages')
      .select('channel_id, content, created_at')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: false })

    const lastMessageMap = new Map<string, string>()
    lastMessages?.forEach((m) => {
      if (!lastMessageMap.has(m.channel_id)) {
        lastMessageMap.set(m.channel_id, m.content)
      }
    })

    const { data: unreadData } = await supabase
      .from('direct_messages')
      .select('channel_id')
      .in('channel_id', channelIds)
      .neq('sender_id', user.id)
      .is('read_at', null)

    const unreadMap = new Map<string, number>()
    unreadData?.forEach((m) => {
      unreadMap.set(m.channel_id, (unreadMap.get(m.channel_id) || 0) + 1)
    })

    const enriched: Channel[] = channelData.map((c) => {
      const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1
      const info = participantMap.get(otherId)
      return {
        ...c,
        other_id: otherId,
        other_name: info?.name || 'Unknown',
        other_avatar: info?.avatar || null,
        other_role: info?.role || 'student',
        last_message_preview: lastMessageMap.get(c.id) || null,
        unread_count: unreadMap.get(c.id) || 0,
      }
    })

    setChannels(enriched)
    setLoading(false)
  }, [supabase, resolveParticipants])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('dm-channels-admin')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'direct_message_channels',
      }, () => {
        fetchChannels()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase, fetchChannels])

  const fetchMessages = useCallback(async (channelId: string) => {
    setMessagesLoading(true)
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })

    setMessages(data || [])
    setMessagesLoading(false)
  }, [supabase])

  const markAsRead = useCallback(async (channelId: string) => {
    if (!userId) return
    await supabase
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .neq('sender_id', userId)
      .is('read_at', null)

    setChannels((prev) =>
      prev.map((c) => (c.id === channelId ? { ...c, unread_count: 0 } : c))
    )
  }, [userId, supabase])

  function openChannel(channel: Channel) {
    setActiveChannel(channel)
    setMessages([])
    setMessageInput('')
    fetchMessages(channel.id)
    markAsRead(channel.id)
  }

  useEffect(() => {
    if (!activeChannel) return

    const channel = supabase
      .channel(`dm-messages-admin-${activeChannel.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `channel_id=eq.${activeChannel.id}`,
      }, (payload) => {
        const newMsg = payload.new as Message
        setMessages((prev) => [...prev, newMsg])
        if (newMsg.sender_id !== userId) {
          markAsRead(activeChannel.id)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeChannel?.id, userId, supabase, markAsRead])

  async function handleSend() {
    if (!messageInput.trim() || !activeChannel || !userId) return
    setSending(true)

    const { error } = await supabase.from('direct_messages').insert({
      channel_id: activeChannel.id,
      sender_id: userId,
      content: messageInput.trim(),
    })

    if (error) {
      toast.error('Failed to send message')
    } else {
      setMessageInput('')
      await supabase
        .from('direct_message_channels')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', activeChannel.id)

      setChannels((prev) =>
        prev.map((c) =>
          c.id === activeChannel.id
            ? { ...c, last_message_at: new Date().toISOString(), last_message_preview: messageInput.trim() }
            : c
        )
      )
      inputRef.current?.focus()
    }
    setSending(false)
  }

  async function handleDeleteMessage(msgId: string) {
    const { error } = await supabase.from('direct_messages').delete().eq('id', msgId)
    if (error) {
      toast.error('Failed to delete message')
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      toast.success('Message deleted')
    }
  }

  async function searchContacts(query: string) {
    setContactSearch(query)
    if (!query.trim()) {
      setContacts([])
      return
    }

    setContactsLoading(true)

    const [{ data: students }, { data: teachers }] = await Promise.all([
      supabase
        .from('student_profiles')
        .select('auth_user_id, full_name, profile_image_url')
        .ilike('full_name', `%${query}%`)
        .limit(15),
      supabase
        .from('teacher_profiles')
        .select('auth_user_id, full_name, profile_image_url')
        .ilike('full_name', `%${query}%`)
        .limit(15),
    ])

    const results: { id: string; name: string; avatar: string | null; role: string }[] = []

    students?.forEach((s) => {
      if (s.auth_user_id !== userId) {
        results.push({
          id: s.auth_user_id,
          name: s.full_name,
          avatar: s.profile_image_url,
          role: 'Student',
        })
      }
    })

    teachers?.forEach((t) => {
      if (t.auth_user_id !== userId) {
        results.push({
          id: t.auth_user_id,
          name: t.full_name,
          avatar: t.profile_image_url,
          role: 'Teacher',
        })
      }
    })

    setContacts(results)
    setContactsLoading(false)
  }

  async function startConversation(otherId: string) {
    if (!userId) return

    const p1 = userId < otherId ? userId : otherId
    const p2 = userId < otherId ? otherId : userId

    const { data: existing } = await supabase
      .from('direct_message_channels')
      .select('*')
      .eq('participant_1', p1)
      .eq('participant_2', p2)
      .maybeSingle()

    if (existing) {
      setNewDialog(false)
      setContactSearch('')
      setContacts([])
      await fetchChannels()
      const found = channels.find((c) => c.id === existing.id)
      if (found) {
        openChannel(found)
      } else {
        const participantMap = await resolveParticipants([otherId], userId)
        const info = participantMap.get(otherId)
        openChannel({
          ...existing,
          other_id: otherId,
          other_name: info?.name || 'Unknown',
          other_avatar: info?.avatar || null,
          other_role: info?.role || 'student',
          last_message_preview: null,
          unread_count: 0,
        })
      }
      return
    }

    const { data: newChannel, error } = await supabase
      .from('direct_message_channels')
      .insert({ participant_1: p1, participant_2: p2 })
      .select()
      .single()

    if (error || !newChannel) {
      toast.error('Failed to start conversation')
      return
    }

    setNewDialog(false)
    setContactSearch('')
    setContacts([])
    await fetchChannels()
    const participantMap = await resolveParticipants([otherId], userId)
    const info = participantMap.get(otherId)
    openChannel({
      ...newChannel,
      other_id: otherId,
      other_name: info?.name || 'Unknown',
      other_avatar: info?.avatar || null,
      other_role: info?.role || 'student',
      last_message_preview: null,
      unread_count: 0,
    })
  }

  const filteredChannels = channels.filter(
    (c) =>
      !searchQuery.trim() ||
      c.other_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (activeChannel) {
    return (
      <div className="flex h-[calc(100vh-10rem)] flex-col">
        <div className="flex items-center gap-3 pb-4">
          <button
            onClick={() => { setActiveChannel(null); fetchChannels() }}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Avatar
            src={activeChannel.other_avatar}
            fallback={getInitials(activeChannel.other_name)}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{activeChannel.other_name}</p>
            <p className="text-xs text-gray-500 capitalize">{activeChannel.other_role}</p>
          </div>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {messagesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                    <Skeleton className="h-10 w-48 rounded-2xl" />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-gray-400">No messages yet. Start the conversation.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === userId
                return (
                  <div key={msg.id} className={`group flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    {isMine && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="mr-1 self-center rounded p-1 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                        isMine
                          ? 'bg-indigo-500 text-white rounded-br-md'
                          : 'glass text-gray-900 rounded-bl-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      <p className={`mt-1 text-[10px] ${isMine ? 'text-indigo-200' : 'text-gray-400'}`}>
                        {timeAgo(msg.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          <div className="border-t border-white/20 p-3">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <Button
                onClick={handleSend}
                disabled={!messageInput.trim() || sending}
                loading={sending}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col lg:flex-row gap-4">
      <div className="flex flex-col w-full">
        <div className="flex items-center justify-between gap-3 pb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={() => setNewDialog(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : filteredChannels.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={searchQuery ? 'No conversations found' : 'No messages yet'}
            description={searchQuery ? 'Try a different search term.' : 'Start a conversation with any user.'}
            action={
              !searchQuery ? (
                <Button onClick={() => setNewDialog(true)} size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  New Message
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2 overflow-y-auto">
            {filteredChannels.map((channel) => (
              <Card
                key={channel.id}
                className="cursor-pointer transition-all duration-200 hover:bg-white/70"
                onClick={() => openChannel(channel)}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar
                        src={channel.other_avatar}
                        fallback={getInitials(channel.other_name)}
                        size="md"
                      />
                      {channel.unread_count > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">
                          {channel.unread_count > 9 ? '9+' : channel.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className={`truncate text-sm ${channel.unread_count > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-900'}`}>
                            {channel.other_name}
                          </p>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                            {channel.other_role === 'teacher' ? 'Teacher' : 'Student'}
                          </Badge>
                        </div>
                        {channel.last_message_at && (
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {timeAgo(channel.last_message_at)}
                          </span>
                        )}
                      </div>
                      {channel.last_message_preview && (
                        <p className={`mt-0.5 truncate text-xs ${channel.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                          {channel.last_message_preview}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={newDialog}
        onClose={() => { setNewDialog(false); setContactSearch(''); setContacts([]) }}
        title="New Message"
        description="Search for any student or teacher"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by name..."
              value={contactSearch}
              onChange={(e) => searchContacts(e.target.value)}
              className="pl-10"
            />
          </div>

          {contactsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : contacts.length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => startConversation(contact.id)}
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 hover:bg-white/60"
                >
                  <Avatar
                    src={contact.avatar}
                    fallback={getInitials(contact.name)}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                    <p className="text-xs text-gray-500">{contact.role}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : contactSearch.trim() ? (
            <div className="py-6 text-center">
              <Users className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No results found</p>
            </div>
          ) : (
            <div className="py-6 text-center">
              <Search className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">Type a name to search</p>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  )
}
