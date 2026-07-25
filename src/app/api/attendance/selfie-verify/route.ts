import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSelfieConfig } from '@/lib/selfie-config'
import { generateSelfieToken } from '@/lib/attendance-qr'

// Lightweight check so the student page can show/hide the selfie button.
export async function GET() {
  const cfg = await getSelfieConfig()
  return NextResponse.json({
    success: true,
    data: { enabled: cfg.enabled && Boolean(cfg.description) },
  })
}

// Verify a class selfie: the face must match the student's profile photo AND
// the background must match the stored classroom "understanding". On success we
// issue a short-lived token that counts as one attendance factor.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }

    const cfg = await getSelfieConfig()
    if (!cfg.enabled || !cfg.description) {
      return NextResponse.json(
        { success: false, error: { code: 'SELFIE_DISABLED', message: 'Selfie verification is not set up.' } },
        { status: 503 }
      )
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_CONFIGURED', message: 'Selfie verification is not configured.' } },
        { status: 503 }
      )
    }

    const body = await request.json()
    const sessionId: string | undefined = body?.session_id
    const image: string | undefined = body?.image
    if (!sessionId || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'session_id and a selfie image are required' } },
        { status: 400 }
      )
    }

    const service = createServiceClient()
    const { data: profile } = await service
      .from('student_profiles')
      .select('id, profile_image_url')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile?.profile_image_url) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_PROFILE_PHOTO', message: 'Add your profile photo first, then try the selfie.' } },
        { status: 400 }
      )
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You verify class-attendance selfies. You get (A) a text description of the expected classroom, (B) the student\'s reference profile photo, and (C) a selfie just taken. Decide two things independently: face_match = is the person in C the same individual as in B (allow different angle, lighting, aging, expression)? background_match = was C taken in a room matching description A (floor, ceiling, wall colour, fixed furniture/equipment layout) — ignore which people are present, time of day, and lighting. Respond ONLY as JSON: {"face_match":true|false,"background_match":true|false,"confidence":0-1,"reason":"short"}.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Classroom description (A): ${cfg.description}` },
            { type: 'text', text: 'Profile photo (B):' },
            { type: 'image_url', image_url: { url: profile.profile_image_url, detail: 'low' } },
            { type: 'text', text: 'Selfie just taken (C):' },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        },
      ],
    })

    let faceMatch = false
    let backgroundMatch = false
    let reason = ''
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      faceMatch = Boolean(parsed.face_match)
      backgroundMatch = Boolean(parsed.background_match)
      reason = typeof parsed.reason === 'string' ? parsed.reason : ''
    } catch {
      // treat as failure
    }

    if (faceMatch && backgroundMatch) {
      // Store the verified selfie for audit/proof; linked to the attendance
      // record on submit. Best-effort — a storage hiccup shouldn't block marking.
      let selfiePath: string | null = null
      try {
        const base64 = image.split(',')[1]
        if (base64) {
          const buffer = Buffer.from(base64, 'base64')
          const path = `attendance-selfies/${user.id}/${sessionId}-${Date.now()}.jpg`
          const { error } = await service.storage
            .from('uploads')
            .upload(path, buffer, { contentType: 'image/jpeg', upsert: true })
          if (!error) selfiePath = path
        }
      } catch (err) {
        console.error('Selfie upload failed:', err)
      }

      return NextResponse.json({
        success: true,
        data: {
          verified: true,
          token: generateSelfieToken(sessionId),
          selfie_path: selfiePath,
        },
      })
    }

    const message = !faceMatch
      ? 'That doesn\'t match your profile photo. Take a clear selfie of yourself.'
      : 'This selfie doesn\'t look like it was taken in class. Move so the classroom is visible behind you.'
    return NextResponse.json({
      success: true,
      data: { verified: false, face_match: faceMatch, background_match: backgroundMatch, reason: reason || message },
    })
  } catch (error) {
    console.error('Selfie verify error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to verify the selfie' } },
      { status: 500 }
    )
  }
}
