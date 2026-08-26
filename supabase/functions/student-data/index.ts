// STUDENT-APP-V1: Secure data fetching for student app (bypasses RLS via service role)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// AUTOVOCA-SPRINT2-A3: SM-2 망각곡선 한 단어 채점 결과 반영
// 이진 정오답(correct)을 SM-2 quality로 매핑하여 다음 복습일/숙련도를 계산한다.
// prev 가 없으면(첫 학습) 기본값에서 시작한다.
interface MasteryState {
  level: number;          // 0~5 숙련도 (학생 표시용)
  ease_factor: number;
  interval_days: number;
  repetitions: number;
}
function applySM2(prev: MasteryState | null, correct: boolean, nowMs: number): MasteryState & { next_due_at: string } {
  const base: MasteryState = prev ?? { level: 0, ease_factor: 2.5, interval_days: 0, repetitions: 0 };
  // 이진 결과 → quality: 정답 4, 오답 1
  const q = correct ? 4 : 1;
  let { ease_factor, interval_days, repetitions } = base;

  if (q < 3) {
    // 실패 → 반복 카운트 초기화, 다음날 다시
    repetitions = 0;
    interval_days = 1;
  } else {
    if (repetitions === 0) interval_days = 1;
    else if (repetitions === 1) interval_days = 6;
    else interval_days = Math.round(interval_days * ease_factor);
    repetitions += 1;
  }
  // ease factor 갱신 (SM-2 표준식), 최소 1.3
  ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  // 숙련도: 정답 +1, 오답 -1, 0~5 클램프
  const level = Math.max(0, Math.min(5, base.level + (correct ? 1 : -1)));

  const next_due_at = new Date(nowMs + interval_days * 86400000).toISOString();
  return { level, ease_factor, interval_days, repetitions, next_due_at };
}

// DEADLINE-V1: Calculate the next class datetime for a given subject and student's schedule
// Returns the next occurrence of the class (KST), or null if no schedule found
// If skipToday is true, skip classes on the same day (used for homework assigned today)
function getNextClassDatetimeKST(
  schedules: Array<{ day_of_week: number; start_time: string; subject: string }>,
  subject: string,
  nowKST: Date,
  skipToday = false
): Date | null {
  const subjectSchedules = schedules.filter(s => s.subject === subject);
  if (subjectSchedules.length === 0) return null;

  const currentDow = nowKST.getDay(); // 0=Sun
  let closest: Date | null = null;
  const startOffset = skipToday ? 1 : 0;

  for (const sched of subjectSchedules) {
    // Check next 7 days to find the closest upcoming class
    for (let offset = startOffset; offset <= 7; offset++) {
      const targetDow = (currentDow + offset) % 7;
      if (targetDow !== sched.day_of_week) continue;

      const classDate = new Date(nowKST);
      classDate.setDate(classDate.getDate() + offset);
      const [h, m] = sched.start_time.split(':').map(Number);
      classDate.setHours(h, m, 0, 0);

      // Skip if this class time is already past
      if (classDate <= nowKST) continue;

      if (!closest || classDate < closest) {
        closest = classDate;
      }
      break; // Found the nearest occurrence for this schedule
    }
  }

  return closest;
}

