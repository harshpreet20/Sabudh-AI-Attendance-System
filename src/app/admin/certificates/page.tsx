import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/helpers'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { Award, FileText, Users, CheckCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const ATTENDANCE_THRESHOLD = 80

interface EligibleStudent {
  id: string
  full_name: string
  email: string
  batch_id: string | null
  attendance_percentage: number
  updated_at: string
  batch_name: string | null
  certificate: {
    id: string
    verification_token: string
    issued_at: string
    qr_code_url: string | null
  } | null
}

export default async function CertificatesPage() {
  await requireAdmin()
  const supabase = await createClient()

  // Fetch students with attendance >= threshold, joining batch name
  const { data: studentsRaw } = await supabase
    .from('student_profiles')
    .select('id, full_name, email, batch_id, attendance_percentage, updated_at, batches(name)')
    .eq('status', 'active')
    .gte('attendance_percentage', ATTENDANCE_THRESHOLD)
    .order('attendance_percentage', { ascending: false })

  // Fetch all certificates to match against students
  const studentIds = (studentsRaw ?? []).map((s) => s.id)
  let certificatesMap = new Map<
    string,
    {
      id: string
      verification_token: string
      issued_at: string
      qr_code_url: string | null
    }
  >()

  if (studentIds.length > 0) {
    const { data: certificates } = await supabase
      .from('certificates')
      .select('id, student_id, verification_token, issued_at, qr_code_url')
      .in('student_id', studentIds)

    if (certificates) {
      for (const cert of certificates) {
        certificatesMap.set(cert.student_id, {
          id: cert.id,
          verification_token: cert.verification_token,
          issued_at: cert.issued_at,
          qr_code_url: cert.qr_code_url,
        })
      }
    }
  }

  // Build eligible students list
  const eligibleStudents: EligibleStudent[] = (studentsRaw ?? []).map((s) => {
    const batchData = s.batches as unknown as { name: string } | { name: string }[] | null
    let batchName: string | null = null
    if (batchData) {
      batchName = Array.isArray(batchData) ? (batchData[0]?.name ?? null) : batchData.name
    }

    return {
      id: s.id,
      full_name: s.full_name,
      email: s.email,
      batch_id: s.batch_id,
      attendance_percentage: s.attendance_percentage,
      updated_at: s.updated_at,
      batch_name: batchName,
      certificate: certificatesMap.get(s.id) ?? null,
    }
  })

  const totalEligible = eligibleStudents.length
  const totalIssued = eligibleStudents.filter((s) => s.certificate !== null).length
  const totalPending = totalEligible - totalIssued

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Certificates</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage certificate eligibility and issuance for students meeting the{' '}
          {ATTENDANCE_THRESHOLD}% attendance threshold.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Eligible Students
                </p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {totalEligible}
                </p>
              </div>
              <div className="rounded-full bg-blue-50 p-3">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Certificates Issued
                </p>
                <p className="mt-1 text-3xl font-bold text-green-600">
                  {totalIssued}
                </p>
              </div>
              <div className="rounded-full bg-green-50 p-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Pending Issuance
                </p>
                <p className="mt-1 text-3xl font-bold text-amber-600">
                  {totalPending}
                </p>
              </div>
              <div className="rounded-full bg-amber-50 p-3">
                <Award className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Actions Placeholder */}
      {totalPending > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">
              Bulk certificate actions will be available in a future update.
              {' '}{totalPending} student{totalPending !== 1 ? 's' : ''} pending issuance.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Students Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Eligible Students
          </CardTitle>
          <CardDescription>
            Students with {ATTENDANCE_THRESHOLD}% or higher attendance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eligibleStudents.length === 0 ? (
            <EmptyState
              icon={Award}
              title="No eligible students"
              description={`No students have reached the ${ATTENDANCE_THRESHOLD}% attendance threshold yet.`}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Attendance</TableHead>
                  <TableHead>Eligible Since</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Certificate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligibleStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">
                      {student.full_name}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {student.email}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {student.batch_name ?? 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="success">
                        {student.attendance_percentage.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {format(parseISO(student.updated_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {student.certificate ? (
                        <Badge variant="success">Issued</Badge>
                      ) : (
                        <Badge variant="warning">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {student.certificate ? (
                        <span className="text-xs text-gray-500">
                          {student.certificate.verification_token}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">--</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
