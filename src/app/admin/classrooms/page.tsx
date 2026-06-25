'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Plus,
  Building2,
  Layers,
  Users,
  Edit,
  Power,
  Search,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import type { Classroom, Campus } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_FORM = {
  name: '',
  building: '',
  floor: '',
  capacity: '',
  campus_id: '',
}

type FormData = typeof EMPTY_FORM

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClassroomsPage() {
  const supabase = createClient()

  // Data state
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [loading, setLoading] = useState(true)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [formLoading, setFormLoading] = useState(false)

  // Toggle loading state per-id
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  const fetchClassrooms = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('classrooms')
        .select('*')
        .order('name')

      if (searchQuery.trim()) {
        query = query.ilike('name', `%${searchQuery.trim()}%`)
      }

      const { data, error } = await query

      if (error) throw error
      setClassrooms(data ?? [])
    } catch {
      toast.error('Failed to load classrooms')
    } finally {
      setLoading(false)
    }
  }, [searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCampuses = useCallback(async () => {
    const { data, error } = await supabase
      .from('campuses')
      .select('*')
      .eq('status', 'active')
      .order('name')
    if (!error && data) setCampuses(data)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCampuses()
  }, [fetchCampuses])

  useEffect(() => {
    fetchClassrooms()
  }, [fetchClassrooms])

  // ---------------------------------------------------------------------------
  // Dialog helpers
  // ---------------------------------------------------------------------------

  function openCreateDialog() {
    setEditingClassroom(null)
    setFormData({
      ...EMPTY_FORM,
      campus_id: campuses.length > 0 ? campuses[0].id : '',
    })
    setDialogOpen(true)
  }

  function openEditDialog(classroom: Classroom) {
    setEditingClassroom(classroom)
    setFormData({
      name: classroom.name,
      building: classroom.building ?? '',
      floor: classroom.floor ?? '',
      capacity: classroom.capacity?.toString() ?? '',
      campus_id: classroom.campus_id,
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditingClassroom(null)
    setFormData(EMPTY_FORM)
  }

  // ---------------------------------------------------------------------------
  // Create / Update
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true)

    const payload = {
      name: formData.name,
      building: formData.building || null,
      floor: formData.floor || null,
      capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
      campus_id: formData.campus_id,
    }

    try {
      if (editingClassroom) {
        const { error } = await supabase
          .from('classrooms')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingClassroom.id)

        if (error) throw error
        toast.success('Classroom updated successfully')
      } else {
        const { error } = await supabase
          .from('classrooms')
          .insert({ ...payload, status: 'active' })

        if (error) throw error
        toast.success('Classroom created successfully')
      }

      closeDialog()
      fetchClassrooms()
    } catch {
      toast.error(
        editingClassroom
          ? 'Failed to update classroom'
          : 'Failed to create classroom'
      )
    } finally {
      setFormLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Toggle status
  // ---------------------------------------------------------------------------

  async function toggleStatus(classroom: Classroom) {
    setTogglingIds((prev) => new Set(prev).add(classroom.id))

    const newStatus = classroom.status === 'active' ? 'inactive' : 'active'

    try {
      const { error } = await supabase
        .from('classrooms')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', classroom.id)

      if (error) throw error

      toast.success(
        `Classroom ${classroom.status === 'active' ? 'deactivated' : 'activated'} successfully`
      )
      fetchClassrooms()
    } catch {
      toast.error('Failed to update classroom status')
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev)
        next.delete(classroom.id)
        return next
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Classrooms</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage classrooms and their availability
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Add Classroom
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search classrooms by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} shape="rect" height={220} />
          ))}
        </div>
      ) : classrooms.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No classrooms found"
          description={
            searchQuery
              ? 'No classrooms match your search. Try adjusting your search terms.'
              : 'Add your first classroom to start managing spaces.'
          }
          action={
            !searchQuery ? (
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                Add Classroom
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classrooms.map((classroom) => (
            <Card key={classroom.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate">{classroom.name}</CardTitle>
                  </div>
                  <Badge variant={classroom.status === 'active' ? 'success' : 'secondary'}>
                    {classroom.status === 'active' ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {classroom.building && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="truncate">{classroom.building}</span>
                    </div>
                  )}
                  {classroom.floor && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Layers className="h-4 w-4 shrink-0 text-gray-400" />
                      <span>Floor {classroom.floor}</span>
                    </div>
                  )}
                  {classroom.capacity != null && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="h-4 w-4 shrink-0 text-gray-400" />
                      <span>Capacity: {classroom.capacity}</span>
                    </div>
                  )}
                  {!classroom.building && !classroom.floor && classroom.capacity == null && (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>No location details</span>
                    </div>
                  )}

                  {/* Reference images placeholder */}
                  <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-xs text-gray-400">
                      Reference images coming soon
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(classroom)}
                >
                  <Edit className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant={classroom.status === 'active' ? 'secondary' : 'default'}
                  size="sm"
                  loading={togglingIds.has(classroom.id)}
                  onClick={() => toggleStatus(classroom)}
                >
                  <Power className="h-3.5 w-3.5" />
                  {classroom.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title={editingClassroom ? 'Edit Classroom' : 'Add Classroom'}
        description={
          editingClassroom
            ? 'Update the classroom details below.'
            : 'Fill in the details to add a new classroom.'
        }
        footer={
          <>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="classroom-form"
              loading={formLoading}
            >
              {editingClassroom ? 'Save Changes' : 'Add Classroom'}
            </Button>
          </>
        }
      >
        <form
          id="classroom-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <Input
            label="Name"
            placeholder="e.g. Lab 301"
            required
            value={formData.name}
            onChange={(e) =>
              setFormData((f) => ({ ...f, name: e.target.value }))
            }
          />
          <Input
            label="Building"
            placeholder="e.g. Science Block"
            value={formData.building}
            onChange={(e) =>
              setFormData((f) => ({ ...f, building: e.target.value }))
            }
          />
          <Input
            label="Floor"
            placeholder="e.g. 3rd"
            value={formData.floor}
            onChange={(e) =>
              setFormData((f) => ({ ...f, floor: e.target.value }))
            }
          />
          <Input
            label="Capacity"
            type="number"
            placeholder="e.g. 40"
            min={1}
            value={formData.capacity}
            onChange={(e) =>
              setFormData((f) => ({ ...f, capacity: e.target.value }))
            }
          />
          <Select
            label="Campus"
            placeholder="Select a campus"
            required
            value={formData.campus_id}
            onChange={(e) =>
              setFormData((f) => ({ ...f, campus_id: e.target.value }))
            }
          >
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </form>
      </Dialog>
    </div>
  )
}
