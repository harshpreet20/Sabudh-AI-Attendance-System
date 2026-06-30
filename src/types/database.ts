export type UserRole = "student" | "instructor" | "admin" | "super_admin";

export type StudentStatus =
  | "pending"
  | "active"
  | "suspended"
  | "expelled"
  | "archived";

export type SessionStatus =
  | "scheduled"
  | "attendance_open"
  | "attendance_closed"
  | "completed"
  | "cancelled"
  | "archived";

export type AttendanceStatus =
  | "draft"
  | "uploaded"
  | "processing"
  | "approved"
  | "rejected"
  | "manual_review"
  | "excused";

export type AttendanceDecision =
  | "accepted"
  | "rejected"
  | "manual_review"
  | "pending";

export type NotificationType =
  | "attendance_accepted"
  | "attendance_rejected"
  | "attendance_reminder"
  | "low_attendance"
  | "certificate_eligible"
  | "account_suspended"
  | "account_restored"
  | "system"
  | "info";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Campus {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  city: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  duration_weeks: number | null;
  attendance_requirement: number;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface Classroom {
  id: string;
  campus_id: string;
  name: string;
  building: string | null;
  floor: string | null;
  capacity: number | null;
  status: "active" | "inactive" | "maintenance";
  created_at: string;
  updated_at: string;
}

export interface ClassroomImage {
  id: string;
  classroom_id: string;
  image_type: string;
  storage_path: string;
  uploaded_at: string;
}

export interface Batch {
  id: string;
  course_id: string;
  name: string;
  instructor_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "completed" | "archived";
  created_at: string;
  updated_at: string;
}

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  organization_id: string;
  created_at: string;
}

export interface StudentProfile {
  id: string;
  auth_user_id: string;
  organization_id: string;
  batch_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  profession: string | null;
  organization_name: string | null;
  qualification: string | null;
  city: string | null;
  emergency_contact: string | null;
  learning_goal: string | null;
  preferred_language: string;
  profile_image_url: string | null;
  status: StudentStatus;
  attendance_percentage: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  total_sessions: number;
  ai_persona: string | null;
  risk_score: number;
  created_at: string;
  updated_at: string;
}

export interface EnrollmentImage {
  id: string;
  student_id: string;
  storage_path: string;
  angle: "front" | "left" | "right" | "up" | "down" | null;
  uploaded_at: string;
}

export interface Session {
  id: string;
  batch_id: string;
  classroom_id: string | null;
  instructor_id: string | null;
  session_date: string;
  attendance_open: string | null;
  attendance_close: string | null;
  attendance_word: string | null;
  status: SessionStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  submitted_at: string | null;
  verified_at: string | null;
  decision: AttendanceDecision | null;
  decision_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  device_fingerprint: string | null;
  browser: string | null;
  operating_system: string | null;
  ip_address: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  location_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceMedia {
  id: string;
  attendance_id: string;
  selfie_path: string | null;
  video_path: string | null;
  audio_path: string | null;
  selfie_hash: string | null;
  video_hash: string | null;
  audio_hash: string | null;
  media_size_bytes: number | null;
  created_at: string;
}

export interface AttendanceScores {
  id: string;
  attendance_id: string;
  speech_score: number | null;
  face_score: number | null;
  classroom_score: number | null;
  liveness_score: number | null;
  fraud_score: number | null;
  overall_confidence: number | null;
  model_version: string | null;
  processing_time_ms: number | null;
  reason_codes: string[] | null;
  provider: string | null;
  created_at: string;
}

export interface StudentDevice {
  id: string;
  student_id: string;
  fingerprint: string;
  browser: string | null;
  operating_system: string | null;
  screen_resolution: string | null;
  timezone: string | null;
  language: string | null;
  first_seen: string;
  last_seen: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface InstructorNote {
  id: string;
  student_id: string;
  instructor_id: string;
  note: string;
  created_at: string;
}

export interface Certificate {
  id: string;
  student_id: string;
  course_id: string;
  attendance_percentage: number;
  issued_at: string;
  verification_token: string;
  qr_code_url: string | null;
  status: "active" | "revoked";
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
}

export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'urgent'

export type ScheduleType = 'class' | 'assessment' | 'topic' | 'holiday' | 'event'

export type ScheduleStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'postponed'

export interface TeacherProfile {
  id: string
  auth_user_id: string
  organization_id: string
  full_name: string
  email: string
  phone: string | null
  profile_image_url: string | null
  subject_expertise: string | null
  qualification: string | null
  bio: string | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface Announcement {
  id: string
  organization_id: string
  batch_id: string | null
  author_id: string
  title: string
  content: string
  priority: AnnouncementPriority
  is_pinned: boolean
  published_at: string
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface ClassSchedule {
  id: string
  organization_id: string
  batch_id: string
  instructor_id: string
  schedule_type: ScheduleType
  title: string
  description: string | null
  scheduled_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  status: ScheduleStatus
  created_at: string
  updated_at: string
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface LeaveRequest {
  id: string
  student_id: string
  batch_id: string
  leave_date: string
  reason: string
  status: LeaveStatus
  reviewed_by: string | null
  reviewed_at: string | null
  reviewer_note: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  correlation_id: string;
  created_at: string;
}

export interface SystemSetting {
  id: string;
  organization_id: string;
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  created_at: string;
  updated_at: string;
}
