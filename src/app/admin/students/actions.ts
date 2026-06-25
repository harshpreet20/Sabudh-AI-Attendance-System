'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/helpers'
import { revalidatePath } from 'next/cache'

interface ActionResult {
  success: boolean
  error?: string
}

export async function suspendStudent(
  studentId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const { user } = await requireAdmin()
    const supabase = await createClient()

    // Fetch current student status
    const { data: student, error: fetchError } = await supabase
      .from('student_profiles')
      .select('status')
      .eq('id', studentId)
      .single()

    if (fetchError || !student) {
      return { success: false, error: 'Student not found' }
    }

    const oldStatus = student.status

    // Update student status
    const { error: updateError } = await supabase
      .from('student_profiles')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', studentId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // Insert audit log
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'student_suspended',
      target_table: 'student_profiles',
      target_id: studentId,
      old_value: { status: oldStatus },
      new_value: { status: 'suspended', reason },
    })

    revalidatePath('/admin/students')
    revalidatePath(`/admin/students/${studentId}`)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to suspend student',
    }
  }
}

export async function restoreStudent(
  studentId: string
): Promise<ActionResult> {
  try {
    const { user } = await requireAdmin()
    const supabase = await createClient()

    // Fetch current student status
    const { data: student, error: fetchError } = await supabase
      .from('student_profiles')
      .select('status')
      .eq('id', studentId)
      .single()

    if (fetchError || !student) {
      return { success: false, error: 'Student not found' }
    }

    const oldStatus = student.status

    // Update student status
    const { error: updateError } = await supabase
      .from('student_profiles')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', studentId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // Insert audit log
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'student_restored',
      target_table: 'student_profiles',
      target_id: studentId,
      old_value: { status: oldStatus },
      new_value: { status: 'active' },
    })

    revalidatePath('/admin/students')
    revalidatePath(`/admin/students/${studentId}`)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore student',
    }
  }
}

export async function expelStudent(
  studentId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const { user } = await requireAdmin()
    const supabase = await createClient()

    // Fetch current student status
    const { data: student, error: fetchError } = await supabase
      .from('student_profiles')
      .select('status')
      .eq('id', studentId)
      .single()

    if (fetchError || !student) {
      return { success: false, error: 'Student not found' }
    }

    const oldStatus = student.status

    // Update student status
    const { error: updateError } = await supabase
      .from('student_profiles')
      .update({ status: 'expelled', updated_at: new Date().toISOString() })
      .eq('id', studentId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // Insert audit log
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'student_expelled',
      target_table: 'student_profiles',
      target_id: studentId,
      old_value: { status: oldStatus },
      new_value: { status: 'expelled', reason },
    })

    revalidatePath('/admin/students')
    revalidatePath(`/admin/students/${studentId}`)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to expel student',
    }
  }
}

export async function archiveStudent(
  studentId: string
): Promise<ActionResult> {
  try {
    const { user } = await requireAdmin()
    const supabase = await createClient()

    // Fetch current student status
    const { data: student, error: fetchError } = await supabase
      .from('student_profiles')
      .select('status')
      .eq('id', studentId)
      .single()

    if (fetchError || !student) {
      return { success: false, error: 'Student not found' }
    }

    const oldStatus = student.status

    // Update student status
    const { error: updateError } = await supabase
      .from('student_profiles')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', studentId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    // Insert audit log
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'student_archived',
      target_table: 'student_profiles',
      target_id: studentId,
      old_value: { status: oldStatus },
      new_value: { status: 'archived' },
    })

    revalidatePath('/admin/students')
    revalidatePath(`/admin/students/${studentId}`)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to archive student',
    }
  }
}

export async function updateStudentProfile(
  studentId: string,
  data: {
    full_name?: string
    phone?: string
    city?: string
    emergency_contact?: string
    learning_goal?: string
  }
): Promise<ActionResult> {
  try {
    const { user } = await requireAdmin()
    const supabase = await createClient()

    const { data: student, error: fetchError } = await supabase
      .from('student_profiles')
      .select('full_name, phone, city, emergency_contact, learning_goal')
      .eq('id', studentId)
      .single()

    if (fetchError || !student) {
      return { success: false, error: 'Student not found' }
    }

    const updateFields: Record<string, string> = {}
    const oldVal: Record<string, string | null> = {}
    const newVal: Record<string, string> = {}

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateFields[key] = value
        oldVal[key] = (student as Record<string, string | null>)[key]
        newVal[key] = value
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: 'No fields to update' }
    }

    updateFields.updated_at = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('student_profiles')
      .update(updateFields)
      .eq('id', studentId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'student_profile_updated',
      target_table: 'student_profiles',
      target_id: studentId,
      old_value: oldVal,
      new_value: newVal,
    })

    revalidatePath('/admin/students')
    revalidatePath(`/admin/students/${studentId}`)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to update student profile',
    }
  }
}
