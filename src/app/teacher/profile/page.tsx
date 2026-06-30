'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Save, Camera } from 'lucide-react'
import type { TeacherProfile } from '@/types/database'

export default function TeacherProfilePage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<TeacherProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [form, setForm] = useState({
    phone: '',
    subject_expertise: '',
    qualification: '',
    bio: '',
  })

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('teacher_profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (data) {
      const tp = data as TeacherProfile
      setProfile(tp)
      setForm({
        phone: tp.phone ?? '',
        subject_expertise: tp.subject_expertise ?? '',
        qualification: tp.qualification ?? '',
        bio: tp.bio ?? '',
      })
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  async function handleSave() {
    if (!profile) return
    setSaving(true)

    const { error } = await supabase
      .from('teacher_profiles')
      .update({
        phone: form.phone.trim() || null,
        subject_expertise: form.subject_expertise.trim() || null,
        qualification: form.qualification.trim() || null,
        bio: form.bio.trim() || null,
      })
      .eq('id', profile.id)

    if (error) toast.error('Failed to save')
    else toast.success('Profile updated')

    setSaving(false)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB')
      return
    }

    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `teacher-profiles/${profile.auth_user_id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      toast.error('Upload failed')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    await supabase
      .from('teacher_profiles')
      .update({ profile_image_url: publicUrl })
      .eq('id', profile.id)

    setProfile(prev => prev ? { ...prev, profile_image_url: publicUrl } : prev)
    toast.success('Profile picture updated')
    setUploading(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-gray-500">Teacher profile not found. Please contact an administrator.</p>
        </CardContent>
      </Card>
    )
  }

  const initials = profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your teacher profile</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start">
          <div className="relative group">
            <Avatar src={profile.profile_image_url} fallback={initials} size="lg" />
            <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-6 w-6 text-white" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{profile.full_name}</h2>
            <p className="text-sm text-gray-500">{profile.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge>{profile.status}</Badge>
              <span className="text-xs text-gray-400">Joined {new Date(profile.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="+91 98765 43210"
          />
          <Input
            label="Subject Expertise"
            value={form.subject_expertise}
            onChange={(e) => setForm(f => ({ ...f, subject_expertise: e.target.value }))}
            placeholder="e.g., Machine Learning, Data Science"
          />
          <Input
            label="Qualification"
            value={form.qualification}
            onChange={(e) => setForm(f => ({ ...f, qualification: e.target.value }))}
            placeholder="e.g., PhD in Computer Science"
          />
          <Textarea
            label="Bio"
            value={form.bio}
            onChange={(e) => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder="Write a short bio..."
            rows={4}
          />
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
