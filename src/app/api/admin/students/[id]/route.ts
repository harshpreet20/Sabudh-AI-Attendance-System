import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendNotification } from "@/lib/notify";

export async function GET(
  _request: NextRequest,
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

    const { data: student, error } = await supabase
      .from("student_profiles")
      .select("*, batches(name, courses(title, attendance_requirement))")
      .eq("id", id)
      .single();

    if (error || !student) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Student not found" } },
        { status: 404 }
      );
    }

    const { data: attendance } = await supabase
      .from("attendance")
      .select("*, sessions(session_date, attendance_word), attendance_scores(*)")
      .eq("student_id", id)
      .order("submitted_at", { ascending: false })
      .limit(50);

    const { data: devices } = await supabase
      .from("student_devices")
      .select("*")
      .eq("student_id", id)
      .order("last_seen", { ascending: false });

    const { data: enrollmentImages } = await supabase
      .from("enrollment_images")
      .select("*")
      .eq("student_id", id);

    const { data: notes } = await supabase
      .from("instructor_notes")
      .select("*")
      .eq("student_id", id)
      .order("created_at", { ascending: false });

    const { data: auditLogs } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("target_table", "student_profiles")
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      success: true,
      data: {
        student,
        attendance: attendance || [],
        devices: devices || [],
        enrollment_images: enrollmentImages || [],
        notes: notes || [],
        audit_logs: auditLogs || [],
      },
    });
  } catch (error) {
    console.error("Student detail error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
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
    const { action, reason, ...updateData } = body;

    const { data: currentStudent } = await supabase
      .from("student_profiles")
      .select("status, full_name")
      .eq("id", id)
      .single();

    if (!currentStudent) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Student not found" } },
        { status: 404 }
      );
    }

    let newStatus = currentStudent.status;

    if (action === "suspend") {
      newStatus = "suspended";
    } else if (action === "restore") {
      newStatus = "active";
    } else if (action === "expel") {
      newStatus = "expelled";
    } else if (action === "archive") {
      newStatus = "archived";
    }

    const updates = action ? { status: newStatus } : updateData;

    const { data: updated, error } = await supabase
      .from("student_profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: "UPDATE_FAILED", message: error.message } },
        { status: 500 }
      );
    }

    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      action: action || "update_profile",
      target_table: "student_profiles",
      target_id: id,
      old_value: { status: currentStudent.status },
      new_value: updates,
      reason: reason || null,
    });

    if ((action === "suspend" || action === "restore") && updated.auth_user_id) {
      await sendNotification({
        userId: updated.auth_user_id,
        type: action === "suspend" ? "account_suspended" : "account_restored",
        title: action === "suspend" ? "Account Suspended" : "Account Restored",
        message:
          action === "suspend"
            ? `Your account has been suspended. ${reason ? `Reason: ${reason}` : "Please contact your administrator."}`
            : "Your account has been restored. You can now log in and mark attendance.",
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Student update error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
