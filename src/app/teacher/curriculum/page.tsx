'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Upload,
  FileText,
  Trash2,
  Pencil,
  Download,
  BookOpen,
  Users,
  Eye,
  CheckCircle2,
  Plus,
} from 'lucide-react'
import type { Batch } from '@/types/database'

interface CourseMaterial {
  id: string
  batch_id: string
  title: string
  description: string | null
  file_url: string
  storage_path: string
  file_name: string
  file_type: string
  file_size: number
  sort_order: number
  uploaded_by: string
  created_at: string
  updated_at: string
}

interface MaterialProgress {
  material_id: string
  status: string
  count: number
}

const ACCEPTED_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx'
const MAX_FILE_SIZE = 50 * 1024 * 1024

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TeacherCurriculumPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedBatch, setSelectedBatch] = useState('')
  const [materials, setMaterials] = useState<CourseMaterial[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, { viewed: number; completed: number }>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<CourseMaterial | null>(null)
  const [editForm, setEditForm] = useState({ title: '', description: '' })
  const [saving, setSaving] = useState(false)

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addForm, setAddForm] = useState({ title: '', description: '' })
  const [addSaving, setAddSaving] = useState(false)

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingMaterial, setDeletingMaterial] = useState<CourseMaterial | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchBatches = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('batches')
      .select('*')
      .eq('status', 'active')
      .order('name')

    const batchList = (data as Batch[]) ?? []
    setBatches(batchList)

    if (batchList.length > 0 && !selectedBatch) {
      setSelectedBatch(batchList[0].id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMaterials = useCallback(async () => {
    if (!selectedBatch) {
      setMaterials([])
      setProgressMap({})
      setLoading(false)
      return
    }

    setLoading(true)

    const { data } = await supabase
      .from('course_materials')
      .select('*')
      .eq('batch_id', selectedBatch)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    const materialList = (data as CourseMaterial[]) ?? []
    setMaterials(materialList)

    if (materialList.length > 0) {
      const materialIds = materialList.map(m => m.id)
      const { data: progressData } = await supabase
        .from('material_progress')
        .select('material_id, status')
        .in('material_id', materialIds)

      const map: Record<string, { viewed: number; completed: number }> = {}
      for (const m of materialList) {
        map[m.id] = { viewed: 0, completed: 0 }
      }
      if (progressData) {
        for (const row of progressData as { material_id: string; status: string }[]) {
          if (!map[row.material_id]) map[row.material_id] = { viewed: 0, completed: 0 }
          if (row.status === 'viewed') map[row.material_id].viewed++
          if (row.status === 'completed') map[row.material_id].completed++
        }
      }
      setProgressMap(map)
    } else {
      setProgressMap({})
    }

    setLoading(false)
  }, [selectedBatch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchBatches() }, [fetchBatches])
  useEffect(() => { fetchMaterials() }, [fetchMaterials])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size exceeds 50MB limit')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (!selectedBatch) {
      toast.error('Please select a batch first')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('You must be logged in')
      return
    }

    setUploading(true)
    setUploadProgress(10)

    const timestamp = Date.now()
    const storagePath = `course-materials/${selectedBatch}/${timestamp}-${file.name}`

    setUploadProgress(30)
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, file)

    if (uploadError) {
      toast.error(`Failed to upload file: ${uploadError.message}`)
      setUploading(false)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploadProgress(70)

    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(storagePath)

    const titleFromName = file.name.replace(/\.[^/.]+$/, '')

    const maxSortOrder = materials.length > 0
      ? Math.max(...materials.map(m => m.sort_order)) + 1
      : 0

    const { error: insertError } = await supabase
      .from('course_materials')
      .insert({
        batch_id: selectedBatch,
        title: titleFromName,
        description: null,
        file_url: publicUrl,
        storage_path: storagePath,
        file_name: file.name,
        file_type: file.type || file.name.split('.').pop() || 'unknown',
        file_size: file.size,
        sort_order: maxSortOrder,
        uploaded_by: user.id,
      })

    setUploadProgress(100)

    if (insertError) {
      toast.error(`Failed to save material: ${insertError.message}`)
      await supabase.storage.from('uploads').remove([storagePath])
    } else {
      toast.success('Material uploaded successfully')
      fetchMaterials()
    }

    setUploading(false)
    setUploadProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleManualAdd() {
    if (!addForm.title.trim()) {
      toast.error('Title is required')
      return
    }

    if (!selectedBatch) {
      toast.error('Please select a batch first')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('You must be logged in')
      return
    }

    setAddSaving(true)

    const maxSortOrder = materials.length > 0
      ? Math.max(...materials.map(m => m.sort_order)) + 1
      : 0

    const { error } = await supabase
      .from('course_materials')
      .insert({
        batch_id: selectedBatch,
        title: addForm.title.trim(),
        description: addForm.description.trim() || null,
        file_url: '',
        storage_path: '',
        file_name: '',
        file_type: 'topic',
        file_size: 0,
        sort_order: maxSortOrder,
        uploaded_by: user.id,
      })

    if (error) {
      toast.error(`Failed to add material: ${error.message}`)
    } else {
      toast.success('Material added successfully')
      setShowAddDialog(false)
      setAddForm({ title: '', description: '' })
      fetchMaterials()
    }
    setAddSaving(false)
  }

  function openEditDialog(material: CourseMaterial) {
    setEditingMaterial(material)
    setEditForm({
      title: material.title,
      description: material.description ?? '',
    })
    setShowEditDialog(true)
  }

  async function handleEditSave() {
    if (!editingMaterial || !editForm.title.trim()) {
      toast.error('Title is required')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('course_materials')
      .update({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
      })
      .eq('id', editingMaterial.id)

    if (error) {
      toast.error('Failed to update material')
    } else {
      toast.success('Material updated')
      setShowEditDialog(false)
      setEditingMaterial(null)
      fetchMaterials()
    }
    setSaving(false)
  }

  function openDeleteDialog(material: CourseMaterial) {
    setDeletingMaterial(material)
    setShowDeleteDialog(true)
  }

  async function handleDelete() {
    if (!deletingMaterial) return

    setDeleting(true)

    const { error: dbError } = await supabase
      .from('course_materials')
      .delete()
      .eq('id', deletingMaterial.id)

    if (dbError) {
      toast.error('Failed to delete material record')
    } else {
      await supabase.storage
        .from('uploads')
        .remove([deletingMaterial.storage_path])

      toast.success('Material deleted')
      setShowDeleteDialog(false)
      setDeletingMaterial(null)
      fetchMaterials()
    }
    setDeleting(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Curriculum</h1>
          <p className="mt-1 text-sm text-gray-500">Upload and manage course materials for your batches</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Select
            label="Select Batch"
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
          >
            <option value="">Choose a batch</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAddDialog(true)}
            disabled={!selectedBatch}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Topic
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading || !selectedBatch}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !selectedBatch}
            loading={uploading}
            className="w-full sm:w-auto"
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Material
          </Button>
        </div>
      </div>

      {uploading && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 font-medium">Uploading...</span>
                  <span className="text-gray-500">{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200/60">
                  <div
                    className="h-2 rounded-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : !selectedBatch ? (
        <EmptyState
          icon={BookOpen}
          title="Select a batch"
          description="Choose a batch from the dropdown above to manage its curriculum materials."
        />
      ) : materials.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No materials yet"
          description="Upload your first course material to get started."
          action={
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Material
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="hidden sm:table-cell">File</TableHead>
              <TableHead className="hidden md:table-cell">Uploaded</TableHead>
              <TableHead className="hidden lg:table-cell">Student Progress</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.map((m) => {
              const progress = progressMap[m.id] ?? { viewed: 0, completed: 0 }
              const totalEngaged = progress.viewed + progress.completed

              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{m.title}</p>
                      {m.description && (
                        <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">{m.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {m.file_name ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="truncate max-w-[150px]">{m.file_name}</span>
                        <Badge variant="secondary">{formatFileSize(m.file_size)}</Badge>
                      </div>
                    ) : (
                      <Badge variant="secondary">Topic</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-gray-500">
                      {new Date(m.created_at).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-gray-500">
                        <Eye className="h-3.5 w-3.5" />
                        {progress.viewed} viewed
                      </span>
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {progress.completed} completed
                      </span>
                      {totalEngaged > 0 && (
                        <Badge variant="secondary">
                          <Users className="mr-1 h-3 w-3" />
                          {totalEngaged}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {m.file_url && (
                        <a href={m.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(m)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openDeleteDialog(m)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        title="Add Topic"
        description="Add a curriculum topic or material entry manually."
      >
        <div className="space-y-4">
          <Input
            label="Title *"
            value={addForm.title}
            onChange={(e) => setAddForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Introduction to Machine Learning"
          />
          <Textarea
            label="Description"
            value={addForm.description}
            onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Topic description, learning objectives, or notes"
            rows={3}
          />
          <Button onClick={handleManualAdd} loading={addSaving} className="w-full">
            Add Topic
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={showEditDialog}
        onClose={() => setShowEditDialog(false)}
        title="Edit Material"
        description="Update the title and description for this material."
      >
        <div className="space-y-4">
          <Input
            label="Title *"
            value={editForm.title}
            onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Material title"
          />
          <Textarea
            label="Description"
            value={editForm.description}
            onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional description of the material"
            rows={3}
          />
          <Button onClick={handleEditSave} loading={saving} className="w-full">
            Save Changes
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title="Delete Material"
        description={`Are you sure you want to delete "${deletingMaterial?.title}"? This will also remove the file from storage. This action cannot be undone.`}
      >
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setShowDeleteDialog(false)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            loading={deleting}
            className="flex-1"
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
