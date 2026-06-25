import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

    const { data: profile } = await supabase
      .from("student_profiles")
      .select("id, batch_id, status")
      .eq("auth_user_id", user.id)
      .single();

    if (!profile || profile.status !== "active") {
      return NextResponse.json({
        success: true,
        data: { status: "no_session", message: "Profile not active" },
      });
    }

    if (!profile.batch_id) {
      return NextResponse.json({
        success: true,
        data: { status: "no_session", message: "Not assigned to a batch" },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const { data: session } = await supabase
      .from("sessions")
      .select("id, attendance_open, attendance_close, attendance_word, status, classroom_id")
      .eq("batch_id", profile.batch_id)
      .eq("session_date", today)
      .neq("status", "cancelled")
      .order("attendance_open", { ascending: true })
      .limit(1)
      .single();

    if (!session) {
      return NextResponse.json({
        success: true,
        data: { status: "no_session", message: "No class scheduled today" },
      });
    }

    const { data: existingAttendance } = await supabase
      .from("attendance")
      .select("id, status, decision")
      .eq("session_id", session.id)
      .eq("student_id", profile.id)
      .single();

    if (existingAttendance) {
      return NextResponse.json({
        success: true,
        data: {
          status: "already_submitted",
          attendance: existingAttendance,
          session_id: session.id,
        },
      });
    }

    const now = new Date();
    const openTime = session.attendance_open ? new Date(session.attendance_open) : null;
    const closeTime = session.attendance_close ? new Date(session.attendance_close) : null;

    if (session.status === "attendance_open" && openTime && closeTime && now >= openTime && now <= closeTime) {
      return NextResponse.json({
        success: true,
        data: {
          status: "open",
          session_id: session.id,
          attendance_word: session.attendance_word,
          closes_at: session.attendance_close,
          time_remaining_seconds: Math.max(0, Math.floor((closeTime.getTime() - now.getTime()) / 1000)),
        },
      });
    }

    if (openTime && now < openTime) {
      return NextResponse.json({
        success: true,
        data: {
          status: "upcoming",
          session_id: session.id,
          opens_at: session.attendance_open,
          time_until_open_seconds: Math.max(0, Math.floor((openTime.getTime() - now.getTime()) / 1000)),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        status: "closed",
        session_id: session.id,
        message: `Attendance closed at ${closeTime?.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      },
    });
  } catch (error) {
    console.error("Attendance status error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to check attendance status" } },
      { status: 500 }
    );
  }
}
