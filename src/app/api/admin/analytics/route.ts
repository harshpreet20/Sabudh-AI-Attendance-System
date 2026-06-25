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

    const { data: students } = await supabase
      .from("student_profiles")
      .select("id, full_name, attendance_percentage, status, batch_id, present_count, absent_count, total_sessions")
      .eq("status", "active");

    const totalStudents = students?.length || 0;
    const avgAttendance =
      totalStudents > 0
        ? (students!.reduce((sum, s) => sum + Number(s.attendance_percentage || 0), 0) / totalStudents).toFixed(1)
        : "0";

    const eligibleCount = students?.filter((s) => Number(s.attendance_percentage) >= 80).length || 0;
    const atRiskCount = students?.filter((s) => Number(s.attendance_percentage) < 75 && Number(s.attendance_percentage) > 0).length || 0;

    const topStudents = [...(students || [])]
      .sort((a, b) => Number(b.attendance_percentage) - Number(a.attendance_percentage))
      .slice(0, 5);

    const bottomStudents = [...(students || [])]
      .filter((s) => Number(s.total_sessions) > 0)
      .sort((a, b) => Number(a.attendance_percentage) - Number(b.attendance_percentage))
      .slice(0, 5);

    const { data: batches } = await supabase
      .from("batches")
      .select("id, name")
      .eq("status", "active");

    const batchStats = (batches || []).map((batch) => {
      const batchStudents = (students || []).filter((s) => s.batch_id === batch.id);
      const batchAvg =
        batchStudents.length > 0
          ? batchStudents.reduce((sum, s) => sum + Number(s.attendance_percentage || 0), 0) / batchStudents.length
          : 0;
      return {
        batch_id: batch.id,
        batch_name: batch.name,
        student_count: batchStudents.length,
        average_attendance: Number(batchAvg.toFixed(1)),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          total_students: totalStudents,
          average_attendance: Number(avgAttendance),
          certificate_eligible: eligibleCount,
          at_risk: atRiskCount,
        },
        top_students: topStudents,
        bottom_students: bottomStudents,
        batch_comparison: batchStats,
      },
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
