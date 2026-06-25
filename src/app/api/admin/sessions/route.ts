import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
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

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const status = url.searchParams.get("status");
    const batchId = url.searchParams.get("batch_id");

    let query = supabase
      .from("sessions")
      .select("*, batches(name), classrooms(name)", { count: "exact" })
      .order("session_date", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status) query = query.eq("status", status);
    if (batchId) query = query.eq("batch_id", batchId);

    const { data, count, error } = await query;

    if (error) {
      console.error("Sessions fetch error:", error);
      return NextResponse.json(
        { success: false, error: { code: "FETCH_FAILED", message: "Failed to fetch sessions" } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      meta: { total: count || 0, page, limit },
    });
  } catch (error) {
    console.error("Sessions error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}

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
    const { batch_id, classroom_id, session_date, attendance_open, attendance_close } = body;

    if (!batch_id || !session_date) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "batch_id and session_date are required" } },
        { status: 400 }
      );
    }

    const words = [
      "Galaxy", "Compass", "Banana", "Pixel", "Rocket", "Quantum", "Forest", "Neutron",
      "Lantern", "Mountain", "Crystal", "Thunder", "Dolphin", "Horizon", "Crimson",
      "Velvet", "Phoenix", "Cobalt", "Marble", "Zenith", "Prism", "Canyon", "Eclipse",
      "Falcon", "Glacier", "Jasmine", "Lemon", "Neptune", "Orchid", "Panther",
    ];
    const attendance_word = words[Math.floor(Math.random() * words.length)];

    const { data: session, error: insertError } = await supabase
      .from("sessions")
      .insert({
        batch_id,
        classroom_id: classroom_id || null,
        instructor_id: user.id,
        session_date,
        attendance_open,
        attendance_close,
        attendance_word,
        status: "scheduled",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Session create error:", insertError);
      return NextResponse.json(
        { success: false, error: { code: "INSERT_FAILED", message: "Failed to create session" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    console.error("Session create error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
