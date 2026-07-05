'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Plus,
  MapPin,
  Edit,
  Trash2,
  Power,
  Link as LinkIcon,
  Navigation,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { extractCoordinatesFromText } from '@/lib/geofence'
import type { Campus } from '@/types/database'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

const EMPTY_FORM = {
  name: '',
  address: '',
  city: '',
  locationLink: '',
  latitude: '',
  longitude: '',
  geofence_radius_meters: '500',
}

type FormData = typeof EMPTY_FORM

export default function CampusesPage() {
  const supabase = createClient()

  const [campuses, setCampuses] = useState<Campus[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [formLoading, setFormLoading] = useState(false)
  const [coordsParsed, setCoordsParsed] = useState(false)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingCampus, setDeletingCampus] = useState<Campus | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())

  const fetchCampuses = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('campuses')
      .select('*')
      .order('name')

    if (error) {
      toast.error('Failed to load campuses')
    } else {
      setCampuses((data as Campus[]) ?? [])
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCampuses() }, [fetchCampuses])

  function handleLinkPaste(value: string) {
    setFormData(f => ({ ...f, locationLink: value }))
    const coords = extractCoordinatesFromText(value)
    if (coords) {
      setFormData(f => ({
        ...f,
        latitude: coords.lat.toFixed(6),
        longitude: coords.lng.toFixed(6),
      }))
      setCoordsParsed(true)
    } else {
      setCoordsParsed(false)
    }
  }

  function openCreateDialog() {
    setEditingCampus(null)
    setFormData(EMPTY_FORM)
    setCoordsParsed(false)
    setDialogOpen(true)
  }

  function openEditDialog(campus: Campus) {
    setEditingCampus(campus)
    setFormData({
      name: campus.name,
      address: campus.address ?? '',
      city: campus.city ?? '',
      locationLink: '',
      latitude: campus.latitude?.toString() ?? '',
      longitude: campus.longitude?.toString() ?? '',
      geofence_radius_meters: campus.geofence_radius_meters?.toString() ?? '500',
    })
    setCoordsParsed(campus.latitude != null && campus.longitude != null)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Campus name is required')
      return
    }

    const lat = formData.latitude ? parseFloat(formData.latitude) : null
    const lng = formData.longitude ? parseFloat(formData.longitude) : null
    const radius = parseInt(formData.geofence_radius_meters) || 500

    if ((lat != null && (lat < -90 || lat > 90)) || (lng != null && (lng < -180 || lng > 180))) {
      toast.error('Invalid coordinates')
      return
    }

    setFormLoading(true)

    const payload = {
      name: formData.name.trim(),
      address: formData.address.trim() || null,
      city: formData.city.trim() || null,
      latitude: lat,
      longitude: lng,
      geofence_radius_meters: radius,
      ...(editingCampus ? {} : { organization_id: ORG_ID, status: 'active' }),
    }

    const { error } = editingCampus
      ? await supabase.from('campuses').update(payload).eq('id', editingCampus.id)
      : await supabase.from('campuses').insert(payload)

    if (error) {
      toast.error(`Failed to ${editingCampus ? 'update' : 'create'} campus`)
    } else {
      toast.success(`Campus ${editingCampus ? 'updated' : 'created'}`)
      setDialogOpen(false)
      fetchCampuses()
    }
    setFormLoading(false)
  }

  async function handleToggleStatus(campus: Campus) {
    setTogglingIds(prev => new Set(prev).add(campus.id))
    const newStatus = campus.status === 'active' ? 'inactive' : 'active'

    const { error } = await supabase
      .from('campuses')
      .update({ status: newStatus })
      .eq('id', campus.id)

    if (error) {
      toast.error('Failed to update status')
    } else {
      toast.success(`Campus ${newStatus === 'active' ? 'activated' : 'deactivated'}`)
      fetchCampuses()
    }
    setTogglingIds(prev => {
      const next = new Set(prev)
      next.delete(campus.id)
      return next
    })
  }

  async function handleDelete() {
    if (!deletingCampus) return
    setDeleteLoading(true)

    const { error } = await supabase
      .from('campuses')
      .delete()
      .eq('id', deletingCampus.id)

    if (error) {
      toast.error(error.message || 'Failed to delete campus.')
    } else {
      toast.success('Campus deleted')
      setDeleteDialogOpen(false)
      setDeletingCampus(null)
      fetchCampuses()
    }
    setDeleteLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campuses</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage campus locations for geo-verified attendance. Paste a Google Maps or WhatsApp location link to auto-extract coordinates.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Add Campus
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : campuses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No campuses yet"
          description="Add your first campus location to enable geo-verified attendance."
          action={
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              Add Campus
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campuses.map(campus => (
            <Card key={campus.id} className={campus.status === 'inactive' ? 'opacity-60' : ''}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${campus.latitude != null ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{campus.name}</h3>
                      <Badge variant={campus.status === 'active' ? 'success' : 'secondary'}>
                        {campus.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {campus.address && (
                  <p className="mt-3 text-sm text-gray-500 line-clamp-2">{campus.address}</p>
                )}

                {campus.city && (
                  <p className="mt-1 text-xs text-gray-400">{campus.city}</p>
                )}

                {campus.latitude != null && campus.longitude != null ? (
                  <div className="mt-3 rounded-lg bg-green-50 p-2.5">
                    <div className="flex items-center gap-2 text-xs text-green-700">
                      <Navigation className="h-3.5 w-3.5" />
                      <span className="font-mono">
                        {campus.latitude.toFixed(6)}, {campus.longitude.toFixed(6)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Geofence: {campus.geofence_radius_meters}m radius</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg bg-amber-50 p-2.5">
                    <div className="flex items-center gap-2 text-xs text-amber-700">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>No coordinates — geo-attendance disabled</span>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(campus)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleStatus(campus)}
                    disabled={togglingIds.has(campus.id)}
                  >
                    <Power className={`h-4 w-4 ${campus.status === 'active' ? 'text-green-500' : 'text-gray-400'}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setDeletingCampus(campus); setDeleteDialogOpen(true) }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                  {campus.latitude != null && campus.longitude != null && (
                    <a
                      href={`https://www.google.com/maps?q=${campus.latitude},${campus.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto"
                    >
                      <Button variant="ghost" size="sm">
                        <LinkIcon className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingCampus ? 'Edit Campus' : 'Add Campus'}
        description="Define a campus location for geo-verified attendance. Paste a Google Maps, WhatsApp, or Apple Maps link to auto-extract coordinates."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Campus Name *"
            value={formData.name}
            onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. GK Duggal Memorial Centre"
          />
          <Input
            label="Address"
            value={formData.address}
            onChange={e => setFormData(f => ({ ...f, address: e.target.value }))}
            placeholder="e.g. Rajouri Garden, New Delhi"
          />
          <Input
            label="City"
            value={formData.city}
            onChange={e => setFormData(f => ({ ...f, city: e.target.value }))}
            placeholder="e.g. New Delhi"
          />

          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-800 mb-2">
              <LinkIcon className="h-4 w-4" />
              Paste Location Link
            </div>
            <Input
              value={formData.locationLink}
              onChange={e => handleLinkPaste(e.target.value)}
              placeholder="Paste Google Maps / WhatsApp / Apple Maps link or coordinates..."
            />
            {formData.locationLink && (
              <p className={`mt-1.5 text-xs ${coordsParsed ? 'text-green-600' : 'text-amber-600'}`}>
                {coordsParsed
                  ? `Extracted: ${formData.latitude}, ${formData.longitude}`
                  : 'Could not extract coordinates. Enter them manually below.'}
              </p>
            )}
            <p className="mt-1 text-xs text-indigo-600">
              Supports: Google Maps links, WhatsApp shared locations, Apple Maps links, or raw &quot;lat, lng&quot; coordinates
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Latitude"
              type="number"
              step="any"
              value={formData.latitude}
              onChange={e => { setFormData(f => ({ ...f, latitude: e.target.value })); setCoordsParsed(!!e.target.value && !!formData.longitude) }}
              placeholder="28.6468"
            />
            <Input
              label="Longitude"
              type="number"
              step="any"
              value={formData.longitude}
              onChange={e => { setFormData(f => ({ ...f, longitude: e.target.value })); setCoordsParsed(!!formData.latitude && !!e.target.value) }}
              placeholder="77.1228"
            />
          </div>

          <Input
            label="Geofence Radius (meters)"
            type="number"
            min="50"
            max="5000"
            value={formData.geofence_radius_meters}
            onChange={e => setFormData(f => ({ ...f, geofence_radius_meters: e.target.value }))}
            placeholder="500"
          />

          {formData.latitude && formData.longitude && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>Students within <strong>{formData.geofence_radius_meters || 500}m</strong> of this location can mark attendance.</span>
              </div>
              <a
                href={`https://www.google.com/maps?q=${formData.latitude},${formData.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center gap-1 text-xs text-green-600 hover:underline"
              >
                <LinkIcon className="h-3 w-3" />
                Verify on Google Maps
              </a>
            </div>
          )}

          <Button type="submit" loading={formLoading} className="w-full">
            {editingCampus ? 'Save Changes' : 'Add Campus'}
          </Button>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => { setDeleteDialogOpen(false); setDeletingCampus(null) }}
        title="Delete Campus"
        description={`Are you sure you want to delete "${deletingCampus?.name}"? Classrooms linked to this campus will lose their campus reference.`}
      >
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => { setDeleteDialogOpen(false); setDeletingCampus(null) }}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            loading={deleteLoading}
            className="flex-1"
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
