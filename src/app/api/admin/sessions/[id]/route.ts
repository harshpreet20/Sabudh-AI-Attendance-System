import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendNotificationToUsers } from "@/lib/notify";

// Notify a batch's active students that an attendance window just opened.
async function notifyAttendanceOpen(session: {
  batch_id?: string | null;
  topic_taught?: string | null;
}) {
  try {
    if (!session.batch_id) return;
    const service = createServiceClient();
    const { data: students } = await service
      .from("student_profiles")
      .select("auth_user_id")
      .eq("batch_id", session.batch_id)
      .eq("status", "active");

    const userIds = (students ?? [])
      .map((s) => s.auth_user_id as string | null)
      .filter((sid): sid is string => Boolean(sid));

    const topic = session.topic_taught?.trim();
    await sendNotificationToUsers(userIds, {
      type: "attendance_reminder",
      title: "Attendance is open",
      message: topic
        ? `Attendance for "${topic}" is now open. Mark your presence before it closes.`
        : "Attendance is now open. Mark your presence before the window closes.",
      url: "/dashboard/attendance",
    });
  } catch (err) {
    console.error("Attendance-open notification failed:", err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await request.json();
    const { action, ...updateData } = body;

    if (action === "open_attendance") {
      const updatePayload: Record<string, unknown> = {
        status: "attendance_open",
        attendance_open: new Date().toISOString(),
      };
      if (body.attendance_close) {
        updatePayload.attendance_close = body.attendance_close;
      }
      const { data, error } = await supabase
        .from("sessions")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { success: false, error: { code: "UPDATE_FAILED", message: error.message } },
          { status: 500 }
        );
      }

      if (data) await notifyAttendanceOpen(data);

      return NextResponse.json({ success: true, data });
    }

    if (action === "close_attendance") {
      const { data, error } = await supabase
        .from("sessions")
        .update({
          status: "attendance_closed",
          attendance_close: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { success: false, error: { code: "UPDATE_FAILED", message: error.message } },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, data });
    }

    if (action === "cancel") {
      const { data, error } = await supabase
        .from("sessions")
        .update({ status: "cancelled" })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { success: false, error: { code: "UPDATE_FAILED", message: error.message } },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, data });
    }

    const { data, error } = await supabase
      .from("sessions")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "UPDATE_FAILED", message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Session update error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
