'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  UserPlus,
  GraduationCap,
  ShieldCheck,
  CheckCircle,
  Copy,
} from 'lucide-react'

interface Batch {
  id: string
  name: string
}

type UserType = 'student' | 'teacher'

export default function AdminUsersPage() {
  const supabase = createClient()

  const [tab, setTab] = useState<UserType>('student')
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(false)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [batchId, setBatchId] = useState('')
  const [qualification, setQualification] = useState('')
  const [city, setCity] = useState('')
  const [profession, setProfession] = useState('')
  const [subjectExpertise, setSubjectExpertise] = useState('')

  const [result, setResult] = useState<{ email: string; password: string; type: string } | null>(null)

  const fetchBatches = useCallback(async () => {
    const { data } = await supabase
      .from('batches')
      .select('id, name')
      .eq('status', 'active')
      .order('name')
    setBatches((data as Batch[]) ?? [])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  function resetForm() {
    setFullName('')
    setEmail('')
    setPhone('')
    setBatchId('')
    setQualification('')
    setCity('')
    setProfession('')
    setSubjectExpertise('')
    setResult(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !email.trim()) {
      toast.error('Name and email are required')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/add-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: tab,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          batch_id: batchId || null,
          qualification: qualification.trim() || null,
          city: city.trim() || null,
          profession: profession.trim() || null,
          subject_expertise: subjectExpertise.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to add user')
        return
      }

      setResult(data)
      toast.success(`${tab === 'teacher' ? 'Teacher' : 'Student'} added successfully`)
    } catch {
      toast.error('Failed to add user')
    } finally {
      setLoading(false)
    }
  }

  function copyCredentials() {
    if (!result) return
    navigator.clipboard.writeText(`Email: ${result.email}\nPassword: ${result.password}`)
    toast.success('Credentials copied to clipboard')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Users</h1>
        <p className="mt-1 text-sm text-gray-500">Add new students and teachers to the platform</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="rounded-xl bg-indigo-100/60 p-1.5 backdrop-blur-sm">
              <UserPlus className="h-5 w-5 text-indigo-600" />
            </div>
            Add User
          </CardTitle>
          <CardDescription>
            Create a new account with auto-generated credentials. A welcome email with login details will be sent automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Tab toggle */}
          <div className="mb-6 flex gap-2">
            <button
              onClick={() => { setTab('student'); setResult(null) }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                tab === 'student'
                  ? 'bg-indigo-500/10 text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              Add Student
            </button>
            <button
              onClick={() => { setTab('teacher'); setResult(null) }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                tab === 'teacher'
                  ? 'bg-violet-500/10 text-violet-700 shadow-sm'
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Add Teacher
            </button>
          </div>

          {result ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50/60 border border-emerald-200/50 p-6 text-center backdrop-blur-sm">
                <CheckCircle className="mx-auto h-10 w-10 text-emerald-500" />
                <h3 className="mt-3 text-lg font-semibold text-gray-900">
                  {tab === 'teacher' ? 'Teacher' : 'Student'} Added
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Share these credentials with the user
                </p>
                <div className="mt-4 rounded-xl bg-white/70 p-4 text-left text-sm space-y-2 backdrop-blur-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Email</span>
                    <span className="font-medium text-gray-900">{result.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Password</span>
                    <span className="font-mono font-medium text-gray-900">{result.password}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-3 justify-center">
                  <Button variant="outline" size="sm" onClick={copyCredentials}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copy Credentials
                  </Button>
                  <Button size="sm" onClick={resetForm}>
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    Add Another
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Full Name *"
                  placeholder="Rahul Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
                <Input
                  label="Email *"
                  type="email"
                  placeholder="rahul@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                {tab === 'student' ? (
                  <Select
                    label="Assign to Batch"
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                  >
                    <option value="">No batch</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    label="Subject Expertise"
                    placeholder="Machine Learning, Python"
                    value={subjectExpertise}
                    onChange={(e) => setSubjectExpertise(e.target.value)}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Qualification"
                  placeholder="B.Tech Computer Science"
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                />
                {tab === 'student' ? (
                  <>
                    <Input
                      label="City"
                      placeholder="New Delhi"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </>
                ) : null}
              </div>

              {tab === 'student' && (
                <Input
                  label="Profession"
                  placeholder="Software Engineer"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                />
              )}

              <div className="rounded-xl bg-amber-50/60 border border-amber-200/50 p-3 text-xs text-amber-700 backdrop-blur-sm">
                A password will be auto-generated and a welcome email with login credentials will be sent to the user.
                {tab === 'student' ? ' The student will be added with active status (pre-approved).' : ' The teacher will be added with active status.'}
              </div>

              <Button
                type="submit"
                disabled={loading || !fullName.trim() || !email.trim()}
                loading={loading}
                className="w-full"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                {loading ? 'Adding...' : `Add ${tab === 'teacher' ? 'Teacher' : 'Student'}`}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
