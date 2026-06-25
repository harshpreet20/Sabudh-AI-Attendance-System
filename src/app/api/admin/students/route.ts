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
    const search = url.searchParams.get("search") || "";
    const status = url.searchParams.get("status");
    const batchId = url.searchParams.get("batch_id");
    const sortBy = url.searchParams.get("sort_by") || "full_name";
    const sortOrder = url.searchParams.get("sort_order") === "desc";

    let query = supabase
      .from("student_profiles")
      .select("*, batches(name)", { count: "exact" })
      .order(sortBy, { ascending: !sortOrder })
      .range((page - 1) * limit, page * limit - 1);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (status) query = query.eq("status", status);
    if (batchId) query = query.eq("batch_id", batchId);

    const { data, count, error } = await query;

    if (error) {
      console.error("Students fetch error:", error);
      return NextResponse.json(
        { success: false, error: { code: "FETCH_FAILED", message: "Failed to fetch students" } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      meta: { total: count || 0, page, limit },
    });
  } catch (error) {
    console.error("Students error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
