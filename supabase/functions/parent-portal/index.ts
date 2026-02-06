import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const action = url.searchParams.get("action");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Action: generate token for a student (POST, admin only)
    if (action === "generate" && req.method === "POST") {
      const { student_id } = await req.json();
      if (!student_id) {
        return new Response(JSON.stringify({ error: "student_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabase
        .from("students")
        .select("parent_token")
        .eq("id", student_id)
        .single();

      if (existing?.parent_token) {
        return new Response(
          JSON.stringify({ token: existing.parent_token }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: tokenData } = await supabase.rpc("generate_parent_token");
      const newToken = tokenData as string;

      const { error: updateError } = await supabase
        .from("students")
        .update({ parent_token: newToken })
        .eq("id", student_id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ token: newToken }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET: fetch parent portal data by token
    if (!token) {
      return new Response(JSON.stringify({ error: "token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, name, school, school_level, grade_year, grade")
      .eq("parent_token", token)
      .single();

    if (studentError || !student) {
      return new Response(
        JSON.stringify({ error: "유효하지 않은 링크입니다." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const studentId = student.id;

    // Date range: last 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const dateStr = fourteenDaysAgo.toISOString().split("T")[0];

    // Fetch all data in parallel
    const [hwRes, lessonRes, attendanceRes, reportRes] = await Promise.all([
      supabase
        .from("homework_assignments")
        .select("id, content, subject, assigned_date, check_status, result, notes")
        .eq("student_id", studentId)
        .gte("assigned_date", dateStr)
        .order("assigned_date", { ascending: false })
        .limit(50),
      supabase
        .from("lesson_records")
        .select("id, lesson_date, subject, lesson_range, course, understanding_score, attendance_status")
        .eq("student_id", studentId)
        .eq("submitted", true)
        .gte("lesson_date", dateStr)
        .order("lesson_date", { ascending: false })
        .limit(50),
      supabase
        .from("attendance")
        .select("id, att_date, status, note")
        .eq("student_id", studentId)
        .gte("att_date", dateStr)
        .order("att_date", { ascending: false })
        .limit(50),
      supabase
        .from("weekly_reports")
        .select("id, week_start, week_end, total_lessons, avg_understanding, homework_completion_rate, risk_level, parent_message, generated_at")
        .eq("student_id", studentId)
        .eq("parent_visible", true)
        .order("week_start", { ascending: false })
        .limit(8),
    ]);

    const homework = hwRes.data || [];
    const rawLessons = lessonRes.data || [];
    const attendance = attendanceRes.data || [];
    const reports = reportRes.data || [];

    // Map lessons
    const lessons = rawLessons.map((l: any) => ({
      id: l.id,
      date: l.lesson_date,
      subject: l.subject,
      range: l.lesson_range,
      course: l.course,
      understanding_score: l.understanding_score,
      attendance_status: l.attendance_status,
    }));

    return new Response(
      JSON.stringify({
        student: {
          name: student.name,
          school: student.school,
          school_level: student.school_level,
          grade_year: student.grade_year,
          grade: student.grade,
        },
        homework,
        lessons,
        attendance: (attendance || []).map((a: any) => ({
          date: a.att_date,
          status: a.status,
          note: a.note,
        })),
        reports,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
