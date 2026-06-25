import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      const { data, error } = await supabase
        .from("sessions")
        .update({
          status: "attendance_open",
          attendance_open: new Date().toISOString(),
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
