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

    const nowKST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const todayStr = `${nowKST.getFullYear()}-${String(nowKST.getMonth()+1).padStart(2,'0')}-${String(nowKST.getDate()).padStart(2,'0')}`;
    
    // D-day: no date cap — always show nearest upcoming exam

    // Fetch all data in parallel
    const [hwRes, lessonRes, attendanceRes, reportRes, vocabSchedRes, vocabResultRes, classStudentsRes, supplRes, examEventsRes, textbookRes] = await Promise.all([
      supabase
        .from("homework_assignments")
        .select("id, content, subject, assigned_date, check_status, result, notes, submitted_at, submission_image_url")
        .eq("student_id", studentId)
        .gte("assigned_date", dateStr)
        .order("assigned_date", { ascending: false })
        .limit(50),
      supabase
        .from("lesson_records")
        .select("id, lesson_date, subject, lesson_range, course, understanding_score, attendance_status, lesson_types, notes, learning_issues, next_lesson_goal")
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
      supabase
        .from("vocab_schedules")
        .select("id, test_date, day_number, book_name, schedule_type")
        .eq("student_id", studentId)
        .gte("test_date", dateStr)
        .order("test_date")
        .limit(30),
      supabase
        .from("vocab_test_results")
        .select("id, test_date, day_number, book_name, score_percent, passed, total_words, correct_words")
        .eq("student_id", studentId)
        .gte("test_date", dateStr)
        .order("test_date", { ascending: false })
        .limit(30),
      supabase
        .from("class_students")
        .select("class_id")
        .eq("student_id", studentId),
      // Upcoming 보충수업 (both draft and submitted lesson records)
      supabase
        .from("lesson_records")
        .select("id, lesson_date, subject, lesson_range, course, lesson_types, notes")
        .eq("student_id", studentId)
        .gte("lesson_date", todayStr)
        .contains("lesson_types", ["보충수업"])
        .order("lesson_date")
        .limit(10),
      // EXAM-DDAY-V2: Fetch all upcoming exam events (no date cap)
      supabase
        .from("academy_events")
        .select("id, title, start_at, end_at")
        .eq("category", "exam")
        .order("start_at"),
      // Textbook unpaid distributions
      supabase
        .from("textbook_distributions")
        .select("id, student_name, total_amount, payment_status, created_at, textbook_orders(textbook_name, subject)")
        .eq("student_id", studentId)
        .eq("payment_status", "미납")
        .order("created_at", { ascending: false }),
    ]);

    // Fetch class schedules for the student's classes
    const classIds = (classStudentsRes.data || []).map((cs: any) => cs.class_id);
    let scheduleItems: any[] = [];
    if (classIds.length > 0) {
      const { data: schedData } = await supabase
        .from("class_schedules")
        .select("day_of_week, start_time, end_time, class_id, is_active, classes(name, subject)")
        .in("class_id", classIds)
        .eq("is_active", true)
        .order("day_of_week")
        .order("start_time");

      scheduleItems = (schedData || []).map((s: any) => ({
        class_name: s.classes?.name || '',
        subject: s.classes?.subject || '',
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
      }));
    }

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
      lesson_types: l.lesson_types || [],
      notes: l.notes || null,
      learning_issues: l.learning_issues || [],
      next_lesson_goal: l.next_lesson_goal || null,
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
        vocab_schedules: vocabSchedRes.data || [],
        vocab_results: vocabResultRes.data || [],
        class_schedule: scheduleItems,
        upcoming_supplements: (supplRes.data || []).map((s: any) => {
          // Extract time from notes: [보충 시간: HH:MM]
          const timeMatch = s.notes?.match(/\[보충 시간:\s*(\d{1,2}:\d{2})\]/);
          // Extract teacher name from notes: [보충 선생님: name]
          const teacherMatch = s.notes?.match(/\[보충 선생님:\s*([^\]]+)\]/);
          return {
            id: s.id,
            date: s.lesson_date,
            subject: s.subject,
            range: s.lesson_range,
            course: s.course,
            time: timeMatch ? timeMatch[1] : null,
            teacher_name: teacherMatch ? teacherMatch[1].trim() : null,
          };
        }),
        // EXAM-DDAY-V1: Filter exam events by student's school and not yet ended
        exam_events: (() => {
          const allExams = examEventsRes.data || [];
          const schoolName = student.school;
          return allExams
            .filter((e: any) => {
              const endDate = (e.end_at || e.start_at).split('T')[0];
              if (endDate < todayStr) return false;
              if (schoolName && !e.title.includes(schoolName)) return false;
              return true;
            })
            .map((e: any) => ({ id: e.id, title: e.title, start_at: e.start_at, end_at: e.end_at }));
        })(),
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
