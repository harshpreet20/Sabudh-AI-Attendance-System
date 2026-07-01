'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Plus,
  Trash2,
  Edit3,
  FileText,
  Bot,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  Upload,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

interface KnowledgeDoc {
  id: string
  title: string
  content: string
  category: string
  source: string
  source_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const CATEGORIES = ['general', 'platform', 'auth', 'attendance', 'assignments', 'projects', 'discussions', 'faq', 'policy', 'activity']

export default function KnowledgeBasePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showDialog, setShowDialog] = useState(false)
  const [editDoc, setEditDoc] = useState<KnowledgeDoc | null>(null)
  const [showMarkdownDialog, setShowMarkdownDialog] = useState(false)
  const [markdownText, setMarkdownText] = useState('')
  const [markdownTitle, setMarkdownTitle] = useState('')
  const [markdownCategory, setMarkdownCategory] = useState('general')
  const [saving, setSaving] = useState(false)
  const [scraping, setScraping] = useState(false)

  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState('general')

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/chatbot/knowledge')
      const data = await res.json()
      if (res.ok) {
        setDocs(data.documents || [])
      }
    } catch {
      toast.error('Failed to load knowledge base')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDocs()
  }, [fetchDocs])

  async function handleSave() {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error('Title and content are required')
      return
    }

    setSaving(true)
    try {
      const method = editDoc ? 'PUT' : 'POST'
      const body = editDoc
        ? { id: editDoc.id, title: formTitle, content: formContent, category: formCategory }
        : { title: formTitle, content: formContent, category: formCategory }

      const res = await fetch('/api/chatbot/knowledge', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        toast.success(editDoc ? 'Document updated' : 'Document added')
        setShowDialog(false)
        resetForm()
        fetchDocs()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save')
      }
    } catch {
      toast.error('Failed to save document')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this document?')) return

    try {
      const res = await fetch('/api/chatbot/knowledge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      if (res.ok) {
        toast.success('Document deleted')
        fetchDocs()
      }
    } catch {
      toast.error('Failed to delete')
    }
  }

  async function handleToggleActive(doc: KnowledgeDoc) {
    try {
      const res = await fetch('/api/chatbot/knowledge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, is_active: !doc.is_active }),
      })

      if (res.ok) {
        toast.success(doc.is_active ? 'Document disabled' : 'Document enabled')
        fetchDocs()
      }
    } catch {
      toast.error('Failed to update')
    }
  }

  async function handleScrapeNow() {
    setScraping(true)
    try {
      const res = await fetch('/api/cron/scrape')
      const data = await res.json()
      if (res.ok) {
        toast.success(`Scrape complete: ${data.results?.length || 0} pages processed`)
        fetchDocs()
      } else {
        toast.error('Scrape failed')
      }
    } catch {
      toast.error('Scrape failed')
    } finally {
      setScraping(false)
    }
  }

  async function handleMarkdownUpload() {
    if (!markdownTitle.trim() || !markdownText.trim()) {
      toast.error('Title and markdown content are required')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/chatbot/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: markdownTitle,
          content: markdownText,
          category: markdownCategory,
          source: 'markdown',
        }),
      })

      if (res.ok) {
        toast.success('Markdown document added')
        setShowMarkdownDialog(false)
        setMarkdownText('')
        setMarkdownTitle('')
        setMarkdownCategory('general')
        fetchDocs()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save')
      }
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setFormTitle('')
    setFormContent('')
    setFormCategory('general')
    setEditDoc(null)
  }

  function openEdit(doc: KnowledgeDoc) {
    setEditDoc(doc)
    setFormTitle(doc.title)
    setFormContent(doc.content)
    setFormCategory(doc.category)
    setShowDialog(true)
  }

  function openAdd() {
    resetForm()
    setShowDialog(true)
  }

  const filtered = docs.filter(d => {
    const matchSearch = search === '' ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.content.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'all' || d.category === categoryFilter
    return matchSearch && matchCat
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">AI Chatbot Knowledge Base</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage documents that power the AI assistant. Add markdown, scrape pages, or create entries manually.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleScrapeNow} disabled={scraping}>
            {scraping ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Scrape Now
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowMarkdownDialog(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            Upload Markdown
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Document
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full rounded-xl border border-gray-200 bg-white/60 py-2 pl-9 pr-4 text-sm backdrop-blur-sm focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white/60 px-3 py-2 text-sm backdrop-blur-sm focus:border-indigo-300 focus:outline-none"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Documents list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No documents found"
          description="Add documents to teach the AI assistant about your platform and content."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(doc => (
            <div
              key={doc.id}
              className={`glass rounded-xl p-4 transition-all ${!doc.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-indigo-500" />
                    <h3 className="truncate text-sm font-semibold text-gray-900">{doc.title}</h3>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{doc.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-indigo-100/60 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {doc.category}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {doc.source}
                    </span>
                    {doc.source_url && (
                      <span className="truncate text-xs text-gray-400">{doc.source_url}</span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(doc.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => handleToggleActive(doc)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-white/60 hover:text-gray-600"
                    title={doc.is_active ? 'Disable' : 'Enable'}
                  >
                    {doc.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(doc)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-white/60 hover:text-gray-600"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-white/60 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog
        open={showDialog}
        onClose={() => { setShowDialog(false); resetForm() }}
        title={editDoc ? 'Edit Document' : 'Add Document'}
        description="This content will be used by the AI assistant to answer questions."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setShowDialog(false); resetForm() }}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {editDoc ? 'Update' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white/60 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              placeholder="e.g. How to mark attendance"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select
              value={formCategory}
              onChange={e => setFormCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white/60 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Content</label>
            <textarea
              value={formContent}
              onChange={e => setFormContent(e.target.value)}
              rows={8}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white/60 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              placeholder="Enter the knowledge content..."
            />
          </div>
        </div>
      </Dialog>

      {/* Markdown Upload Dialog */}
      <Dialog
        open={showMarkdownDialog}
        onClose={() => setShowMarkdownDialog(false)}
        title="Upload Markdown Content"
        description="Paste markdown-formatted content to add to the AI knowledge base."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowMarkdownDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={handleMarkdownUpload} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={markdownTitle}
              onChange={e => setMarkdownTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white/60 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              placeholder="Document title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select
              value={markdownCategory}
              onChange={e => setMarkdownCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white/60 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Markdown Content</label>
            <textarea
              value={markdownText}
              onChange={e => setMarkdownText(e.target.value)}
              rows={12}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white/60 px-3 py-2 text-sm font-mono focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              placeholder="# Heading&#10;&#10;Your markdown content here..."
            />
          </div>
        </div>
      </Dialog>
    </div>
  )
}
