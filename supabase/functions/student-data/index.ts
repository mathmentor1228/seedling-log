// STUDENT-APP-V1: Secure data fetching for student app (bypasses RLS via service role)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// DEADLINE-V1: Calculate the next class datetime for a given subject and student's schedule
// Returns the next occurrence of the class (KST), or null if no schedule found
function getNextClassDatetimeKST(
  schedules: Array<{ day_of_week: number; start_time: string; subject: string }>,
  subject: string,
  nowKST: Date
): Date | null {
  const subjectSchedules = schedules.filter(s => s.subject === subject);
  if (subjectSchedules.length === 0) return null;

  const currentDow = nowKST.getDay(); // 0=Sun
  let closest: Date | null = null;

  for (const sched of subjectSchedules) {
    // Check next 7 days to find the closest upcoming class
    for (let offset = 0; offset <= 7; offset++) {
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
  deadline.setHours(deadline.getHours() - 5);
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
      .select('student_id')
      .eq('student_id', student_id)
      .single();

    if (sessionError || !sessionData) {
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

        // Sort by day of week relative to today (KST), exclude past days
        upcomingClasses.sort((a, b) => {
          const aDays = (a.day_of_week - dow + 7) % 7 || 7;
          const bDays = (b.day_of_week - dow + 7) % 7 || 7;
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
            .select('id, test_date, day_number, book_name, schedule_type')
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
            .select('book_name, current_day_number, cutline_percent, total_days')
            .eq('student_id', student_id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle(),
        ]);

        result = {
          total_points: studentData?.total_points || 0,
          pending_homework: homeworkData || [],
          upcoming_classes: upcomingClasses.slice(0, 3),
          vocab_schedules: vocabScheduleRes.data || [],
          vocab_results: vocabResultsRes.data || [],
          vocab_setting: vocabSettingsRes.data || null,
        };
        break;
      }

      case 'homework_list': {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data, error } = await supabase
          .from('homework_assignments')
          .select('id, content, subject, assigned_date, check_status, result, notes, submitted_at, submission_image_url, homework_type')
          .eq('student_id', student_id)
          .gte('assigned_date', thirtyDaysAgo.toISOString().split('T')[0])
          .order('assigned_date', { ascending: false });

        if (error) throw error;

        // Mark expired homework: assigned > 7 days ago AND newer homework exists for same subject
        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);

        // DEADLINE-V1: Fetch class schedules for deadline calculation
        const classSchedules = await getStudentClassSchedules();
        const nowKST = getNowKST();

        const homeworkItems = (data || []).map((hw: any) => {
          const assignedDate = new Date(hw.assigned_date);
          const isOlderThan7Days = assignedDate < sevenDaysAgo;

          // Check if there's a newer homework for the same subject
          const hasNewerHomework = (data || []).some((other: any) =>
            other.id !== hw.id &&
            other.subject === hw.subject &&
            new Date(other.assigned_date) > assignedDate
          );

          // DEADLINE-V1: Calculate deadline for unchecked homework
          let deadline_at: string | null = null;
          let is_deadline_passed = false;

          if (hw.check_status === 'unchecked') {
            const nextClass = getNextClassDatetimeKST(classSchedules, hw.subject, nowKST);
            if (nextClass) {
              const deadline = getDeadlineFromClassTime(nextClass);
              deadline_at = deadline.toISOString();
              is_deadline_passed = nowKST >= deadline;
            }
          }

          return {
            ...hw,
            is_expired: isOlderThan7Days && hasNewerHomework,
            deadline_at,
            is_deadline_passed,
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

        const { data } = await supabase
          .from('homework_submissions')
          .select('*')
          .eq('homework_id', homework_id)
          .eq('student_id', student_id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        result = { submission: data };
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

        // DEADLINE-V1: Server-side deadline validation
        const { data: hwData } = await supabase
          .from('homework_assignments')
          .select('subject, check_status')
          .eq('id', homework_id)
          .eq('student_id', student_id)
          .single();

        if (!hwData) {
          return new Response(
            JSON.stringify({ error: 'Homework not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (hwData.check_status === 'unchecked') {
          const classSchedules = await getStudentClassSchedules();
          const nowKST = getNowKST();
          const nextClass = getNextClassDatetimeKST(classSchedules, hwData.subject, nowKST);

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

        // Fetch old submission to delete previous storage files on re-submission
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
            const { error: delErr } = await supabase.storage
              .from('homework-submissions')
              .remove(pathsToDelete);
            if (delErr) {
              console.warn('Failed to delete old submission files:', delErr.message);
            }
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
          .select('id, lesson_date, subject, lesson_range, understanding_score, next_lesson_goal, notes, learning_issues, teacher_id')
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
        }));

        result = { feedback: feedbackData };
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
