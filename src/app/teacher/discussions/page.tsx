'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MessageSquare,
  Plus,
  ArrowUp,
  Pin,
  PinOff,
  Lock,
  Unlock,
  Send,
  ArrowLeft,
  Search,
  Clock,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  Shield,
  ShieldOff,
} from 'lucide-react'
import type { DiscussionThread, DiscussionReply } from '@/types/database'

interface ThreadWithAuthor extends DiscussionThread {
  author_name: string
  author_avatar: string | null
  has_upvoted: boolean
}

interface ReplyWithAuthor extends DiscussionReply {
  author_name: string
  author_avatar: string | null
  has_upvoted: boolean
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

function RoleBadge({ role }: { role: string }) {
  if (role === 'instructor') return <Badge variant="default" className="text-[10px] px-1.5 py-0"><ShieldCheck className="mr-0.5 h-2.5 w-2.5" />Teacher</Badge>
  if (role === 'admin') return <Badge variant="warning" className="text-[10px] px-1.5 py-0">Admin</Badge>
  return null
}

export default function TeacherDiscussionsPage() {
  const supabase = createClient()
  const [threads, setThreads] = useState<ThreadWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [batchIds, setBatchIds] = useState<string[]>([])

  const [newDialog, setNewDialog] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [posting, setPosting] = useState(false)

  const [activeThread, setActiveThread] = useState<ThreadWithAuthor | null>(null)
  const [replies, setReplies] = useState<ReplyWithAuthor[]>([])
  const [repliesLoading, setRepliesLoading] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [replying, setReplying] = useState(false)

  const [deleteDialog, setDeleteDialog] = useState<{ type: 'thread' | 'reply'; id: string; name: string } | null>(null)
  const [modIds, setModIds] = useState<Set<string>>(new Set())

  const fetchThreads = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: myBatches } = await supabase
      .from('batches')
      .select('id')
      .eq('instructor_id', user.id)
      .eq('status', 'active')

    const ids = myBatches?.map(b => b.id) ?? []
    setBatchIds(ids)

    const { data: mods } = await supabase
      .from('discussion_moderators')
      .select('user_id')

    setModIds(new Set(mods?.map(m => m.user_id) ?? []))

    let query = supabase
      .from('discussion_threads')
      .select('*')
      .order('pinned', { ascending: false })
      .order('last_activity_at', { ascending: false })

    if (ids.length > 0) {
      query = query.or(`batch_id.in.(${ids.join(',')}),batch_id.is.null`)
    }

    const { data: threadData } = await query

    if (!threadData || threadData.length === 0) {
      setThreads([])
      setLoading(false)
      return
    }

    const authorIds = [...new Set(threadData.map(t => t.author_id))]

    const [{ data: studentAuthors }, { data: teacherAuthors }] = await Promise.all([
      supabase.from('student_profiles').select('auth_user_id, full_name, profile_image_url').in('auth_user_id', authorIds),
      supabase.from('teacher_profiles').select('auth_user_id, full_name, profile_image_url').in('auth_user_id', authorIds),
    ])

    const authorMap = new Map<string, { name: string; avatar: string | null }>()
    studentAuthors?.forEach(a => authorMap.set(a.auth_user_id, { name: a.full_name, avatar: a.profile_image_url }))
    teacherAuthors?.forEach(a => authorMap.set(a.auth_user_id, { name: a.full_name, avatar: a.profile_image_url }))

    const { data: upvotes } = await supabase
      .from('discussion_upvotes')
      .select('thread_id')
      .eq('user_id', user.id)
      .in('thread_id', threadData.map(t => t.id))

    const upvotedSet = new Set(upvotes?.map(u => u.thread_id) ?? [])

