'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Camera, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export default function CompleteProfilePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    setError('')

    if (!selected) return

    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError('Please upload a PNG, JPEG, or WebP image.')
      return
    }

    if (selected.size > MAX_FILE_SIZE) {
      setError('Image must be under 5MB.')
      return
    }

    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
  }

  function handlePickFile() {
    fileInputRef.current?.click()
  }

  async function handleUpload() {
    if (!file) return

    setUploading(true)
    setError('')

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError('You must be signed in to upload a profile photo.')
        setUploading(false)
        return
      }

      const ext = file.name.split('.').pop()
      const path = `student-profiles/${user.id}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })

      if (uploadError) {
        setError('Upload failed. Please try again.')
        toast.error('Upload failed. Please try again.')
        setUploading(false)
        return
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path)

      const { error: updateError } = await supabase
        .from('student_profiles')
        .update({ profile_image_url: publicUrl })
        .eq('auth_user_id', user.id)

      if (updateError) {
        setError('Could not save your profile photo. Please try again.')
        toast.error('Could not save your profile photo. Please try again.')
        setUploading(false)
        return
      }

      setSuccess(true)
      toast.success('Profile photo uploaded successfully.')
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 1200)
    } catch {
      setError('An unexpected error occurred. Please try again.')
      toast.error('An unexpected error occurred. Please try again.')
      setUploading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center spatial-bg-rich px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="glass rounded-2xl p-8 shadow-spatial">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/90 shadow-lg shadow-indigo-500/20">
              <Camera className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-6 text-2xl font-bold text-gray-900">
              Complete Your Profile
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              A profile photo is required before you can access the platform.
            </p>
          </div>

          {error && (
            <div className="mt-6 flex items-start gap-2 rounded-xl bg-red-50/70 p-4 text-sm text-red-600 border border-red-200/50 backdrop-blur-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="mt-8 flex flex-col items-center gap-3 py-8">
              <CheckCircle className="h-12 w-12 text-emerald-500" />
              <p className="text-sm font-medium text-gray-900">
                Profile photo uploaded
              </p>
              <p className="text-xs text-gray-500">Redirecting to your dashboard...</p>
            </div>
          ) : (
            <div className="mt-8">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />

              <button
                type="button"
                onClick={handlePickFile}
                disabled={uploading}
                className="group relative flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/40 glass-input py-12 transition-all duration-200 hover:border-indigo-400/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Profile preview"
                    className="h-32 w-32 rounded-full object-cover shadow-lg shadow-black/10"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full bg-white/40 backdrop-blur-sm">
                    <Camera className="h-10 w-10 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                  </div>
                )}
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Upload className="h-4 w-4" />
                  {previewUrl ? 'Choose a different photo' : 'Click to upload a photo'}
                </span>
                <span className="text-xs text-gray-400">
                  PNG, JPEG, or WebP - max 5MB
                </span>
              </button>

              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || uploading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500/90 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
              >
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploading ? 'Uploading...' : 'Save Profile Photo'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
