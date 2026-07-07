'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/image-compress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from 'sonner'
import {
  User,
  Mail,
  Phone,
  Calendar,
  Save,
  Camera,
  AlertCircle,
  Shield,
  Briefcase,
  GraduationCap,
  Building2,
  Heart,
  Clock,
} from 'lucide-react'
import type { StudentProfile, ProfilePhotoRequest } from '@/types/database'

export default function ProfilePage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [learningGoal, setLearningGoal] = useState('')
  const [profession, setProfession] = useState('')
  const [qualification, setQualification] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [gender, setGender] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [emergencyContact, setEmergencyContact] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pendingPhotoRequest, setPendingPhotoRequest] = useState<ProfilePhotoRequest | null>(null)

  const fetchProfile = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      return
    }

    setUserEmail(user.email || '')

    const { data } = await supabase
      .from('student_profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (data) {
      const profileData = data as StudentProfile
      setProfile(profileData)
      setPhone(profileData.phone || '')
      setCity(profileData.city || '')
      setLearningGoal(profileData.learning_goal || '')
      setProfession(profileData.profession || '')
      setQualification(profileData.qualification || '')
      setOrganizationName(profileData.organization_name || '')
      setGender(profileData.gender || '')
      setDateOfBirth(profileData.date_of_birth || '')
      setEmergencyContact(profileData.emergency_contact || '')

      const { data: pendingReq } = await supabase
        .from('profile_photo_requests')
        .select('*')
        .eq('student_profile_id', profileData.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setPendingPhotoRequest((pendingReq as ProfilePhotoRequest) ?? null)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  async function handleSave() {
    if (!profile) return

    setSaving(true)
    const supabase = createClient()

    const updates = {
      phone: phone || null,
      city: city || null,
      learning_goal: learningGoal || null,
      profession: profession || null,
      qualification: qualification || null,
      organization_name: organizationName || null,
      gender: gender || null,
      date_of_birth: dateOfBirth || null,
      emergency_contact: emergencyContact || null,
    }

    const { data: updatedRows, error } = await supabase
      .from('student_profiles')
      .update(updates)
      .eq('id', profile.id)
      .select()

    if (error || !updatedRows || updatedRows.length === 0) {
      toast.error('Failed to save profile. Please try again.')
    } else {
      toast.success('Profile updated successfully.')
      setProfile((prev) => prev ? { ...prev, ...updates } : prev)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-6">
          <Skeleton shape="circle" width={80} height={80} />
          <div className="space-y-2">
            <Skeleton width={200} height={24} />
            <Skeleton width={150} height={16} />
          </div>
        </div>
        <Skeleton shape="rect" height={300} />
        <Skeleton shape="rect" height={200} />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <EmptyState
          icon={AlertCircle}
          title="Profile not found"
          description="Your student profile has not been set up yet. Please contact your administrator."
        />
      </div>
    )
  }

  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const statusVariant =
    profile.status === 'active'
      ? 'success'
      : profile.status === 'suspended'
        ? 'destructive'
        : 'secondary'

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB')
      return
    }

    setUploading(true)
    const supabase = createClient()
    const compressed = await compressImage(file)
    const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase()
    const timestamp = Date.now()
    const path = `student-profiles/${profile.auth_user_id}/pending-${timestamp}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, compressed, { upsert: true, contentType: compressed.type })

    if (uploadError) {
      toast.error('Upload failed. Please try again.')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    const { data: request, error: insertError } = await supabase
      .from('profile_photo_requests')
      .insert({
        student_profile_id: profile.id,
        auth_user_id: profile.auth_user_id,
        old_photo_url: profile.profile_image_url,
        new_photo_url: publicUrl,
        new_photo_storage_path: path,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      toast.error('Failed to submit photo change request.')
      setUploading(false)
      return
    }

    setPendingPhotoRequest(request as ProfilePhotoRequest)
    toast.success('Photo change submitted for approval.')
    setUploading(false)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Profile picture required warning */}
      {!profile.profile_image_url && (
        <div className="rounded-xl bg-amber-50/70 border border-amber-200/50 p-4 backdrop-blur-sm flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Profile picture required</p>
            <p className="mt-1 text-xs text-amber-700">
              A recent profile picture is mandatory. Please upload your photo below to continue using the platform.
            </p>
          </div>
        </div>
      )}

      {/* Profile header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative group">
              <Avatar
                src={profile.profile_image_url}
                fallback={initials}
                size="lg"
                className="h-20 w-20 text-xl"
              />
              <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-6 w-6 text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
              </label>
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              )}
              {pendingPhotoRequest && (
                <div className="absolute -bottom-1 -right-1 rounded-full bg-amber-500 p-1">
                  <Clock className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl font-bold text-gray-900">
                {profile.full_name}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">{profile.email}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <Badge variant={statusVariant}>
                  {profile.status.charAt(0).toUpperCase() + profile.status.slice(1)}
                </Badge>
                {pendingPhotoRequest && (
                  <Badge variant="warning">
                    <Clock className="mr-1 h-3 w-3" />
                    Photo Change Pending Approval
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Information - Read Only */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-gray-500" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-500">
                Full Name
              </label>
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5">
                <User className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-900">{profile.full_name}</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-500">
                Email
              </label>
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-900">{profile.email}</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-500">
                Member Since
              </label>
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-900">
                  {new Date(profile.created_at).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-gray-500" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Phone Number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 12345 67890"
              />
              <Input
                label="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Enter your city"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="flex h-10 w-full appearance-none rounded-xl px-3 py-2 text-sm text-gray-900 transition-all duration-200 glass-input"
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
              <Input
                label="Date of Birth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Profession"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="e.g. Software Engineer, Student"
              />
              <Input
                label="Qualification"
                value={qualification}
                onChange={(e) => setQualification(e.target.value)}
                placeholder="e.g. B.Tech, M.Sc"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Organization"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Company or institution name"
              />
              <Input
                label="Emergency Contact"
                type="tel"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="+91 12345 67890"
              />
            </div>
            <Textarea
              label="Learning Goal"
              value={learningGoal}
              onChange={(e) => setLearningGoal(e.target.value)}
              placeholder="What do you want to learn?"
              rows={3}
            />

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} loading={saving}>
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enrollment Photos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-gray-500" />
            Enrollment Photos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profile.profile_image_url ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="relative aspect-square overflow-hidden rounded-lg border border-gray-200">
                <img
                  src={profile.profile_image_url}
                  alt="Profile photo"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Camera}
              title="No photos uploaded"
              description="Enrollment photos are used for face verification during attendance. Contact your administrator to upload photos."
              className="border-0 bg-transparent py-8"
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