    setThreads(threadData.map(t => ({
      ...t,
      author_name: authorMap.get(t.author_id)?.name || 'Unknown',
      author_avatar: authorMap.get(t.author_id)?.avatar || null,
      has_upvoted: upvotedSet.has(t.id),
    })))
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchThreads() }, [fetchThreads])

  useEffect(() => {
    const channel = supabase
      .channel('teacher-discussion-threads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_threads' }, () => {
        if (!activeThread) fetchThreads()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeThread]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchReplies(threadId: string) {
    if (!userId) return
    setRepliesLoading(true)

    const { data: replyData } = await supabase
      .from('discussion_replies')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (!replyData) { setRepliesLoading(false); return }

    const authorIds = [...new Set(replyData.map(r => r.author_id))]
    const [{ data: sA }, { data: tA }] = await Promise.all([
      supabase.from('student_profiles').select('auth_user_id, full_name, profile_image_url').in('auth_user_id', authorIds),
      supabase.from('teacher_profiles').select('auth_user_id, full_name, profile_image_url').in('auth_user_id', authorIds),
    ])

    const authorMap = new Map<string, { name: string; avatar: string | null }>()
    sA?.forEach(a => authorMap.set(a.auth_user_id, { name: a.full_name, avatar: a.profile_image_url }))
    tA?.forEach(a => authorMap.set(a.auth_user_id, { name: a.full_name, avatar: a.profile_image_url }))

    const { data: upvotes } = await supabase
      .from('discussion_upvotes')
      .select('reply_id')
      .eq('user_id', userId)
      .in('reply_id', replyData.map(r => r.id))

    const upvotedSet = new Set(upvotes?.map(u => u.reply_id) ?? [])

    setReplies(replyData.map(r => ({
      ...r,
      author_name: authorMap.get(r.author_id)?.name || 'Unknown',
      author_avatar: authorMap.get(r.author_id)?.avatar || null,
      has_upvoted: upvotedSet.has(r.id),
    })))
    setRepliesLoading(false)
  }

  useEffect(() => {
    if (!activeThread) return
    const channel = supabase
      .channel('teacher-discussion-replies')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'discussion_replies', filter: `thread_id=eq.${activeThread.id}` }, () => {
        fetchReplies(activeThread.id)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeThread?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleMod(authorId: string, authorName: string) {
    if (!userId) return
    const isMod = modIds.has(authorId)

    if (isMod) {
      await supabase.from('discussion_moderators').delete().eq('user_id', authorId)
      setModIds(prev => { const next = new Set(prev); next.delete(authorId); return next })
      toast.success(`${authorName} removed as moderator`)
    } else {
      await supabase.from('discussion_moderators').insert({
        user_id: authorId,
        batch_id: batchIds[0] || null,
        appointed_by: userId,
      })
      setModIds(prev => new Set(prev).add(authorId))
      toast.success(`${authorName} appointed as moderator`)
    }
  }

  async function handleNewThread() {
    if (!newTitle.trim() || !newContent.trim() || !userId) return
    setPosting(true)

    const { error } = await supabase.from('discussion_threads').insert({
      batch_id: batchIds[0] || null,
      author_id: userId,
      author_role: 'instructor',
      title: newTitle.trim(),
      content: newContent.trim(),
    })

    if (error) toast.error('Failed to create post')
    else {
      toast.success('Post created')
      setNewDialog(false)
      setNewTitle('')
      setNewContent('')
      fetchThreads()
    }
    setPosting(false)
  }

  async function handleReply() {
    if (!replyContent.trim() || !activeThread || !userId) return
    setReplying(true)

    const { error } = await supabase.from('discussion_replies').insert({
      thread_id: activeThread.id,
      author_id: userId,
      author_role: 'instructor',
      content: replyContent.trim(),
    })

    if (error) toast.error('Failed to post reply')
    else {
      setReplyContent('')
      fetchReplies(activeThread.id)
      await supabase.from('discussion_threads')
        .update({ reply_count: activeThread.reply_count + 1, last_activity_at: new Date().toISOString() })
        .eq('id', activeThread.id)
      setActiveThread(prev => prev ? { ...prev, reply_count: prev.reply_count + 1 } : null)
    }
    setReplying(false)
  }

  async function togglePin(thread: ThreadWithAuthor) {
    const { error } = await supabase
      .from('discussion_threads')
      .update({ pinned: !thread.pinned })
      .eq('id', thread.id)

    if (error) toast.error('Failed to update pin')
    else {
      toast.success(thread.pinned ? 'Unpinned' : 'Pinned')
      if (activeThread?.id === thread.id) {
        setActiveThread(prev => prev ? { ...prev, pinned: !prev.pinned } : null)
      }
      fetchThreads()
    }
  }

  async function toggleLock(thread: ThreadWithAuthor) {
    const { error } = await supabase
      .from('discussion_threads')
      .update({ locked: !thread.locked })
      .eq('id', thread.id)

    if (error) toast.error('Failed to update lock')
    else {
      toast.success(thread.locked ? 'Unlocked' : 'Locked')
      if (activeThread?.id === thread.id) {
        setActiveThread(prev => prev ? { ...prev, locked: !prev.locked } : null)
      }
      fetchThreads()
    }
  }

  async function toggleAnswer(reply: ReplyWithAuthor) {
    const { error } = await supabase
      .from('discussion_replies')
      .update({ is_answer: !reply.is_answer })
      .eq('id', reply.id)

    if (error) toast.error('Failed to update answer')
    else {
      toast.success(reply.is_answer ? 'Unmarked as answer' : 'Marked as answer')
      setReplies(prev => prev.map(r => r.id === reply.id ? { ...r, is_answer: !r.is_answer } : r))
    }
  }

  async function handleDelete() {
    if (!deleteDialog) return

    if (deleteDialog.type === 'thread') {
      const { error } = await supabase.from('discussion_threads').delete().eq('id', deleteDialog.id)
      if (error) toast.error('Failed to delete thread')
      else {
        toast.success('Thread deleted')
        setActiveThread(null)
        fetchThreads()
      }
    } else {
      const { error } = await supabase.from('discussion_replies').delete().eq('id', deleteDialog.id)
      if (error) toast.error('Failed to delete reply')
      else {
        toast.success('Reply deleted')
        if (activeThread) {
          fetchReplies(activeThread.id)
          await supabase.from('discussion_threads')
            .update({ reply_count: Math.max(0, activeThread.reply_count - 1) })
            .eq('id', activeThread.id)
          setActiveThread(prev => prev ? { ...prev, reply_count: Math.max(0, prev.reply_count - 1) } : null)
        }
      }
    }
    setDeleteDialog(null)
  }

  async function toggleUpvoteThread(thread: ThreadWithAuthor) {
    if (!userId) return
    if (thread.has_upvoted) {
      await supabase.from('discussion_upvotes').delete().eq('user_id', userId).eq('thread_id', thread.id)
      setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, has_upvoted: false, upvote_count: t.upvote_count - 1 } : t))
      if (activeThread?.id === thread.id) setActiveThread(prev => prev ? { ...prev, has_upvoted: false, upvote_count: prev.upvote_count - 1 } : null)
      await supabase.from('discussion_threads').update({ upvote_count: thread.upvote_count - 1 }).eq('id', thread.id)
    } else {
      await supabase.from('discussion_upvotes').insert({ user_id: userId, thread_id: thread.id })
      setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, has_upvoted: true, upvote_count: t.upvote_count + 1 } : t))
      if (activeThread?.id === thread.id) setActiveThread(prev => prev ? { ...prev, has_upvoted: true, upvote_count: prev.upvote_count + 1 } : null)
      await supabase.from('discussion_threads').update({ upvote_count: thread.upvote_count + 1 }).eq('id', thread.id)
    }
  }

  async function toggleUpvoteReply(reply: ReplyWithAuthor) {
    if (!userId) return
    if (reply.has_upvoted) {
      await supabase.from('discussion_upvotes').delete().eq('user_id', userId).eq('reply_id', reply.id)
      setReplies(prev => prev.map(r => r.id === reply.id ? { ...r, has_upvoted: false, upvote_count: r.upvote_count - 1 } : r))
      await supabase.from('discussion_replies').update({ upvote_count: reply.upvote_count - 1 }).eq('id', reply.id)
    } else {
      await supabase.from('discussion_upvotes').insert({ user_id: userId, reply_id: reply.id })
      setReplies(prev => prev.map(r => r.id === reply.id ? { ...r, has_upvoted: true, upvote_count: r.upvote_count + 1 } : r))
      await supabase.from('discussion_replies').update({ upvote_count: reply.upvote_count + 1 }).eq('id', reply.id)
    }
  }

  function openThread(thread: ThreadWithAuthor) {
    setActiveThread(thread)
    setReplies([])
    setReplyContent('')
    fetchReplies(thread.id)
  }

  const filteredThreads = search.trim()
    ? threads.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.content.toLowerCase().includes(search.toLowerCase()) ||
        t.author_name.toLowerCase().includes(search.toLowerCase())
      )
    : threads

  // Thread detail view
  if (activeThread) {
    const topLevel = replies.filter(r => !r.parent_reply_id)

    return (
      <div className="space-y-4">
        <button
          onClick={() => { setActiveThread(null); fetchThreads() }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to discussions
        </button>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Avatar
                src={activeThread.author_avatar}
                fallback={activeThread.author_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">{activeThread.author_name}</span>
                  <RoleBadge role={activeThread.author_role} />
                  {activeThread.pinned && <Badge variant="warning" className="text-[10px] px-1.5 py-0"><Pin className="mr-0.5 h-2.5 w-2.5" />Pinned</Badge>}
                  {activeThread.locked && <Badge variant="secondary" className="text-[10px] px-1.5 py-0"><Lock className="mr-0.5 h-2.5 w-2.5" />Locked</Badge>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{timeAgo(activeThread.created_at)}</p>
                <h2 className="mt-3 text-lg font-bold text-gray-900">{activeThread.title}</h2>
                <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{activeThread.content}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => toggleUpvoteThread(activeThread)}
                    className={`flex items-center gap-1 text-sm transition-colors ${
                      activeThread.has_upvoted ? 'text-indigo-600 font-medium' : 'text-gray-500 hover:text-indigo-600'
                    }`}
                  >
                    <ArrowUp className="h-4 w-4" />{activeThread.upvote_count}
                  </button>
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    <MessageSquare className="h-4 w-4" />{activeThread.reply_count}
                  </span>

                  <span className="mx-1 text-gray-300">|</span>

                  {/* Moderation actions */}
                  <Button variant="ghost" size="sm" onClick={() => togglePin(activeThread)} className="h-7 text-xs">
                    {activeThread.pinned ? <><PinOff className="mr-1 h-3 w-3" />Unpin</> : <><Pin className="mr-1 h-3 w-3" />Pin</>}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleLock(activeThread)} className="h-7 text-xs">
                    {activeThread.locked ? <><Unlock className="mr-1 h-3 w-3" />Unlock</> : <><Lock className="mr-1 h-3 w-3" />Lock</>}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-500 hover:text-red-700"
                    onClick={() => setDeleteDialog({ type: 'thread', id: activeThread.id, name: activeThread.title })}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />Delete
                  </Button>
                  {activeThread.author_role === 'student' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 text-xs ${modIds.has(activeThread.author_id) ? 'text-amber-600' : ''}`}
                      onClick={() => toggleMod(activeThread.author_id, activeThread.author_name)}
                    >
                      {modIds.has(activeThread.author_id) ? <><ShieldOff className="mr-1 h-3 w-3" />Remove Mod</> : <><Shield className="mr-1 h-3 w-3" />Make Mod</>}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reply input */}
        {!activeThread.locked && (
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write a reply..."
                  rows={2}
                  className="flex-1"
                />
                <Button onClick={handleReply} disabled={!replyContent.trim() || replying} loading={replying} size="sm" className="self-end">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Replies */}
        {repliesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : topLevel.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500">No replies yet.</div>
        ) : (
          <div className="space-y-3">
            {topLevel.map(reply => (
              <Card key={reply.id} className={reply.is_answer ? 'border border-emerald-200/50' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={reply.author_avatar}
                      fallback={reply.author_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{reply.author_name}</span>
                        <RoleBadge role={reply.author_role} />
                        {reply.is_answer && <Badge variant="success" className="text-[10px] px-1.5 py-0"><CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />Answer</Badge>}
                        <span className="text-xs text-gray-400">{timeAgo(reply.created_at)}</span>
                      </div>
                      <p className="mt-1.5 text-sm text-gray-700 whitespace-pre-wrap">{reply.content}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => toggleUpvoteReply(reply)}
                          className={`flex items-center gap-1 text-xs transition-colors ${
                            reply.has_upvoted ? 'text-indigo-600 font-medium' : 'text-gray-400 hover:text-indigo-600'
                          }`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />{reply.upvote_count}
                        </button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => toggleAnswer(reply)}>
                          <CheckCircle2 className="mr-1 h-3 w-3" />{reply.is_answer ? 'Unmark' : 'Mark as Answer'}
                        </Button>
                        {reply.author_role === 'student' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-6 text-xs ${modIds.has(reply.author_id) ? 'text-amber-600' : 'text-gray-500'}`}
                            onClick={() => toggleMod(reply.author_id, reply.author_name)}
                          >
                            {modIds.has(reply.author_id) ? <><ShieldOff className="mr-1 h-3 w-3" />Remove Mod</> : <><Shield className="mr-1 h-3 w-3" />Make Mod</>}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-red-500 hover:text-red-700"
                          onClick={() => setDeleteDialog({ type: 'reply', id: reply.id, name: reply.content.slice(0, 30) })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Delete confirmation */}
        <Dialog
          open={!!deleteDialog}
          onClose={() => setDeleteDialog(null)}
          title={`Delete ${deleteDialog?.type === 'thread' ? 'Thread' : 'Reply'}`}
          description={`Are you sure you want to delete this ${deleteDialog?.type}? This action cannot be undone.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteDialog(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            {deleteDialog?.type === 'thread'
              ? 'All replies and upvotes will also be removed.'
              : 'This reply will be permanently removed.'}
          </p>
        </Dialog>
      </div>
    )
  }

  // Thread list view
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discussions</h1>
          <p className="mt-1 text-sm text-gray-500">Engage with students, moderate conversations, and share knowledge</p>
        </div>
        <Button onClick={() => setNewDialog(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          New Post
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Search discussions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : filteredThreads.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={search ? 'No matches found' : 'No discussions yet'}
          description={search ? 'Try a different search term.' : 'Start a conversation by creating a new post.'}
        />
      ) : (
        <div className="space-y-3">
          {filteredThreads.map(thread => (
            <Card
              key={thread.id}
              className="cursor-pointer transition-all duration-200 hover:bg-white/70"
              onClick={() => openThread(thread)}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center gap-0.5 pt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleUpvoteThread(thread) }}
                      className={`rounded-lg p-1 transition-colors ${
                        thread.has_upvoted ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50/30'
                      }`}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <span className={`text-xs font-medium ${thread.has_upvoted ? 'text-indigo-600' : 'text-gray-500'}`}>
                      {thread.upvote_count}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {thread.pinned && <Pin className="h-3.5 w-3.5 text-amber-500" />}
                      <h3 className="font-semibold text-gray-900 truncate">{thread.title}</h3>
                      {thread.locked && <Lock className="h-3 w-3 text-gray-400" />}
                    </div>
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">{thread.content}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Avatar src={thread.author_avatar} fallback={thread.author_name[0]} size="sm" />
                        {thread.author_name}
                        {thread.author_role !== 'student' && (
                          <span className="text-indigo-500 font-medium">
                            {thread.author_role === 'instructor' ? 'Teacher' : 'Admin'}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{thread.reply_count}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(thread.last_activity_at)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Thread Dialog */}
      <Dialog
        open={newDialog}
        onClose={() => setNewDialog(false)}
        title="Create a Post"
        description="Share a topic, resource, or start a discussion with your students"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewDialog(false)}>Cancel</Button>
            <Button onClick={handleNewThread} loading={posting} disabled={!newTitle.trim() || !newContent.trim()}>
              <Send className="mr-1 h-3.5 w-3.5" />Post
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Title" placeholder="Discussion topic" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <Textarea label="Content" placeholder="Write your post..." value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={5} />
        </div>
      </Dialog>
    </div>
  )
}
