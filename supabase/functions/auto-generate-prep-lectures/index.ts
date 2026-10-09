import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUBJECTS = ["수학", "영어", "국어", "과학"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 14);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const { data: schedules, error } = await supa
      .from("school_schedules")
      .select("id, school_name, title, start_date, grade, schedule_type")
      .eq("schedule_type", "exam")
      .gte("start_date", fmt(today))
      .lte("start_date", fmt(horizon));

    if (error) throw error;

    let created = 0;
    let skipped = 0;
    let needsTeacher = 0;

    for (const sch of schedules ?? []) {
      if (!sch.start_date || !sch.school_name) continue;

      // exam day - 1 = 직전특강 날짜
      const examDate = new Date(sch.start_date + "T00:00:00");
      const targetDate = new Date(examDate);
      targetDate.setDate(targetDate.getDate() - 1);

      // Find students of this school (+ grade if specified) who are 재원
      let studentsQ = supa
        .from("students")
        .select("id, name, school, grade_year, school_level")
        .eq("school", sch.school_name)
        .neq("enrollment_status", "퇴원");
      if (sch.grade != null) studentsQ = studentsQ.eq("grade_year", sch.grade);

      const { data: studentsRaw } = await studentsQ;
      if (!studentsRaw || studentsRaw.length === 0) continue;

      // EXAM-PARTICIPANTS-V1: 이 시험(학교·학년·기간)에 미응시로 확정된 학생은 특강 제안에서 뺀다
      let optOut = new Set<string>();
      try {
        const { data: po } = await supa
          .from("exam_cycle_participants")
          .select("student_id, exam_cycles!inner(school_name, grade_year, start_date, end_date)")
          .eq("status", "not_taking")
          .in("student_id", studentsRaw.map((s) => s.id));
        for (const r of (po ?? []) as any[]) {
          const c = r.exam_cycles;
          if (!c) continue;
          const sameSchool = String(c.school_name || "").replace(/(등학교|학교)$/, "") === String(sch.school_name || "").replace(/(등학교|학교)$/, "");
          const sameGrade = sch.grade == null || c.grade_year === sch.grade;
          const overlaps = !c.start_date || !c.end_date || (sch.start_date >= c.start_date && sch.start_date <= c.end_date);
          if (sameSchool && sameGrade && overlaps) optOut.add(r.student_id);
        }
      } catch { optOut = new Set(); }
      const students = studentsRaw.filter((s) => !optOut.has(s.id));
      if (students.length === 0) continue;

      const studentIds = students.map((s) => s.id);

      // Subject mapping
      const { data: mappings } = await supa
        .from("student_subject_teachers")
        .select("student_id, subject, teacher_id")
        .in("student_id", studentIds)
        .in("subject", SUBJECTS);

      for (const subject of SUBJECTS) {
        const subj = (mappings ?? []).filter((m) => m.subject === subject);
        // Group: teacher_id -> student_ids
        const byTeacher = new Map<string, string[]>();
        for (const m of subj) {
          if (!m.teacher_id) continue;
          const arr = byTeacher.get(m.teacher_id) ?? [];
          arr.push(m.student_id);
          byTeacher.set(m.teacher_id, arr);
        }

        if (byTeacher.size === 0) {
          // No teacher mapped: insert a "needs_teacher" placeholder so admin sees it
          const { error: insErr } = await supa
            .from("prep_lecture_proposals")
            .upsert({
              school_schedule_id: sch.id,
              school_name: sch.school_name,
              grade_year: sch.grade,
              school_level: students[0]?.school_level,
              subject,
              teacher_id: null,
              student_ids: studentIds,
              exam_title: sch.title,
              exam_date: fmt(examDate),
              target_date: fmt(targetDate),
              status: "needs_teacher",
            }, { onConflict: "school_schedule_id,subject,teacher_id", ignoreDuplicates: true });
          if (!insErr) needsTeacher++;
          continue;
        }

        for (const [teacherId, sids] of byTeacher) {
          // skip if same row exists
          const { data: existing } = await supa
            .from("prep_lecture_proposals")
            .select("id, status")
            .eq("school_schedule_id", sch.id)
            .eq("subject", subject)
            .eq("teacher_id", teacherId)
            .maybeSingle();

          if (existing) {
            // keep updating student_ids in case roster changed and still pending
            if (existing.status === "pending") {
              await supa
                .from("prep_lecture_proposals")
                .update({ student_ids: sids, exam_title: sch.title })
                .eq("id", existing.id);
            }
            skipped++;
            continue;
          }

          const { error: insErr } = await supa
            .from("prep_lecture_proposals")
            .insert({
              school_schedule_id: sch.id,
              school_name: sch.school_name,
              grade_year: sch.grade,
              school_level: students[0]?.school_level,
              subject,
              teacher_id: teacherId,
              student_ids: sids,
              exam_title: sch.title,
              exam_date: fmt(examDate),
              target_date: fmt(targetDate),
              status: "pending",
            });
          if (!insErr) created++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, created, skipped, needsTeacher, scanned: schedules?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
