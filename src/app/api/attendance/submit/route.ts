import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isWithinAnyZone } from "@/lib/geofence";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { session_id, latitude, longitude, location_accuracy } = body;

    if (!session_id) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "session_id is required" } },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from("student_profiles")
      .select("id, status, batch_id")
      .eq("auth_user_id", user.id)
      .single();

    if (!profile || profile.status !== "active") {
      return NextResponse.json(
        { success: false, error: { code: "ACCOUNT_INACTIVE", message: "Your account is not active" } },
        { status: 403 }
      );
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("id, status, attendance_open, attendance_close, batch_id")
      .eq("id", session_id)
      .single();

    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: "SESSION_NOT_FOUND", message: "Session not found" } },
        { status: 404 }
      );
    }

    if (session.batch_id !== profile.batch_id) {
      return NextResponse.json(
        { success: false, error: { code: "WRONG_BATCH", message: "This session is not for your batch" } },
        { status: 403 }
      );
    }

    if (session.status !== "attendance_open") {
      return NextResponse.json(
        { success: false, error: { code: "ATTENDANCE_WINDOW_CLOSED", message: "Attendance window is not open" } },
        { status: 400 }
      );
    }

    const now = new Date();
    const closeTime = session.attendance_close ? new Date(session.attendance_close) : null;
    if (closeTime && now > closeTime) {
      return NextResponse.json(
        { success: false, error: { code: "ATTENDANCE_WINDOW_CLOSED", message: "Attendance window has closed" } },
        { status: 400 }
      );
    }

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { success: false, error: { code: "LOCATION_REQUIRED", message: "Location access is required to mark attendance" } },
        { status: 400 }
      );
    }

    const locationCheck = isWithinAnyZone(latitude, longitude);
    if (!locationCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "OUTSIDE_GEOFENCE",
            message: `You are ${Math.round(locationCheck.distance)}m away from the nearest allowed zone (${locationCheck.zone?.name}). You must be within 500m to mark attendance.`,
          },
        },
        { status: 403 }
      );
    }

    const { data: existing } = await supabase
      .from("attendance")
      .select("id")
      .eq("session_id", session_id)
      .eq("student_id", profile.id)
      .single();

    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "DUPLICATE_SUBMISSION", message: "You have already marked attendance for this session" } },
        { status: 409 }
      );
    }

    const userAgent = request.headers.get("user-agent") || "";
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";

    const { data: attendance, error: insertError } = await supabase
      .from("attendance")
      .insert({
        session_id,
        student_id: profile.id,
        status: "approved",
        decision: "accepted",
        submitted_at: now.toISOString(),
        verified_at: now.toISOString(),
        browser: userAgent,
        ip_address: ip !== "unknown" ? ip : null,
        latitude,
        longitude,
        location_accuracy: location_accuracy || null,
        location_address: locationCheck.zone?.name || null,
      })
      .select("id, status, decision, submitted_at")
      .single();

    if (insertError) {
      console.error("Attendance insert error:", insertError);
      return NextResponse.json(
        { success: false, error: { code: "INSERT_FAILED", message: "Failed to record attendance" } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        attendance_id: attendance.id,
        status: attendance.status,
        decision: attendance.decision,
        submitted_at: attendance.submitted_at,
        message: "Attendance recorded successfully",
      },
    });
  } catch (error) {
    console.error("Attendance submit error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to submit attendance" } },
      { status: 500 }
    );
  }
}
