'use client'

import { useParams } from 'next/navigation'
import { LectureWorkspace } from '@/components/lectures/lecture-workspace'

export default function LectureWorkspacePage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : String(params.id)
  return <LectureWorkspace lectureId={id} basePath="/teacher/lectures" />
}
