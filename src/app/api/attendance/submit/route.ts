import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isWithinZones, isWithinAnyZone, type GeofenceZone } from "@/lib/geofence";
import { verifyQrToken } from "@/lib/attendance-qr";

const SUSPICIOUS_ACCURACY_THRESHOLD = 1;
const MAX_IP_GPS_DISTANCE_KM = 200;

async function getIpGeolocation(ip: string): Promise<{ lat: number; lon: number; city: string } | null> {
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return null;
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=lat,lon,city,status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "success") return null;
    return { lat: data.lat, lon: data.lon, city: data.city };
  } catch {
    return null;
  }
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    const { session_id, latitude, longitude, location_accuracy, attendance_word, device_fingerprint, qr_token } = body;

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
      .select("id, status, attendance_open, attendance_close, batch_id, attendance_word")
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

    // Attendance is marked when ANY 2 of these checks pass:
    //   1) a valid rotating QR scan, 2) the verification word, 3) being in-location.
    const qrValid = qr_token ? verifyQrToken(qr_token, session_id) : false;
    const wordValid =
      Boolean(session.attendance_word) &&
      typeof attendance_word === "string" &&
      attendance_word.toUpperCase() === (session.attendance_word as string).toUpperCase();

    // Location factor — only evaluated when coordinates are provided.
    let locationValid = false;
    let locationZoneName: string | null = null;
    let locationDistance: number | null = null;
    if (latitude != null && longitude != null) {
      const { data: campusData } = await supabase
        .from("campuses")
        .select("name, latitude, longitude, geofence_radius_meters")
        .eq("status", "active")
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      let zones: GeofenceZone[] = [];
      if (campusData && campusData.length > 0) {
        zones = campusData.map(c => ({
          name: c.name,
          latitude: c.latitude!,
          longitude: c.longitude!,
          radiusMeters: c.geofence_radius_meters ?? 500,
        }));
      }

      const locationCheck = zones.length > 0
        ? isWithinZones(latitude, longitude, zones)
        : isWithinAnyZone(latitude, longitude);
      locationValid = locationCheck.allowed;
      locationZoneName = locationCheck.zone?.name ?? null;
      locationDistance = locationCheck.distance;
    }

    const factorCount =
      (qrValid ? 1 : 0) + (wordValid ? 1 : 0) + (locationValid ? 1 : 0);

    if (factorCount < 2) {
      const have: string[] = [];
      if (qrValid) have.push("QR");
      if (wordValid) have.push("word");
      if (locationValid) have.push("location");

      const todo: string[] = [];
      if (!qrValid) todo.push("scan the QR on the teacher's screen");
      if (!wordValid && session.attendance_word) todo.push("enter the verification word");
      if (!locationValid) {
        todo.push(
          latitude != null && longitude != null && locationDistance != null
            ? `move within range (you're ~${Math.round(locationDistance)}m away)`
            : "enable location"
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NEED_TWO_CHECKS",
            message:
              `Attendance needs any 2 checks — you have ${have.length}` +
              `${have.length ? ` (${have.join(", ")})` : ""}. ` +
              `Also ${todo.slice(0, 2).join(" or ")}.`,
          },
        },
        { status: 400 }
      );
    }

    // Anti-GPS-spoofing (only meaningful when location was provided)
    const spoofFlags: string[] = [];
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";

    if (latitude != null && longitude != null) {
      if (location_accuracy != null && location_accuracy < SUSPICIOUS_ACCURACY_THRESHOLD) {
        spoofFlags.push(`suspicious_accuracy:${location_accuracy}m`);
      }
      const ipGeo = await getIpGeolocation(ip);
      if (ipGeo) {
        const ipGpsDistance = haversineDistanceKm(latitude, longitude, ipGeo.lat, ipGeo.lon);
        if (ipGpsDistance > MAX_IP_GPS_DISTANCE_KM) {
          spoofFlags.push(`ip_mismatch:${Math.round(ipGpsDistance)}km_from_ip_${ipGeo.city}`);
        }
      }
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

    // Device fingerprint duplicate check
    if (device_fingerprint) {
      const { data: fpMatch } = await supabase
        .from("attendance")
        .select("id, student_id")
        .eq("session_id", session_id)
        .eq("device_fingerprint", device_fingerprint)
        .neq("student_id", profile.id)
        .limit(1)
        .maybeSingle();

      if (fpMatch) {
        spoofFlags.push("duplicate_device");
      }
    }

    const userAgent = request.headers.get("user-agent") || "";

    const decisionReason = spoofFlags.length > 0 ? spoofFlags.join("; ") : null;
    const needsReview = spoofFlags.length > 0;

    const { data: attendance, error: insertError } = await supabase
      .from("attendance")
      .insert({
        session_id,
        student_id: profile.id,
        status: needsReview ? "manual_review" : "approved",
        decision: needsReview ? "pending" : "accepted",
        decision_reason: decisionReason,
        submitted_at: now.toISOString(),
        verified_at: needsReview ? null : now.toISOString(),
        browser: userAgent,
        ip_address: ip !== "unknown" ? ip : null,
        latitude,
        longitude,
        location_accuracy: location_accuracy || null,
        location_address: locationZoneName,
        device_fingerprint: device_fingerprint || null,
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
        flagged: needsReview,
        message: needsReview
          ? "Attendance submitted but flagged for manual review."
          : "Attendance recorded successfully",
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
