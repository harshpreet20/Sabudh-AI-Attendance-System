'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BookOpen,
  FileText,
  File,
  Eye,
  CheckCircle,
  Clock,
  Circle,
  Search,
  BarChart3,
} from 'lucide-react'

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
  id: string
  material_id: string
  student_id: string
  status: 'not_started' | 'in_progress' | 'completed'
  last_viewed_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

type MaterialWithProgress = CourseMaterial & { progress?: MaterialProgress }

const STATUS_CONFIG = {
  not_started: { label: 'Not Started', variant: 'secondary' as const, icon: Circle },
  in_progress: { label: 'In Progress', variant: 'default' as const, icon: Clock },
  completed: { label: 'Completed', variant: 'success' as const, icon: CheckCircle },
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(fileType: string) {
  if (fileType === 'application/pdf' || fileType.endsWith('.pdf')) return FileText
  return File
}

export default function StudentCurriculumPage() {
  const supabase = createClient()
  const [materials, setMaterials] = useState<MaterialWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [noBatch, setNoBatch] = useState(false)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('id, batch_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile?.batch_id) {
      setNoBatch(true)
      setLoading(false)
      return
    }

    setStudentId(profile.id)

    const { data: materialsData } = await supabase
      .from('course_materials')
      .select('*')
      .eq('batch_id', profile.batch_id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    const materialList = (materialsData as CourseMaterial[]) ?? []

    const { data: progressData } = await supabase
      .from('material_progress')
      .select('*')
      .eq('student_id', profile.id)

    const progressMap = new Map<string, MaterialProgress>()
    if (progressData) {
      for (const p of progressData as MaterialProgress[]) {
        progressMap.set(p.material_id, p)
      }
    }

    setMaterials(
      materialList.map((m) => ({
        ...m,
        progress: progressMap.get(m.id),
      }))
    )
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  async function upsertProgress(
    materialId: string,
    status: 'in_progress' | 'completed',
  ) {
    if (!studentId) return

    const now = new Date().toISOString()
    const payload: Record<string, unknown> = {
      material_id: materialId,
      student_id: studentId,
      status,
      last_viewed_at: now,
      updated_at: now,
    }
    if (status === 'completed') payload.completed_at = now

    const existing = materials.find((m) => m.id === materialId)?.progress

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        status,
        last_viewed_at: now,
        updated_at: now,
      }
      if (status === 'completed') updatePayload.completed_at = now
      if (status === 'in_progress') updatePayload.completed_at = null

      const { error } = await supabase
        .from('material_progress')
        .update(updatePayload)
        .eq('id', existing.id)

      if (error) {
        toast.error('Failed to update progress')
        return false
      }
    } else {
      const { error } = await supabase
        .from('material_progress')
        .insert(payload)

      if (error) {
        toast.error('Failed to update progress')
        return false
      }
    }

    return true
  }

  async function handleViewDownload(material: MaterialWithProgress) {
    window.open(material.file_url, '_blank', 'noopener,noreferrer')

    const currentStatus = material.progress?.status ?? 'not_started'
    if (currentStatus === 'not_started') {
      const ok = await upsertProgress(material.id, 'in_progress')
      if (ok) {
        setMaterials((prev) =>
          prev.map((m) =>
            m.id === material.id
              ? {
                  ...m,
                  progress: {
                    ...(m.progress as MaterialProgress),
                    id: m.progress?.id ?? '',
                    material_id: m.id,
                    student_id: studentId!,
                    status: 'in_progress' as const,
                    last_viewed_at: new Date().toISOString(),
                    completed_at: null,
                    created_at: m.progress?.created_at ?? new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                }
              : m
          )
        )
      }
    }
  }

  async function handleToggleComplete(material: MaterialWithProgress) {
    const currentStatus = material.progress?.status ?? 'not_started'
    const newStatus = currentStatus === 'completed' ? 'in_progress' : 'completed'

    setTogglingId(material.id)
    const ok = await upsertProgress(material.id, newStatus)
    if (ok) {
      const now = new Date().toISOString()
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === material.id
            ? {
                ...m,
                progress: {
                  ...(m.progress as MaterialProgress),
                  id: m.progress?.id ?? '',
                  material_id: m.id,
                  student_id: studentId!,
                  status: newStatus,
                  last_viewed_at: now,
                  completed_at: newStatus === 'completed' ? now : null,
                  created_at: m.progress?.created_at ?? now,
                  updated_at: now,
                },
              }
            : m
        )
      )
      toast.success(newStatus === 'completed' ? 'Marked as completed' : 'Marked as in progress')
    }
    setTogglingId(null)
  }

  const filteredMaterials = materials.filter((m) =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const completedCount = materials.filter((m) => m.progress?.status === 'completed').length
  const totalCount = materials.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  if (noBatch) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Curriculum</h1>
          <p className="mt-1 text-sm text-gray-500">Course materials and learning resources</p>
        </div>
        <EmptyState
          icon={BookOpen}
          title="No batch assigned"
          description="You haven't been assigned to a batch yet. Please contact your instructor."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Curriculum</h1>
        <p className="mt-1 text-sm text-gray-500">Course materials and learning resources</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28" />
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : materials.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No materials yet"
          description="Your instructor hasn't uploaded any curriculum materials for your batch yet."
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-indigo-100/80 p-2.5">
                    <BarChart3 className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Overall Progress</p>
                    <p className="text-sm text-gray-500">
                      {completedCount} of {totalCount} materials completed
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-40 rounded-full bg-gray-100/80 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500/90 transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 tabular-nums">
                    {progressPercent}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search materials..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {filteredMaterials.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No results"
              description="No materials match your search. Try a different keyword."
            />
          ) : (
            <div className="space-y-3">
              {filteredMaterials.map((material) => {
                const status = material.progress?.status ?? 'not_started'
                const config = STATUS_CONFIG[status]
                const StatusIcon = config.icon
                const FileIcon = getFileIcon(material.file_type)

                return (
                  <Card key={material.id}>
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex gap-3 min-w-0 flex-1">
                          <div className="mt-0.5 flex-shrink-0 rounded-lg bg-white/50 p-2">
                            <FileIcon className="h-5 w-5 text-gray-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-gray-900">{material.title}</p>
                              <Badge variant={config.variant}>
                                <StatusIcon className="mr-1 h-3 w-3" />
                                {config.label}
                              </Badge>
                            </div>
                            {material.description && (
                              <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                                {material.description}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                              <span>{formatFileSize(material.file_size)}</span>
                              <span>
                                Uploaded{' '}
                                {new Date(material.created_at).toLocaleDateString('en-IN', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 sm:flex-col sm:items-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDownload(material)}
                            className="flex-1 sm:flex-none"
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant={status === 'completed' ? 'secondary' : 'default'}
                            onClick={() => handleToggleComplete(material)}
                            loading={togglingId === material.id}
                            className="flex-1 sm:flex-none"
                          >
                            {status === 'completed' ? (
                              <>
                                <Clock className="mr-1 h-3.5 w-3.5" />
                                Mark In Progress
                              </>
                            ) : (
                              <>
                                <CheckCircle className="mr-1 h-3.5 w-3.5" />
                                Mark Complete
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
