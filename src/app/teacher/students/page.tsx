'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Search, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import type { StudentProfile, Batch } from '@/types/database'

const PAGE_SIZE = 12

export default function TeacherStudentsPage() {
  const supabase = createClient()
  const [students, setStudents] = useState<StudentProfile[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [search, setSearch] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: myBatches } = await supabase
      .from('batches')
      .select('*')
      .eq('instructor_id', user.id)
      .eq('status', 'active')
      .order('name')

    setBatches((myBatches as Batch[]) ?? [])
    const batchIds = myBatches?.map(b => b.id) ?? []
    if (batchIds.length === 0) {
      setStudents([])
      setTotal(0)
      setLoading(false)
      return
    }

    let query = supabase
      .from('student_profiles')
      .select('*', { count: 'exact' })
      .in('batch_id', batchFilter ? [batchFilter] : batchIds)
      .eq('status', 'active')
      .order('full_name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (search.trim()) {
      query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`)
    }

    const { data, count } = await query
    setStudents((data as StudentProfile[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, search, batchFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setPage(0)
  }, [search, batchFilter])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Students</h1>
        <p className="mt-1 text-sm text-gray-500">View student profiles across your batches</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
          <option value="">All Batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students found"
          description="No students match your current filters."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {students.map((student) => (
              <Card
                key={student.id}
                className="cursor-pointer transition-all duration-200 hover:bg-white/70"
                onClick={() => setSelectedStudent(selectedStudent?.id === student.id ? null : student)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={student.profile_image_url}
                      fallback={student.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-900">{student.full_name}</p>
                      <p className="truncate text-sm text-gray-500">{student.email}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant={student.attendance_percentage >= 75 ? 'success' : student.attendance_percentage >= 50 ? 'warning' : 'destructive'}>
                          {student.attendance_percentage}% Attendance
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {selectedStudent?.id === student.id && (
                    <div className="mt-4 space-y-2 border-t border-white/30 pt-4 text-sm">
                      {[
                        ['Phone', student.phone],
                        ['City', student.city],
                        ['Profession', student.profession],
                        ['Qualification', student.qualification],
                        ['Organization', student.organization_name],
                        ['Learning Goal', student.learning_goal],
                        ['Present', `${student.present_count} / ${student.total_sessions}`],
                      ]
                        .filter(([, v]) => v)
                        .map(([label, value]) => (
                          <div key={label} className="flex justify-between">
                            <span className="text-gray-500">{label}</span>
                            <span className="font-medium text-gray-900 text-right max-w-[60%] truncate">{value}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
