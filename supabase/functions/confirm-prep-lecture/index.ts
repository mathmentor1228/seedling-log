import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  proposal_id: string;
  start_time: string; // HH:MM
  end_time: string;
  classroom_id?: string | null;
  notify_students?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // verify caller
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = (await req.json()) as Body;
    if (!body?.proposal_id || !body.start_time || !body.end_time) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: corsHeaders });
    }

    const { data: prop, error: pErr } = await supa
      .from("prep_lecture_proposals")
      .select("*")
      .eq("id", body.proposal_id)
      .single();
    if (pErr || !prop) throw pErr ?? new Error("proposal not found");

    // permission: teacher own or admin
    const { data: isAdminRow } = await supa
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!isAdminRow;
    if (!isAdmin && prop.teacher_id !== caller.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });
    }
    if (!prop.teacher_id) {
      return new Response(JSON.stringify({ error: "teacher not assigned" }), { status: 400, headers: corsHeaders });
    }
    if (prop.status === "confirmed") {
      return new Response(JSON.stringify({ error: "already confirmed" }), { status: 400, headers: corsHeaders });
    }

    const title = `직전특강 · ${prop.school_name}${prop.grade_year ? ` ${prop.grade_year}학년` : ""} ${prop.subject}`;

    // 1) course
    const { data: course, error: cErr } = await supa
      .from("exam_prep_courses")
      .insert({
        subject: prop.subject,
        teacher_id: prop.teacher_id,
        title,
        description: `${prop.exam_title ?? ""} 직전특강 (시험일 ${prop.exam_date})`,
        deadline_date: prop.target_date,
        school_name: prop.school_name,
        created_by: caller.id,
      })
      .select("id")
      .single();
    if (cErr) throw cErr;

    // 2) session
    const { data: session, error: sErr } = await supa
      .from("exam_prep_sessions")
      .insert({
        course_id: course.id,
        session_number: 1,
        session_label: "직전특강",
        schedule_date: prop.target_date,
        start_time: body.start_time,
        end_time: body.end_time,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    // 3) timeslot
    await supa.from("exam_prep_time_slots").insert({
      session_id: session.id,
      start_time: body.start_time,
      end_time: body.end_time,
      slot_order: 1,
    });

    // 4) enrollments
    const enrolls = (prop.student_ids as string[]).map((sid) => ({
      course_id: course.id,
      student_id: sid,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    }));
    if (enrolls.length > 0) {
      await supa.from("exam_prep_enrollments").insert(enrolls);
    }

    // 5) update proposal
    await supa
      .from("prep_lecture_proposals")
      .update({
        status: "confirmed",
        confirmed_course_id: course.id,
        selected_start_time: body.start_time,
        selected_end_time: body.end_time,
        selected_classroom_id: body.classroom_id ?? null,
        notify_students: !!body.notify_students,
      })
      .eq("id", prop.id);

    // 6) notify
    if (body.notify_students && enrolls.length > 0) {
      const { data: studs } = await supa
        .from("students")
        .select("id, name, parent_phone")
        .in("id", prop.student_ids);
      const msg = `[직전특강 안내] ${prop.school_name} ${prop.subject} 직전특강이 ${prop.target_date} ${body.start_time.slice(0,5)}~${body.end_time.slice(0,5)}에 진행됩니다.`;
      const notifs = (studs ?? [])
        .filter((s) => s.parent_phone)
        .map((s) => ({
          parent_phone: s.parent_phone,
          student_id: s.id,
          message: msg,
          type: "exam_prep",
        }));
      if (notifs.length > 0) {
        await supa.from("parent_notifications").insert(notifs);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, course_id: course.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