// DEADLINE-V1: Get submission deadline = next class start - 5 hours
function getDeadlineFromClassTime(nextClassKST: Date): Date {
  const deadline = new Date(nextClassKST);
  deadline.setHours(deadline.getHours() - 3);
  return deadline;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, student_id, student_token, ...params } = await req.json();

    // Validate required fields
    if (!action || !student_id || !student_token) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate student session
    const { data: sessionData, error: sessionError } = await supabase
      .from('student_accounts')
      .select('student_id, session_token, session_expires_at')
      .eq('student_id', student_id)
      .single();

    if (
      sessionError ||
      !sessionData ||
      sessionData.session_token !== student_token ||
      !sessionData.session_expires_at ||
      new Date(sessionData.session_expires_at).getTime() <= Date.now()
    ) {
      return new Response(
        JSON.stringify({ error: 'Invalid session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DEADLINE-V1: Helper to get student's class schedules with subjects
    async function getStudentClassSchedules() {
      const { data } = await supabase
        .from('class_students')
        .select(`
          class_id,
          classes!inner (
            subject,
            class_schedules!inner (
              day_of_week,
              start_time,
              is_active
            )
          )
        `)
        .eq('student_id', student_id);

      const schedules: Array<{ day_of_week: number; start_time: string; subject: string }> = [];
      if (data) {
        for (const cs of data) {
          const classInfo = cs.classes as any;
          if (classInfo?.class_schedules) {
            for (const sched of classInfo.class_schedules) {
              if (sched.is_active) {
                schedules.push({
                  day_of_week: sched.day_of_week,
                  start_time: sched.start_time,
                  subject: classInfo.subject,
                });
              }
            }
          }
        }
      }
      return schedules;
    }

    // Get current time in KST
    function getNowKST(): Date {
      const now = new Date();
      // Convert to KST by adding offset
      const kstOffset = 9 * 60; // KST is UTC+9
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      return new Date(utcMs + kstOffset * 60000);
    }

    let result: any = null;

    switch (action) {
      case 'dashboard': {
        // Fetch student points
        const { data: studentData } = await supabase
          .from('students')
          .select('total_points')
          .eq('id', student_id)
          .single();

        // Fetch pending homework (last 14 days, unchecked)
        const nowKST = getNowKST();
        const twoWeeksAgoKST = new Date(nowKST);
        twoWeeksAgoKST.setDate(twoWeeksAgoKST.getDate() - 14);
        const twoWeeksAgoStr = `${twoWeeksAgoKST.getFullYear()}-${String(twoWeeksAgoKST.getMonth() + 1).padStart(2, '0')}-${String(twoWeeksAgoKST.getDate()).padStart(2, '0')}`;
        const { data: homeworkData } = await supabase
          .from('homework_assignments')
          .select('id, content, subject, assigned_date, check_status')
          .eq('student_id', student_id)
          .gte('assigned_date', twoWeeksAgoStr)
          .eq('check_status', 'unchecked')
          .order('assigned_date', { ascending: false })
          .limit(5);

        // Fetch upcoming classes
        const { data: classData } = await supabase
          .from('class_students')
          .select(`
            class_id,
            classes!inner (
              name,
              subject,
              class_schedules!inner (
                day_of_week,
                start_time,
                end_time,
                is_active
              )
            )
          `)
          .eq('student_id', student_id);

        const todayKST = getNowKST();
        const dow = todayKST.getDay();
        const upcomingClasses: any[] = [];
        
        if (classData) {
          for (const cs of classData) {
            const classInfo = cs.classes as any;
            if (classInfo?.class_schedules) {
              for (const schedule of classInfo.class_schedules) {
                if (schedule.is_active) {
                  upcomingClasses.push({
                    class_name: classInfo.name,
                    subject: classInfo.subject,
                    day_of_week: schedule.day_of_week,
                    start_time: schedule.start_time,
                    end_time: schedule.end_time,
                  });
                }
              }
            }
          }
        }

        // Sort by day of week relative to today (KST), today's classes come first
        upcomingClasses.sort((a, b) => {
          const aDays = (a.day_of_week - dow + 7) % 7;
          const bDays = (b.day_of_week - dow + 7) % 7;
          return aDays - bDays;
        });

        // Fetch upcoming vocab tests (next 14 days) — use KST dates
        const todayStr = `${todayKST.getFullYear()}-${String(todayKST.getMonth() + 1).padStart(2, '0')}-${String(todayKST.getDate()).padStart(2, '0')}`;
        const futureKST = new Date(todayKST);
        futureKST.setDate(futureKST.getDate() + 14);
        const futureStr = `${futureKST.getFullYear()}-${String(futureKST.getMonth() + 1).padStart(2, '0')}-${String(futureKST.getDate()).padStart(2, '0')}`;

        const [vocabScheduleRes, vocabResultsRes, vocabSettingsRes] = await Promise.all([
          supabase
            .from('vocab_schedules')
            .select('id, test_date, day_number, book_name, schedule_type, test_time')
            .eq('student_id', student_id)
            .gte('test_date', todayStr)
            .lte('test_date', futureStr)
            .order('test_date'),
          supabase
            .from('vocab_test_results')
            .select('id, test_date, day_number, book_name, score_percent, passed, total_words, correct_words')
            .eq('student_id', student_id)
            .gte('test_date', twoWeeksAgoStr)
            .order('test_date', { ascending: false })
            .limit(20),
          supabase
            .from('vocab_settings')
            .select('book_name, current_day_number, cutline_percent, total_days, assigned_teacher')
            .eq('student_id', student_id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle(),
        ]);

        // Fetch guerrilla tests for ALL students under the same assigned_teacher
        let guerrillaAlerts: any[] = [];
        const myScheduleGuerrillas = (vocabScheduleRes.data || []).filter((s: any) => s.schedule_type === 'guerrilla');
        
        // Also find guerrilla tests from other students with the same teacher
        const assignedTeacher = vocabSettingsRes.data?.assigned_teacher;
        if (assignedTeacher) {
          // Get all student_ids with the same assigned_teacher
          const { data: sameTeacherSettings } = await supabase
            .from('vocab_settings')
            .select('student_id')
            .eq('assigned_teacher', assignedTeacher)
            .eq('is_active', true);
          
          const allStudentIds = (sameTeacherSettings || []).map((s: any) => s.student_id);
          
          if (allStudentIds.length > 0) {
            const { data: allGuerrillas } = await supabase
              .from('vocab_schedules')
              .select('id, test_date, day_number, book_name, schedule_type, test_time, student_id')
              .in('student_id', allStudentIds)
              .eq('schedule_type', 'guerrilla')
              .gte('test_date', todayStr)
              .lte('test_date', futureStr)
              .order('test_date');
            
            // Deduplicate by test_date + book_name + day_number (same guerrilla test across students)
            const seen = new Set<string>();
            for (const g of (allGuerrillas || [])) {
              const key = `${g.test_date}_${g.book_name}_${g.day_number}`;
              if (!seen.has(key)) {
                seen.add(key);
                guerrillaAlerts.push(g);
              }
            }
          }
        } else {
          // No assigned_teacher — just use own guerrilla schedules
          guerrillaAlerts = myScheduleGuerrillas;
        }

        // Fetch general test schedules for this student
        const { data: testSchedulesData } = await supabase
          .from('test_schedules')
          .select('id, test_date, test_time, subject, test_type, content, notes')
          .eq('student_id', student_id)
          .gte('test_date', todayStr)
          .lte('test_date', futureStr)
          .order('test_date');

        // SUPPLEMENTARY-STUDENT-V1: Fetch supplementary lessons (보충수업) for this student
        const { data: supplementaryData } = await supabase
          .from('lesson_records')
          .select('id, lesson_date, subject, notes, lesson_range, submitted, teacher_id')
          .eq('student_id', student_id)
          .contains('lesson_types', ['보충수업'])
          .gte('lesson_date', twoWeeksAgoStr)
          .lte('lesson_date', futureStr)
          .order('lesson_date', { ascending: true });

        // Get teacher names for supplementary lessons
        let supplementaryLessons: any[] = [];
        if (supplementaryData && supplementaryData.length > 0) {
          const teacherIds = [...new Set(supplementaryData.map((s: any) => s.teacher_id).filter(Boolean))];
          let teacherMap: Record<string, string> = {};
          if (teacherIds.length > 0) {
            const { data: teachers } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', teacherIds);
            if (teachers) {
              for (const t of teachers) {
                teacherMap[t.id] = t.full_name;
              }
            }
          }
          supplementaryLessons = supplementaryData.map((s: any) => {
            // Also extract teacher name from notes as fallback: [보충 선생님: name]
            const teacherMatch = s.notes?.match(/\[보충 선생님:\s*([^\]]+)\]/);
            return {
              ...s,
              teacher_name: teacherMatch ? teacherMatch[1].trim() : (teacherMap[s.teacher_id] || null),
            };
          });
        }

        result = {
          total_points: studentData?.total_points || 0,
          pending_homework: (homeworkData || []).filter((hw: any) => hw.content?.trim() !== '없음'),
          upcoming_classes: upcomingClasses,
          vocab_schedules: vocabScheduleRes.data || [],
          vocab_results: vocabResultsRes.data || [],
          vocab_setting: vocabSettingsRes.data || null,
          guerrilla_alerts: guerrillaAlerts,
          test_schedules: testSchedulesData || [],
          supplementary_lessons: supplementaryLessons,
        };
        break;
      }

      case 'homework_list': {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data, error } = await supabase
          .from('homework_assignments')
          .select('id, content, subject, assigned_date, check_status, result, notes, submitted_at, submission_image_url, homework_type, required_submissions, end_date')
          .eq('student_id', student_id)
          .gte('assigned_date', thirtyDaysAgo.toISOString().split('T')[0])
          .order('assigned_date', { ascending: false });

        // Fetch submission counts for daily homework
        const hwIds = (data || []).filter((hw: any) => hw.homework_type === 'daily' && hw.required_submissions > 1).map((hw: any) => hw.id);
        let submissionCountMap: Record<string, number> = {};
        if (hwIds.length > 0) {
          const { data: submissions } = await supabase
            .from('homework_submissions')
            .select('homework_id')
            .in('homework_id', hwIds)
            .eq('student_id', student_id);
          if (submissions) {
            for (const s of submissions) {
              submissionCountMap[s.homework_id] = (submissionCountMap[s.homework_id] || 0) + 1;
            }
          }
        }

        if (error) throw error;

        // Mark expired homework: assigned > 7 days ago AND newer homework exists for same subject
        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);

        // DEADLINE-V1: Fetch class schedules for deadline calculation
        const classSchedules = await getStudentClassSchedules();
        const nowKST = getNowKST();

        // 2-week threshold: show as "미제출" with no submission prompt
        const twoWeeksAgo = new Date(now);
        twoWeeksAgo.setDate(now.getDate() - 14);

        const homeworkItems = (data || []).map((hw: any) => {
          const assignedDate = new Date(hw.assigned_date);
          const isOlderThan7Days = assignedDate < sevenDaysAgo;
          const isSubmissionClosed = hw.check_status === 'unchecked' && assignedDate < twoWeeksAgo;

          // Check if there's a newer homework for the same subject
          const hasNewerHomework = (data || []).some((other: any) =>
            other.id !== hw.id &&
            other.subject === hw.subject &&
            new Date(other.assigned_date) > assignedDate
          );

          // DEADLINE-V1: Calculate deadline for unchecked homework (skip if submission closed)
          let deadline_at: string | null = null;
          let is_deadline_passed = false;

          // For daily homework with end_date, use end_date for expiration instead of next class
          const isDaily = hw.homework_type === 'daily' && hw.end_date;

          if (hw.check_status === 'unchecked' && !isSubmissionClosed) {
            if (isDaily) {
              // Daily homework: deadline is end of end_date (23:59 KST)
              const endDate = new Date(hw.end_date + 'T23:59:59+09:00');
              deadline_at = endDate.toISOString();
              is_deadline_passed = nowKST > endDate;
            } else {
              // Regular homework: use next class time
              const todayDateStr = `${nowKST.getFullYear()}-${String(nowKST.getMonth() + 1).padStart(2, '0')}-${String(nowKST.getDate()).padStart(2, '0')}`;
              const assignedToday = hw.assigned_date === todayDateStr;
              const nextClass = getNextClassDatetimeKST(classSchedules, hw.subject, nowKST, assignedToday);
              if (nextClass) {
                const deadline = getDeadlineFromClassTime(nextClass);
                deadline_at = deadline.toISOString();
                is_deadline_passed = nowKST >= deadline;
              }
            }
          }

          // Submission count for daily homework
          const submission_count = submissionCountMap[hw.id] || 0;

          return {
            ...hw,
            is_expired: isDaily ? false : (isOlderThan7Days && hasNewerHomework),
            is_submission_closed: isDaily ? is_deadline_passed : isSubmissionClosed,
            deadline_at,
            is_deadline_passed: isDaily ? is_deadline_passed : is_deadline_passed,
            is_no_homework: hw.content?.trim() === '없음',
            submission_count,
          };
        });

        result = { homework: homeworkItems };
        break;
      }

      case 'homework_submission': {
        const { homework_id } = params;
        if (!homework_id) {
          return new Response(
            JSON.stringify({ error: 'Missing homework_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch homework info to check if it's daily with multiple submissions
        const { data: hwInfo } = await supabase
          .from('homework_assignments')
          .select('homework_type, required_submissions, submission_image_url, submitted_at')
          .eq('id', homework_id)
          .eq('student_id', student_id)
          .single();

        if (hwInfo?.homework_type === 'daily' && hwInfo.required_submissions > 1) {
          // Return all submissions from homework_submissions table
          const { data: allSubs } = await supabase
            .from('homework_submissions')
            .select('*')
            .eq('homework_id', homework_id)
            .eq('student_id', student_id)
            .order('submitted_at', { ascending: false });

          result = { 
            submission: (allSubs && allSubs.length > 0) ? allSubs[0] : null,
            submissions: allSubs || [],
            required_submissions: hwInfo.required_submissions,
          };
        } else {
          // Regular homework: return from homework_assignments fields
          result = { 
            submission: hwInfo?.submitted_at ? {
              image_url: hwInfo.submission_image_url,
              submitted_at: hwInfo.submitted_at,
            } : null,
          };
        }
        break;
      }

      // STUDENT-UPLOAD-V2: buckets are private; students upload via service role here
      case 'upload_file': {
        const { bucket, homework_id, content, content_type, ext } = params;
        const ALLOWED_BUCKETS = ['homework-submissions', 'math-questions', 'quiz-submissions', 'vocab-submissions'];
        if (!bucket || !ALLOWED_BUCKETS.includes(bucket) || !content || !content_type) {
          return new Response(
            JSON.stringify({ error: 'Invalid upload request' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Decode base64 payload (accepts raw base64 or data URL)
        let bytes: Uint8Array;
        try {
          const b64 = content.includes(',') ? content.split(',').pop()! : content;
          const binary = atob(b64);
          bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        } catch {
          return new Response(
            JSON.stringify({ error: 'Invalid file content' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const MAX_BYTES = 15 * 1024 * 1024;
        if (bytes.length > MAX_BYTES) {
          return new Response(
            JSON.stringify({ error: 'FILE_TOO_LARGE' }),
            { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const safeExt = String(ext || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'jpg';
        const folder = String(homework_id || 'misc').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || 'misc';
        const path = `${student_id}/${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;

        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(path, bytes, { contentType: content_type, upsert: false });

        if (upErr) {
          console.error('[upload_file] error:', upErr.message);
          return new Response(
            JSON.stringify({ error: 'UPLOAD_FAILED' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Keep the historical public-URL string shape so existing parsers/UI keep working
        const url = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
        result = { path, url, bucket };
        break;
      }

      // STUDENT-UPLOAD-V2: students are anonymous, so signed URLs are issued here
      case 'sign_urls': {
        const { urls } = params;
        if (!Array.isArray(urls)) {
          return new Response(
            JSON.stringify({ error: 'urls must be an array' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const signed: Record<string, string> = {};
        for (const raw of urls.slice(0, 60)) {
          if (typeof raw !== 'string' || !raw) continue;
          const m = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?#]+)/);
          if (!m) continue;
          const bucket = m[1];
          const path = decodeURIComponent(m[2]);
          // Students may only read their own files
          if (!path.startsWith(`${student_id}/`)) continue;
          const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
          if (data?.signedUrl) signed[raw] = data.signedUrl;
        }

        result = { signed };
        break;
      }

      case 'submit_homework': {

        const { homework_id, image_url, submission_text, audio_url } = params;
        if (!homework_id) {
          return new Response(
            JSON.stringify({ error: 'Missing homework_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch homework details
        const { data: hwData } = await supabase
          .from('homework_assignments')
          .select('subject, check_status, assigned_date, homework_type, required_submissions, end_date')
          .eq('id', homework_id)
          .eq('student_id', student_id)
          .single();

        if (!hwData) {
          return new Response(
            JSON.stringify({ error: 'Homework not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const isDaily = hwData.homework_type === 'daily' && hwData.required_submissions > 1;

        // Deadline validation
        if (hwData.check_status === 'unchecked') {
          const nowKST = getNowKST();
          
          if (isDaily && hwData.end_date) {
            // Daily homework: check end_date
            const endDate = new Date(hwData.end_date + 'T23:59:59+09:00');
            if (nowKST > endDate) {
              return new Response(
                JSON.stringify({ error: 'DEADLINE_PASSED', message: '제출 마감 시간이 지났습니다.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } else {
            // Regular homework: check next class deadline
            const classSchedules = await getStudentClassSchedules();
            const todayDateStr = `${nowKST.getFullYear()}-${String(nowKST.getMonth() + 1).padStart(2, '0')}-${String(nowKST.getDate()).padStart(2, '0')}`;
            const assignedToday = hwData.assigned_date === todayDateStr;
            const nextClass = getNextClassDatetimeKST(classSchedules, hwData.subject, nowKST, assignedToday);

            if (nextClass) {
              const deadline = getDeadlineFromClassTime(nextClass);
              if (nowKST >= deadline) {
                return new Response(
                  JSON.stringify({ error: 'DEADLINE_PASSED', message: '제출 마감 시간이 지났습니다.' }),
                  { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
            }
          }
        }

        if (isDaily) {
          // Daily homework: check submission count
          const { data: existingSubs } = await supabase
            .from('homework_submissions')
            .select('id')
            .eq('homework_id', homework_id)
            .eq('student_id', student_id);

          const currentCount = existingSubs?.length || 0;
          if (currentCount >= hwData.required_submissions) {
            return new Response(
              JSON.stringify({ error: 'SUBMISSIONS_COMPLETE', message: '이미 필요한 인증 횟수를 모두 완료했습니다.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Insert into homework_submissions table
          const { error: insertErr } = await supabase
            .from('homework_submissions')
            .insert({
              homework_id,
              student_id,
              image_url: image_url || null,
              submission_note: submission_text || null,
              status: 'pending',
            });

          if (insertErr) throw insertErr;

          // Also update the parent homework_assignments record
          await supabase
            .from('homework_assignments')
            .update({
              submission_image_url: image_url || null,
              submission_text: submission_text || null,
              submission_audio_url: audio_url || null,
              submitted_at: new Date().toISOString(),
            })
            .eq('id', homework_id)
            .eq('student_id', student_id);

          result = { success: true, submission_count: currentCount + 1, required_submissions: hwData.required_submissions };
        } else {
          // Regular homework: overwrite on homework_assignments as before
          // Delete old storage files
          const { data: oldHw } = await supabase
            .from('homework_assignments')
            .select('submission_image_url')
            .eq('id', homework_id)
            .eq('student_id', student_id)
            .single();

          if (oldHw?.submission_image_url) {
            const oldUrls = oldHw.submission_image_url.split(',').map((u: string) => u.trim()).filter(Boolean);
            const pathsToDelete: string[] = [];
            for (const url of oldUrls) {
              const match = url.match(/\/object\/public\/homework-submissions\/(.+)$/);
              if (match) {
                pathsToDelete.push(match[1]);
              }
            }
            if (pathsToDelete.length > 0) {
              await supabase.storage.from('homework-submissions').remove(pathsToDelete);
            }
          }

          const { error } = await supabase
            .from('homework_assignments')
            .update({
              submission_image_url: image_url || null,
              submission_text: submission_text || null,
              submission_audio_url: audio_url || null,
              submitted_at: new Date().toISOString(),
            })
            .eq('id', homework_id)
            .eq('student_id', student_id);

          if (error) throw error;
          result = { success: true };
        }
        break;
      }

      case 'points_history': {
        const { data: studentData } = await supabase
          .from('students')
          .select('total_points')
          .eq('id', student_id)
          .single();

        const { data: historyData } = await supabase
          .from('student_point_history')
          .select('id, points, reason, created_at')
          .eq('student_id', student_id)
          .order('created_at', { ascending: false })
          .limit(50);

        result = {
          total_points: studentData?.total_points || 0,
          history: historyData || [],
        };
        break;
      }

      case 'schedule': {
        const { data, error } = await supabase
          .from('class_students')
          .select(`
            class_id,
            classes!inner (
              name,
              subject,
              teacher_id,
              class_schedules!inner (
                day_of_week,
                start_time,
                end_time,
                is_active
              )
            )
          `)
          .eq('student_id', student_id);

        if (error) throw error;

        const teacherIds = [...new Set(
          (data || [])
            .map((cs: any) => cs.classes?.teacher_id)
            .filter(Boolean)
        )];

        let teacherMap: Record<string, string> = {};
        if (teacherIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', teacherIds);

          teacherMap = (profiles || []).reduce((acc: any, p: any) => {
            acc[p.id] = p.full_name;
            return acc;
          }, {});
        }

        const scheduleItems: any[] = [];
        for (const cs of data || []) {
          const classInfo = cs.classes as any;
          if (classInfo?.class_schedules) {
            for (const sched of classInfo.class_schedules) {
              if (sched.is_active) {
                scheduleItems.push({
                  class_name: classInfo.name,
                  subject: classInfo.subject,
                  teacher_name: classInfo.teacher_id ? teacherMap[classInfo.teacher_id] || null : null,
                  day_of_week: sched.day_of_week,
                  start_time: sched.start_time,
                  end_time: sched.end_time,
                });
              }
            }
          }
        }

        scheduleItems.sort((a, b) => {
          if (a.day_of_week !== b.day_of_week) {
            return a.day_of_week - b.day_of_week;
          }
          return a.start_time.localeCompare(b.start_time);
        });

        result = { schedule: scheduleItems };
        break;
      }

      case 'feedback': {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data, error } = await supabase
          .from('lesson_records')
          .select('id, lesson_date, subject, lesson_range, understanding_score, next_lesson_goal, notes, learning_issues, teacher_id, test_title, test_result_text')
          .eq('student_id', student_id)
          .eq('submitted', true)
          .gte('lesson_date', thirtyDaysAgo.toISOString().split('T')[0])
          .order('lesson_date', { ascending: false })
          .limit(30);

        if (error) throw error;

        const teacherIds = [...new Set((data || []).map((d: any) => d.teacher_id).filter(Boolean))];
        let teacherMap: Record<string, string> = {};

        if (teacherIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', teacherIds);

          teacherMap = (profiles || []).reduce((acc: any, p: any) => {
            acc[p.id] = p.full_name;
            return acc;
          }, {});
        }

        const feedbackData = (data || []).map((d: any) => ({
          id: d.id,
          lesson_date: d.lesson_date,
          subject: d.subject,
          lesson_range: d.lesson_range,
          understanding_score: d.understanding_score,
          next_lesson_goal: d.next_lesson_goal,
          notes: d.notes,
          learning_issues: d.learning_issues,
          teacher_name: d.teacher_id ? teacherMap[d.teacher_id] || null : null,
          // PLAN-LESSON-SYNC-V1: 테스트 내용·결과도 학습일지에 표기
          test_title: d.test_title,
          test_result_text: d.test_result_text,
        }));

        result = { feedback: feedbackData };
        break;
      }

      case 'weekly_reports': {
        // Fetch recent weekly reports for this student (last 8 weeks)
        const { data, error } = await supabase
          .from('weekly_reports')
          .select('id, week_start, week_end, total_lessons, avg_understanding, homework_completion_rate, risk_level, student_message, summary, subject_breakdown, generated_at')
          .eq('student_id', student_id)
          .order('week_start', { ascending: false })
          .limit(8);

        if (error) throw error;

        result = { reports: data || [] };
        break;
      }

      case 'exam_reviews': {
        const requestedExamYear = params?.exam_year != null && Number.isFinite(Number(params.exam_year))
          ? Number(params.exam_year)
          : null;
        const { data: studentRow, error: studentError } = await supabase
          .from('students')
          .select('school, grade, grade_year')
          .eq('id', student_id)
          .single();
        if (studentError) throw studentError;

        const { data: results, error: resultError } = await supabase
          .from('student_exam_results')
          .select('id, subject, exam_type, exam_date, exam_year, exam_period, actual_score, expected_score, review_status, school_name, submitted_at')
          .eq('student_id', student_id)
          .order('exam_date', { ascending: false, nullsFirst: false })
          .order('submitted_at', { ascending: false });

        if (resultError) throw resultError;

        const resultIds = (results || []).map((row: any) => row.id);

        const [{ data: photoRows, error: photoError }, { data: reviewRows, error: reviewError }] = await Promise.all([
          resultIds.length > 0
            ? supabase
                .from('student_exam_result_photos')
                .select('id, result_id, storage_path, sort_order')
                .in('result_id', resultIds)
                .order('sort_order', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          resultIds.length > 0
            ? supabase
                .from('exam_reviews')
                .select('id, result_id, earned_score, total_score, overall_comment, reviewed_at, reviewed_by_name, created_at, template_id, self_check_completed, self_check_completed_at, self_check_points_given, is_published, published_at')
                .in('result_id', resultIds)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (photoError) throw photoError;
        if (reviewError) throw reviewError;

        const resultIdsWithPhotos = new Set((photoRows || []).map((photo: any) => photo.result_id));
        const photoBackedResults = (results || []).filter((row: any) => resultIdsWithPhotos.has(row.id));
        const submittedExamYears = [...new Set(photoBackedResults.map((row: any) => row.exam_year).filter((year: any) => year != null))]
          .sort((a: any, b: any) => Number(b) - Number(a));
        const selectedExamYear = requestedExamYear && submittedExamYears.includes(requestedExamYear)
          ? requestedExamYear
          : (submittedExamYears[0] ?? null);
        const filteredPhotoBackedResults = selectedExamYear != null
          ? photoBackedResults.filter((row: any) => row.exam_year === selectedExamYear)
          : photoBackedResults;

        const reviewIds = (reviewRows || []).map((row: any) => row.id);
        const templateIds = [...new Set((reviewRows || []).map((r: any) => r.template_id).filter(Boolean))];

        const [{ data: itemRows, error: itemError }, { data: selfCheckRows }, { data: templateRows }] = await Promise.all([
          reviewIds.length > 0
            ? supabase
                .from('exam_item_reviews')
                .select('id, review_id, item_number, result, error_types, item_comment, score_earned, page_number, custom_reason')
                .in('review_id', reviewIds)
                .order('item_number', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          reviewIds.length > 0
            ? supabase
                .from('exam_student_self_checks')
                .select('id, review_id, item_number, self_error_types, self_custom_reason, q_remembered, q_concept_confused, q_academy_helped, q_need_more, q_my_mistake')
                .in('review_id', reviewIds)
            : Promise.resolve({ data: [] }),
          templateIds.length > 0
            ? supabase
                .from('exam_score_templates')
                .select('id, error_types, items')
                .in('id', templateIds)
            : Promise.resolve({ data: [] }),
        ]);

        if (itemError) throw itemError;

        const templateMap = new Map<string, any>();
        for (const t of templateRows || []) templateMap.set(t.id, t);

        const selfCheckMap = new Map<string, any[]>();
        for (const sc of selfCheckRows || []) {
          const list = selfCheckMap.get(sc.review_id) || [];
          list.push(sc);
          selfCheckMap.set(sc.review_id, list);
        }

        const photoMap = new Map<string, any[]>();
        await Promise.all((photoRows || []).map(async (photo: any) => {
          const { data: signed } = await supabase.storage.from('exam-results').createSignedUrl(photo.storage_path, 3600);
          const list = photoMap.get(photo.result_id) || [];
          list.push({
            id: photo.id,
            storage_path: photo.storage_path,
            sort_order: photo.sort_order,
            signed_url: signed?.signedUrl || null,
          });
          photoMap.set(photo.result_id, list);
        }));

        const itemMap = new Map<string, any[]>();
        for (const item of itemRows || []) {
          const list = itemMap.get(item.review_id) || [];
          list.push({
            id: item.id,
            item_number: item.item_number,
            result: item.result,
            error_types: Array.isArray(item.error_types) ? item.error_types : [],
            item_comment: item.item_comment,
            score_earned: item.score_earned,
            page_number: item.page_number,
            custom_reason: item.custom_reason,
          });
          itemMap.set(item.review_id, list);
        }

        const latestReviewByResult = new Map<string, any>();
        for (const review of reviewRows || []) {
          if (!latestReviewByResult.has(review.result_id)) {
            const tpl = review.template_id ? templateMap.get(review.template_id) : null;
            const isPublished = !!review.is_published;
            // Only expose teacher analysis (per-item results, error types, comments) AFTER principal published.
            // Self-check is always available so the student can fill it in.
            const rawItems = itemMap.get(review.id) || [];
            // Student always needs to know which items are wrong/partial so they can do self-check.
            // Hide only teacher's analysis (error_types, item_comment, custom_reason) until principal publishes.
            const sanitizedItems = isPublished
              ? rawItems
              : rawItems.map((item: any) => ({
                  id: item.id,
                  item_number: item.item_number,
                  result: item.result,
                  error_types: [],
                  item_comment: null,
                  score_earned: item.score_earned,
                  page_number: item.page_number,
                  custom_reason: null,
                }));
            latestReviewByResult.set(review.result_id, {
              id: review.id,
              earned_score: isPublished ? review.earned_score : null,
              total_score: isPublished ? review.total_score : null,
              overall_comment: isPublished ? review.overall_comment : null,
              reviewed_at: review.reviewed_at,
              reviewed_by_name: review.reviewed_by_name,
              is_published: isPublished,
              published_at: review.published_at,
              self_check_completed: review.self_check_completed || false,
              self_check_completed_at: review.self_check_completed_at,
              self_check_points_given: review.self_check_points_given || false,
              exam_item_reviews: sanitizedItems,
              self_checks: selfCheckMap.get(review.id) || [],
              template: tpl ? {
                id: tpl.id,
                error_types: Array.isArray(tpl.error_types) ? tpl.error_types : [],
                items: Array.isArray(tpl.items) ? tpl.items : [],
              } : null,
            });
          }
        }

        let schoolReportQuery = studentRow?.school
          ? supabase
              .from('school_exam_reports')
              .select('*')
              .eq('school_name', studentRow.school)
              .eq('published', true)
          : null;
        if (schoolReportQuery && selectedExamYear != null) schoolReportQuery = schoolReportQuery.eq('exam_year', selectedExamYear);
        const { data: schoolReport, error: schoolReportError } = schoolReportQuery
          ? await schoolReportQuery.order('created_at', { ascending: false }).limit(1).maybeSingle()
          : { data: null, error: null };
        if (schoolReportError) throw schoolReportError;

        const gradeKey = String(studentRow?.grade_year || studentRow?.grade || '');
        let deepReportQuery = studentRow?.school && selectedExamYear != null
          ? supabase
              .from('exam_deep_analysis_reports')
              .select('id, analysis_report_id, status, overall_insights, difficult_points, score_band_recommendations, student_recommendations, published_at, exam_analysis_reports!inner(school_name, grade, subject, exam_type, exam_year, exam_period, exam_scope)')
              .eq('status', 'published')
              .eq('exam_analysis_reports.school_name', studentRow.school)
              .eq('exam_analysis_reports.grade', gradeKey)
              .eq('exam_analysis_reports.exam_year', selectedExamYear)
          : null;
        const { data: deepReports, error: deepReportError } = deepReportQuery
          ? await deepReportQuery.order('published_at', { ascending: false }).limit(10)
          : { data: [], error: null };
        if (deepReportError) throw deepReportError;

        // EXAM-ANALYSIS-PUBLIC-V1: published analysis reports for this student (school + grade + subject)
        let publishedAnalysis: any[] = [];
        try {
          const { data: pubRows } = await supabase.rpc('get_published_analysis_for_student', { _student_id: student_id });
          publishedAnalysis = (pubRows || []).map((r: any) => ({
            id: r.id,
            school_name: r.school_name,
            grade: r.grade,
            subject: r.subject,
            exam_type: r.exam_type,
            exam_year: r.exam_year,
            exam_period: r.exam_period,
            exam_scope: r.exam_scope,
            textbook: r.textbook,
            avg_score: r.avg_score,
            exam_difficulty: r.exam_difficulty,
            overall_review: r.overall_review,
            card_image_paths: Array.isArray(r.card_image_paths) ? r.card_image_paths : [],
            student_message: r.student_message,
            parent_message: r.parent_message,
            published_at: r.published_at,
            updated_at: r.updated_at,
          }));
        } catch (_e) { publishedAnalysis = []; }

        result = {
          available_years: submittedExamYears,
          selected_exam_year: selectedExamYear,
          school_report: schoolReport || null,
          published_analysis_reports: publishedAnalysis,
          deep_reports: (deepReports || []).map((report: any) => ({
            ...report,
            my_recommendation: Array.isArray(report.student_recommendations)
              ? report.student_recommendations.find((item: any) => item.student_id === student_id) || null
              : null,
          })),
          reviews: filteredPhotoBackedResults.map((row: any) => ({
            ...row,
            student_exam_result_photos: photoMap.get(row.id) || [],
            exam_reviews: latestReviewByResult.has(row.id) ? [latestReviewByResult.get(row.id)] : [],
          })),
        };
        break;
      }

      case 'save_exam_self_check': {
        const { review_id, item_number, answers } = params as any;
        if (!review_id || typeof item_number !== 'number' || !answers) {
          return new Response(JSON.stringify({ error: 'Missing review_id/item_number/answers' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data: rev } = await supabase
          .from('exam_reviews')
          .select('id, reviewed_at, self_check_completed, student_exam_results!inner(student_id, review_status)')
          .eq('id', review_id)
          .maybeSingle();
        if (!rev || (rev as any).student_exam_results?.student_id !== student_id) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (!(rev as any).reviewed_at || (rev as any).student_exam_results?.review_status !== 'done') {
          return new Response(JSON.stringify({ error: 'Review is not ready' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if ((rev as any).self_check_completed) {
          return new Response(JSON.stringify({ error: 'Already completed' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const payload = {
          review_id,
          student_id,
          item_number,
          self_error_types: Array.isArray(answers.selfErrorTypes) ? answers.selfErrorTypes : [],
          self_custom_reason: answers.customReason || null,
          q_remembered: typeof answers.remembered === 'boolean' ? answers.remembered : null,
          q_concept_confused: typeof answers.conceptConfused === 'boolean' ? answers.conceptConfused : null,
          q_academy_helped: typeof answers.academyHelped === 'boolean' ? answers.academyHelped : null,
          q_need_more: answers.needMore || null,
          q_my_mistake: Array.isArray(answers.selfErrorTypes) ? answers.selfErrorTypes.join(', ') : null,
        };

        const { data: existing } = await supabase
          .from('exam_student_self_checks')
          .select('id')
          .eq('review_id', review_id)
          .eq('item_number', item_number)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('exam_student_self_checks')
            .update(payload)
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('exam_student_self_checks')
            .insert(payload);
          if (error) throw error;
        }

        result = { success: true };
        break;
      }

      case 'complete_exam_self_check': {
        const { review_id } = params as any;
        if (!review_id) {
          return new Response(JSON.stringify({ error: 'Missing review_id' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data: rev } = await supabase
          .from('exam_reviews')
          .select('id, reviewed_at, self_check_completed, self_check_points_given, student_exam_results!inner(student_id, review_status)')
          .eq('id', review_id)
          .maybeSingle();
        if (!rev || (rev as any).student_exam_results?.student_id !== student_id) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (!(rev as any).reviewed_at || (rev as any).student_exam_results?.review_status !== 'done') {
          return new Response(JSON.stringify({ error: 'Review is not ready' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        await supabase
          .from('exam_reviews')
          .update({
            self_check_completed: true,
            self_check_completed_at: new Date().toISOString(),
          })
          .eq('id', review_id);

        let awarded = 0;
        if (!(rev as any).self_check_points_given) {
          const POINTS = 15;
          const { data: studentRow } = await supabase
            .from('students')
            .select('total_points')
            .eq('id', student_id)
            .maybeSingle();
          const current = (studentRow as any)?.total_points || 0;
          await supabase
            .from('students')
            .update({ total_points: current + POINTS })
            .eq('id', student_id);
          await supabase
            .from('student_point_history')
            .insert({
              student_id,
              points: POINTS,
              reason: '시험지 자가진단 완료',
            });
          await supabase
            .from('exam_reviews')
            .update({ self_check_points_given: true })
            .eq('id', review_id);
          awarded = POINTS;
        }

        result = { success: true, points_awarded: awarded };
        break;
      }

      case 'vocab_cards': {
        const { data: assignmentsData, error: aErr } = await supabase
          .from('student_vocab_assignments')
          .select('word_set_id, required_rounds')
          .eq('student_id', student_id);

        if (aErr) throw aErr;

        const roundsMap: Record<string, number> = {};
        const regularSetIds = (assignmentsData || []).map((a: any) => {
          roundsMap[a.word_set_id] = a.required_rounds || 0;
          return a.word_set_id;
        });

        const { data: openTestAssignments } = await supabase
          .from('vocab_test_assignments')
          .select('id, word_set_ids, test_level, test_time_limit, test_direction, notes, due_date, assigned_at')
          .eq('student_id', student_id)
          .eq('test_mode', 'web')
          .in('status', ['assigned', 'in_progress'])
          .order('updated_at', { ascending: false })
          .limit(1);

        const activeTestAssignment = openTestAssignments?.[0] || null;
        const openTestSetIds = activeTestAssignment?.word_set_ids || [];
        const setIds = [...new Set([...regularSetIds, ...openTestSetIds])];

        // Get completions for this student (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: completionsData } = await supabase
          .from('vocab_card_completions')
          .select('id, word_set_ids, correct_count, wrong_count, total_count, mode, completed_at')
          .eq('student_id', student_id)
          .gte('completed_at', thirtyDaysAgo.toISOString())
          .order('completed_at', { ascending: false });

        if (setIds.length === 0) {
          result = {
            sets: [],
            completions: completionsData || [],
            test_level: activeTestAssignment?.test_level || 1,
            test_time_limit: activeTestAssignment?.test_time_limit || null,
            active_test_assignment: activeTestAssignment,
          };
          break;
        }

        const { data: setsData } = await supabase
          .from('vocab_word_sets')
          .select('id, title, folder_id')
          .in('id', setIds);

        const folderIds = (setsData || []).map((s: any) => s.folder_id).filter(Boolean);
        let folderMap: Record<string, string> = {};
        if (folderIds.length > 0) {
          const { data: foldersData } = await supabase
            .from('vocab_folders')
            .select('id, name')
            .in('id', folderIds);
          if (foldersData) {
            folderMap = Object.fromEntries(foldersData.map((f: any) => [f.id, f.name]));
          }
        }

        // Paginate to bypass PostgREST 1000-row default limit
        const allWords: any[] = [];
        const PAGE = 1000;
        let from = 0;
        while (true) {
          const { data: pageData, error: wErr } = await supabase
            .from('vocab_word_items')
            .select('set_id, english, meaning, english_definition, sort_order')
            .in('set_id', setIds)
            .order('sort_order')
            .range(from, from + PAGE - 1);
          if (wErr) throw wErr;
          if (!pageData || pageData.length === 0) break;
          allWords.push(...pageData);
          if (pageData.length < PAGE) break;
          from += PAGE;
        }

        const sets = (setsData || []).map((s: any) => ({
          set_id: s.id,
          set_title: s.title,
          folder_name: s.folder_id ? (folderMap[s.folder_id] || null) : null,
          required_rounds: roundsMap[s.id] || 0,
          words: (allWords || []).filter((w: any) => w.set_id === s.id).map((w: any) => ({
            english: w.english,
            meaning: w.meaning,
            english_definition: w.english_definition || null,
          })),
        }));

        const { data: vocabSettingData } = await supabase
          .from('vocab_settings')
          .select('test_level, test_time_limit, enhanced_features_enabled')
          .eq('student_id', student_id)
          .maybeSingle();

        result = {
          sets,
          completions: completionsData || [],
          test_level: activeTestAssignment?.test_level || vocabSettingData?.test_level || 1,
          test_time_limit: activeTestAssignment?.test_time_limit ?? vocabSettingData?.test_time_limit ?? null,
          active_test_assignment: activeTestAssignment,
          // AUTOVOCA-SPRINT2: 학습 강화 기능(숙련도·복습·배지·스트릭 등) 노출 여부. 설정 없으면 OFF
          enhanced_features_enabled: vocabSettingData?.enhanced_features_enabled ?? false,
        };
        break;
      }

      case 'submit_vocab_completion': {
        const {
          word_set_ids, correct_count, wrong_count, total_count, mode, is_self_test, test_source,
          started_at, finished_at, duration_seconds, expected_seconds, self_test_options,
          word_results, // AUTOVOCA-SPRINT2-A2: [{ english, meaning, correct }] per-word 결과(있을 때만 숙련도 갱신)
        } = params;
        if (!word_set_ids || !Array.isArray(word_set_ids)) {
          return new Response(
            JSON.stringify({ error: 'Missing word_set_ids' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Find the student's English teacher for notification
        let teacherId: string | null = null;
        const { data: teacherLink } = await supabase
          .from('student_subject_teachers')
          .select('teacher_id')
          .eq('student_id', student_id)
          .eq('subject', '영어')
          .limit(1)
          .maybeSingle();
        teacherId = teacherLink?.teacher_id || null;

        const { error: insertErr } = await supabase
          .from('vocab_card_completions')
          .insert({
            student_id,
            word_set_ids,
            correct_count: correct_count || 0,
            wrong_count: wrong_count || 0,
            total_count: total_count || 0,
            mode: mode || 'eng_to_kor',
            is_self_test: is_self_test || false,
            test_source: test_source || 'assigned',
            notified_teacher_id: teacherId,
            started_at: started_at || null,
            finished_at: finished_at || null,
            duration_seconds: duration_seconds ?? null,
            expected_seconds: expected_seconds ?? null,
            self_test_options: self_test_options || null,
          });

        if (insertErr) throw insertErr;

        // Get student name for notification
        const { data: studentData } = await supabase
          .from('students')
          .select('name')
          .eq('id', student_id)
          .maybeSingle();
        const studentName = studentData?.name || '학생';

        // AUTOVOCA-SPRINT2-A3: "오늘 복습할 단어"(망각곡선 복습)는 점수가 아닌 학습 습관이므로
        // 교사 알림/수업기록 동기화는 건너뛴다. (숙련도 갱신·완료기록·스트릭 집계는 유지)
        const isSm2Review = mode === 'review_self_test';

        // Send notification to teacher
        if (teacherId && !isSm2Review) {
          const scorePercent = total_count > 0 ? Math.round(((correct_count || 0) / total_count) * 100) : 0;
          const sourceLabel = (is_self_test || test_source === 'self') ? '셀프' : '배정';
          const overTime = duration_seconds && expected_seconds && duration_seconds > expected_seconds;
          const timeLabel = duration_seconds
            ? ` | ⏱ ${duration_seconds}s/${expected_seconds || '-'}s${overTime ? ' 🚨초과' : ''}`
            : '';
          const notifTitle = `📝 ${studentName} 단어 테스트 완료 (${sourceLabel})`;
          const notifMessage = `${correct_count}/${total_count} (${scorePercent}%) | 모드: ${mode || 'eng_to_kor'}${timeLabel}`;

          await supabase.from('teacher_notifications').insert({
            teacher_id: teacherId,
            student_id,
            notification_type: 'vocab_test_result',
            title: notifTitle,
            message: notifMessage,
            metadata: {
              correct_count: correct_count || 0,
              wrong_count: wrong_count || 0,
              total_count: total_count || 0,
              score_percent: scorePercent,
              mode,
              is_self_test: is_self_test || false,
              test_source: test_source || 'assigned',
              word_set_ids,
              started_at: started_at || null,
              finished_at: finished_at || null,
              duration_seconds: duration_seconds ?? null,
              expected_seconds: expected_seconds ?? null,
              over_time: !!overTime,
              self_test_options: self_test_options || null,
            },
          });
        }

        // Auto-sync to lesson_records: find today's English lesson record and update test fields
        const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data: todayLesson } = isSm2Review ? { data: null } : await supabase
          .from('lesson_records')
          .select('id, test_content, test_result_text, test_content_2, test_result_text_2')
          .eq('student_id', student_id)
          .eq('lesson_date', todayKST)
          .eq('subject', '영어')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (todayLesson) {
          const scorePercent = total_count > 0 ? Math.round(((correct_count || 0) / total_count) * 100) : 0;
          const passed = scorePercent >= 80;
          const sourceLabel = (is_self_test || test_source === 'self') ? '[셀프]' : '';
          const testResultText = `${correct_count}/${total_count} (${scorePercent}%)`;

          // Use slot 1 if empty, otherwise slot 2
          if (!todayLesson.test_content && !todayLesson.test_result_text) {
            await supabase.from('lesson_records').update({
              test_content: `${sourceLabel}단어테스트`,
              test_name: `${sourceLabel}단어테스트`,
              test_result_text: testResultText,
              test_result: passed ? 'pass' : 'fail',
              test_date: todayKST,
              english_pass_fail: passed ? 'pass' : 'fail',
              updated_at: new Date().toISOString(),
            }).eq('id', todayLesson.id);
          } else if (!todayLesson.test_content_2 && !todayLesson.test_result_text_2) {
            await supabase.from('lesson_records').update({
              test_content_2: `${sourceLabel}단어테스트`,
              test_name_2: `${sourceLabel}단어테스트`,
              test_result_text_2: testResultText,
              test_result_2: passed ? 'pass' : 'fail',
              test_date_2: todayKST,
              english_pass_fail_2: passed ? 'pass' : 'fail',
              updated_at: new Date().toISOString(),
            }).eq('id', todayLesson.id);
          }
        }

        // AUTOVOCA-SPRINT2-A2/A3: per-word 결과가 오면 단어별 숙련도 + SM-2 스케줄 갱신
        if (Array.isArray(word_results) && word_results.length > 0) {
          try {
            // 같은 단어가 한 세션에 중복 출제될 수 있으므로 word_key 기준으로 병합
            // (정답 우선: 한 번이라도 맞히면 그 단어는 correct 로 처리)
            const byKey: Record<string, { english: string; meaning: string | null; correct: boolean }> = {};
            for (const wr of word_results) {
              const eng = String(wr?.english ?? '').trim();
              if (!eng) continue;
              const key = eng.toLowerCase();
              const correct = !!wr?.correct;
              if (!byKey[key]) {
                byKey[key] = { english: eng, meaning: wr?.meaning ?? null, correct };
              } else {
                byKey[key].correct = byKey[key].correct || correct;
                if (!byKey[key].meaning && wr?.meaning) byKey[key].meaning = wr.meaning;
              }
            }
            const keys = Object.keys(byKey);

            if (keys.length > 0) {
              // 기존 숙련도 로드
              const { data: existingRows } = await supabase
                .from('student_word_mastery')
                .select('word_key, level, ease_factor, interval_days, repetitions, correct_count, wrong_count')
                .eq('student_id', student_id)
                .in('word_key', keys);
              const existingMap: Record<string, any> = {};
              for (const r of existingRows || []) existingMap[r.word_key] = r;

              const nowMs = Date.now();
              const nowIso = new Date(nowMs).toISOString();
              const upserts = keys.map(key => {
                const { english, meaning, correct } = byKey[key];
                const prev = existingMap[key];
                const sm2 = applySM2(
                  prev ? { level: prev.level, ease_factor: prev.ease_factor, interval_days: prev.interval_days, repetitions: prev.repetitions } : null,
                  correct,
                  nowMs,
                );
                return {
                  student_id,
                  word_key: key,
                  english,
                  meaning: meaning ?? prev?.meaning ?? null,
                  level: sm2.level,
                  correct_count: (prev?.correct_count ?? 0) + (correct ? 1 : 0),
                  wrong_count: (prev?.wrong_count ?? 0) + (correct ? 0 : 1),
                  ease_factor: sm2.ease_factor,
                  interval_days: sm2.interval_days,
                  repetitions: sm2.repetitions,
                  last_seen_at: nowIso,
                  next_due_at: sm2.next_due_at,
                  updated_at: nowIso,
                };
              });

              const { error: masteryErr } = await supabase
                .from('student_word_mastery')
                .upsert(upserts, { onConflict: 'student_id,word_key' });
              if (masteryErr) console.error('word mastery upsert error:', masteryErr);
            }
          } catch (e) {
            // 숙련도 갱신 실패가 완료 기록 저장을 막지 않도록 격리
            console.error('word mastery update exception:', e);
          }
        }

        result = { success: true };
        break;
      }

      case 'vocab_mastery': {
        // AUTOVOCA-SPRINT2-A2/A3: 학생 단어별 숙련도 + "오늘 복습할 단어" 큐
        const nowIso = new Date().toISOString();
        const { data: masteryRows } = await supabase
          .from('student_word_mastery')
          .select('word_key, english, meaning, level, correct_count, wrong_count, repetitions, last_seen_at, next_due_at')
          .eq('student_id', student_id)
          .order('next_due_at', { ascending: true, nullsFirst: true });

        const rows = masteryRows || [];
        // 복습 예정(due) 단어: next_due_at 이 지났거나 비어있는 단어
        const dueWords = rows
          .filter((r: any) => !r.next_due_at || r.next_due_at <= nowIso)
          .map((r: any) => ({ english: r.english, meaning: r.meaning, level: r.level }));

        // 숙련도 분포(0~5)
        const levelDist = [0, 0, 0, 0, 0, 0];
        for (const r of rows) {
          const lv = Math.max(0, Math.min(5, r.level ?? 0));
          levelDist[lv] += 1;
        }

        result = {
          mastery: rows,
          total_words: rows.length,
          mastered_count: rows.filter((r: any) => (r.level ?? 0) >= 4).length,
          due_count: dueWords.length,
          due_words: dueWords,
          level_distribution: levelDist,
        };
        break;
      }

      case 'math_quizzes': {
        // Fetch quizzes assigned to this student
        const { data: assignedQuizIds } = await supabase
          .from('math_quiz_assignments')
          .select('quiz_id')
          .eq('student_id', student_id);

        const quizIds = (assignedQuizIds || []).map((a: any) => a.quiz_id);

        let quizzes: any[] = [];
        if (quizIds.length > 0) {
          const { data, error: qErr } = await supabase
            .from('math_concept_quizzes')
            .select('id, concept_id, questions, status, created_at, math_concepts(title, course, grade)')
            .in('status', ['draft', 'published'])
            .in('id', quizIds)
            .order('created_at', { ascending: false });
          if (qErr) throw qErr;
          quizzes = data || [];
        }

        // Fetch student's submissions
        const { data: submissions } = await supabase
          .from('math_quiz_submissions')
          .select('id, quiz_id, status, ai_total_score, ai_total_questions, points_awarded, submitted_at, ai_grading_result, teacher_feedback')
          .eq('student_id', student_id)
          .order('submitted_at', { ascending: false });

        result = { quizzes, submissions: submissions || [] };
        break;
      }

      case 'submit_math_quiz': {
        const { quiz_id, concept_id, image_urls } = params;
        if (!quiz_id || !concept_id || !image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
          return new Response(
            JSON.stringify({ error: 'quiz_id, concept_id, image_urls required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Insert submission
        const { data: submission, error: subErr } = await supabase
          .from('math_quiz_submissions')
          .insert({
            student_id,
            concept_id,
            quiz_id,
            image_urls,
            status: 'submitted',
          })
          .select()
          .single();

        if (subErr) throw subErr;

        // Trigger AI grading in the background so the student upload request can finish quickly.
        const gradeUrl = `${supabaseUrl}/functions/v1/grade-quiz-submission`;
        EdgeRuntime.waitUntil(
          fetch(gradeUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ submission_id: submission.id }),
          }).catch(async (error) => {
            console.error('Background quiz grading failed:', error);
            await supabase
              .from('math_quiz_submissions')
              .update({ status: 'grading_failed', updated_at: new Date().toISOString() })
              .eq('id', submission.id);
          })
        );

        result = {
          submission_id: submission.id,
          grading: null,
          points_awarded: 0,
          status: 'submitted',
        };
        break;
      }

      case 'exam_prep_schedules': {
        const todayStr = getNowKST().toISOString().split('T')[0];
        
        // Get enrollments for this student
        const { data: enrollments } = await supabase
          .from('exam_prep_enrollments')
          .select('id, course_id, status, confirmed_at')
          .eq('student_id', student_id);

        if (!enrollments || enrollments.length === 0) {
          result = [];
          break;
        }

        const courseIds = enrollments.map((e: any) => e.course_id);
        
        // Get courses, sessions, time slots, and slot assignments for this student
        const [coursesRes, sessionsRes] = await Promise.all([
          supabase.from('exam_prep_courses').select('id, subject, title, description, deadline_date, teacher_id').in('id', courseIds),
          supabase.from('exam_prep_sessions').select('*').in('course_id', courseIds).order('session_number'),
        ]);

        const coursesData = coursesRes.data || [];
        const sessionsData = sessionsRes.data || [];

        // Fetch time slots for all sessions
        const sessionIds = sessionsData.map((s: any) => s.id);
        let timeSlotsData: any[] = [];
        let slotStudentsData: any[] = [];
        if (sessionIds.length > 0) {
          const [slotsRes, slotStudRes] = await Promise.all([
            supabase.from('exam_prep_time_slots').select('*').in('session_id', sessionIds).order('slot_order'),
            supabase.from('exam_prep_slot_students').select('*').eq('student_id', student_id),
          ]);
          timeSlotsData = slotsRes.data || [];
          slotStudentsData = slotStudRes.data || [];
        }

        // Get teacher names
        const teacherIds = [...new Set(coursesData.map((c: any) => c.teacher_id).filter(Boolean))];
        let teacherMap: Record<string, string> = {};
        if (teacherIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', teacherIds);
          if (profiles) {
            teacherMap = profiles.reduce((acc: Record<string, string>, p: any) => { acc[p.id] = p.full_name; return acc; }, {});
          }
        }

        // Auto-confirm overdue pending enrollments
        const overdueEnrollmentIds = enrollments
          .filter((e: any) => {
            if (e.status !== 'pending') return false;
            const course = coursesData.find((c: any) => c.id === e.course_id);
            return course && course.deadline_date < todayStr;
          })
          .map((e: any) => e.id);

        if (overdueEnrollmentIds.length > 0) {
          await supabase
            .from('exam_prep_enrollments')
            .update({ status: 'auto_confirmed', confirmed_at: new Date().toISOString() })
            .in('id', overdueEnrollmentIds);
        }

        // Set of slot IDs this student is assigned to
        const studentSlotIds = new Set(slotStudentsData.map((ss: any) => ss.slot_id));

        // Build response grouped by course
        result = coursesData
          .filter((c: any) => {
            const courseSessions = sessionsData.filter((s: any) => s.course_id === c.id);
            return courseSessions.some((s: any) => s.schedule_date >= todayStr);
          })
          .map((c: any) => {
            const enrollment = enrollments.find((e: any) => e.course_id === c.id);
            const isOverdue = enrollment?.status === 'pending' && c.deadline_date < todayStr;
            return {
              course_id: c.id,
              subject: c.subject,
              title: c.title || `${c.subject} 내신 특강`,
              description: c.description,
              deadline_date: c.deadline_date,
              status: isOverdue ? 'auto_confirmed' : (enrollment?.status || 'pending'),
              teacher_name: teacherMap[c.teacher_id] || '미배정',
              sessions: sessionsData
                .filter((s: any) => s.course_id === c.id)
                .map((s: any) => {
                  const sessionSlots = timeSlotsData.filter((ts: any) => ts.session_id === s.id);
                  // Filter to only slots this student is assigned to
                  const mySlots = sessionSlots.filter((ts: any) => studentSlotIds.has(ts.id));
                  return {
                    session_label: s.session_label,
                    schedule_date: s.schedule_date,
                    start_time: s.start_time,
                    end_time: s.end_time,
                    time_slots: mySlots.map((ts: any) => ({
                      start_time: ts.start_time,
                      end_time: ts.end_time,
                    })),
                  };
                }),
            };
          });
        break;
      }

      case 'confirm_exam_prep': {
        const { schedule_id: course_id } = params;
        if (!course_id) {
          return new Response(
            JSON.stringify({ error: 'course_id required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Accept both 'pending' and 'needs_reconfirm' statuses for confirmation
        const { error: updateErr } = await supabase
          .from('exam_prep_enrollments')
          .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), schedule_changed_at: null, change_reason: null })
          .eq('course_id', course_id)
          .eq('student_id', student_id)
          .in('status', ['pending', 'needs_reconfirm']);

        if (updateErr) {
          result = { success: false, error: updateErr.message };
        } else {
          result = { success: true };
        }
        break;
      }

      // STUDY-SESSION-V1: Get today's study sessions for this student
      case 'study_sessions': {
        const todayStr = getNowKST().toISOString().split('T')[0];
        
        const { data: sessionsData } = await supabase
          .from('study_sessions')
          .select('*')
          .eq('student_id', student_id)
          .eq('session_date', todayStr)
          .order('start_time');

        const sessionsList = sessionsData || [];
        
        // Fetch tasks for all sessions
        let sessionsWithTasks = sessionsList.map((s: any) => ({ ...s, tasks: [] as any[] }));
        if (sessionsList.length > 0) {
          const sessionIds = sessionsList.map((s: any) => s.id);
          const { data: tasksData } = await supabase
            .from('study_session_tasks')
            .select('*')
            .in('session_id', sessionIds)
            .order('sort_order');

          const taskMap: Record<string, any[]> = {};
          for (const t of (tasksData || [])) {
            if (!taskMap[t.session_id]) taskMap[t.session_id] = [];
            taskMap[t.session_id].push(t);
          }

          sessionsWithTasks = sessionsList.map((s: any) => ({
            ...s,
            tasks: taskMap[s.id] || [],
          }));
        }

        // VOCAB-TEST-ASSIGN-STUDENT-V1: Fetch pending vocab test assignments
        const { data: vocabAssignments } = await supabase
          .from('vocab_test_assignments')
          .select('*')
          .eq('student_id', student_id)
          .in('status', ['assigned', 'in_progress'])
          .order('assigned_at', { ascending: false });

        let vocabAssignmentsWithSets: any[] = [];
        if (vocabAssignments && vocabAssignments.length > 0) {
          // Gather all unique word_set_ids
          const allSetIds = [...new Set(vocabAssignments.flatMap((a: any) => a.word_set_ids || []))];
          const { data: wordSets } = await supabase
            .from('vocab_word_sets')
            .select('id, title, round_number')
            .in('id', allSetIds);

          const setMap: Record<string, any> = {};
          for (const ws of (wordSets || [])) {
            setMap[ws.id] = ws;
          }

          vocabAssignmentsWithSets = vocabAssignments.map((a: any) => ({
            ...a,
            word_sets: (a.word_set_ids || []).map((id: string) => setMap[id]).filter(Boolean),
          }));
        }

        result = {
          sessions: sessionsWithTasks,
          vocab_assignments: vocabAssignmentsWithSets,
        };
        break;
      }

      case 'start_study_session': {
        const { session_id } = params;
        if (!session_id) {
          return new Response(
            JSON.stringify({ error: 'session_id required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateErr } = await supabase
          .from('study_sessions')
          .update({ 
            status: 'in_progress', 
            actual_start_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', session_id)
          .eq('student_id', student_id);

        result = { success: !updateErr };
        break;
      }

      case 'end_study_session': {
        const { session_id } = params;
        if (!session_id) {
          return new Response(
            JSON.stringify({ error: 'session_id required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateErr } = await supabase
          .from('study_sessions')
          .update({ 
            status: 'completed', 
            actual_end_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', session_id)
          .eq('student_id', student_id);

        result = { success: !updateErr };
        break;
      }

      case 'toggle_study_task': {
        const { task_id, completed } = params;
        if (!task_id) {
          return new Response(
            JSON.stringify({ error: 'task_id required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateErr } = await supabase
          .from('study_session_tasks')
          .update({ 
            is_completed: completed,
            completed_at: completed ? new Date().toISOString() : null,
          })
          .eq('id', task_id);

        result = { success: !updateErr };
        break;
      }

      case 'math_questions_list': {
        const today = new Date().toISOString().slice(0, 10);

        // Get daily count
        const { count: dailyCount } = await supabase
          .from('math_questions')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', student_id)
          .eq('date', today);

        // Get all questions with answers
        const { data: questions } = await supabase
          .from('math_questions')
          .select('*')
          .eq('student_id', student_id)
          .order('created_at', { ascending: false })
          .limit(50);

        // Get answers for those questions
        const questionIds = (questions || []).map((q: any) => q.id);
        let answersMap: Record<string, any[]> = {};
        if (questionIds.length > 0) {
          const { data: answers } = await supabase
            .from('math_answers')
            .select('*')
            .in('question_id', questionIds)
            .order('created_at', { ascending: true });

          for (const a of (answers || [])) {
            if (!answersMap[a.question_id]) answersMap[a.question_id] = [];
            answersMap[a.question_id].push(a);
          }
        }

        const enriched = (questions || []).map((q: any) => ({
          ...q,
          answers: answersMap[q.id] || [],
        }));

        result = { questions: enriched, daily_count: dailyCount || 0 };
        break;
      }

      case 'submit_math_question': {
        const { title: qTitle, description: qDesc, photo_problem_url, photo_solution_url, grade: qGrade, subject: qSubject, source_text } = params;

        if (!qTitle || !photo_problem_url || !photo_solution_url || !qGrade || !qSubject || !source_text) {
          return new Response(
            JSON.stringify({ error: '필수 항목을 모두 입력해주세요' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Daily limit check
        const today = new Date().toISOString().slice(0, 10);
        const { count: todayCount } = await supabase
          .from('math_questions')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', student_id)
          .eq('date', today);

        if ((todayCount || 0) >= 10) {
          return new Response(
            JSON.stringify({ error: '오늘 질문 횟수를 모두 사용했어요 (10/10)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: newQ, error: insertErr } = await supabase
          .from('math_questions')
          .insert({
            student_id,
            title: qTitle,
            description: qDesc || null,
            photo_problem_url,
            photo_solution_url,
            grade: qGrade,
            subject: qSubject,
            source_text,
            status: '대기중',
            date: today,
          })
          .select('id')
          .single();

        if (insertErr) {
          console.error('Insert math question error:', insertErr);
          return new Response(
            JSON.stringify({ error: '질문 저장에 실패했어요' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = { success: true, question_id: newQ.id };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('student-data error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
