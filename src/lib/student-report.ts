import { jsPDF } from 'jspdf'

export interface StudentReportData {
  fullName: string
  email: string
  batchName: string
  status: string
  attendancePct: number
  presentCount: number
  totalSessions: number
  sessions: Array<{ date: string; status: 'Present' | 'Absent' | 'Grace' }>
  generatedAt?: string
}

const PURPLE: [number, number, number] = [124, 58, 237]
const GRAY: [number, number, number] = [100, 116, 139]

// Builds a branded, one-or-more-page progress report for a single student.
export function buildStudentReportPdf(data: StudentReportData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  let y = 0

  // Header band
  doc.setFillColor(PURPLE[0], PURPLE[1], PURPLE[2])
  doc.rect(0, 0, pageW, 70, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('Sabudh AI', margin, 34)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.text('Student Progress Report', margin, 54)
  const generated =
    data.generatedAt ??
    new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  doc.setFontSize(9)
  doc.text(`Generated ${generated}`, pageW - margin, 54, { align: 'right' })

  y = 100

  // Student info
  doc.setTextColor(17, 24, 39)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(data.fullName, margin, y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(GRAY[0], GRAY[1], GRAY[2])
  doc.text(
    `${data.email}    Batch: ${data.batchName}    Status: ${data.status}`,
    margin,
    y
  )
  y += 26

  // Summary stat boxes
  const boxW = (pageW - margin * 2 - 20) / 3
  const stats = [
    { label: 'Attendance', value: `${data.attendancePct.toFixed(1)}%` },
    { label: 'Present', value: `${data.presentCount}` },
    { label: 'Total Sessions', value: `${data.totalSessions}` },
  ]
  stats.forEach((s, i) => {
    const x = margin + i * (boxW + 10)
    doc.setFillColor(243, 244, 246)
    doc.roundedRect(x, y, boxW, 54, 6, 6, 'F')
    doc.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2])
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(s.value, x + 12, y + 26)
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2])
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(s.label, x + 12, y + 44)
  })
  y += 78

  // Session table title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(17, 24, 39)
  doc.text('Session Attendance', margin, y)
  y += 16

  const drawTableHeader = () => {
    doc.setFillColor(PURPLE[0], PURPLE[1], PURPLE[2])
    doc.rect(margin, y, pageW - margin * 2, 22, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Date', margin + 10, y + 15)
    doc.text('Status', pageW - margin - 110, y + 15)
    y += 22
  }
  drawTableHeader()

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  if (data.sessions.length === 0) {
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2])
    doc.text('No sessions recorded yet.', margin + 10, y + 16)
  } else {
    data.sessions.forEach((s, idx) => {
      if (y > pageH - 50) {
        doc.addPage()
        y = margin
        drawTableHeader()
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
      }
      if (idx % 2 === 0) {
        doc.setFillColor(249, 250, 251)
        doc.rect(margin, y, pageW - margin * 2, 20, 'F')
      }
      doc.setTextColor(31, 41, 55)
      doc.text(s.date, margin + 10, y + 14)
      const color: [number, number, number] =
        s.status === 'Absent' ? [220, 38, 38] : s.status === 'Grace' ? [217, 119, 6] : [22, 163, 74]
      doc.setTextColor(color[0], color[1], color[2])
      doc.setFont('helvetica', 'bold')
      doc.text(s.status, pageW - margin - 110, y + 14)
      doc.setFont('helvetica', 'normal')
      y += 20
    })
  }

  return doc
}

export function reportFileName(fullName: string): string {
  const safe = fullName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
  return `${safe || 'student'}_progress_report.pdf`
}
