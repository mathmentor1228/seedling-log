import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getKstDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function getKstDayOfWeek(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).formatToParts(utcNoon).find(part => part.type === 'weekday') ? utcNoon.toLocaleString('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }) : utcNoon.getUTCDay());
}

function dayNameToNumber(dayName: string) {
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dayName] ?? 0;
}

function getKstDow(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayName = date.toLocaleDateString('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' });
  return dayNameToNumber(dayName);
}

function normalizeStudentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const targetDate = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : getKstDateString();
    const dayOfWeek = getKstDow(targetDate);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json({ error: 'Server is not configured' }, 500);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: routines, error: routineError } = await supabase
      .from('routine_schedules')
      .select('*')
      .eq('type', 'test')
      .eq('is_active', true)
      .eq('auto_create_test', true)
      .eq('day_of_week', dayOfWeek)
      .or(`last_generated_date.is.null,last_generated_date.neq.${targetDate}`);

    if (routineError) return json({ error: routineError.message }, 500);

    let createdCount = 0;
    const summaries: Array<{ routine_id: string; day: string; student_count: number; test_record_ids: string[] }> = [];

    for (const routine of routines || []) {
      const studentIds = normalizeStudentIds(routine.student_ids);
      if (studentIds.length === 0) continue;

      const records = studentIds.map(studentId => ({
        student_id: studentId,
        teacher_id: routine.teacher_id,
        test_date: targetDate,
        start_time: routine.start_time || null,
        end_time: routine.end_time || null,
        subject: routine.subject || '수학',
        test_type: 'regular',
        content: routine.test_content || routine.template_content || '',
        assistant_name: routine.assistant_name || null,
        room: routine.room || 'general',
        memo: `정기 루틴 자동생성 (${DAY_LABELS[dayOfWeek]}요일)`,
      }));

      const { data: inserted, error: insertError } = await supabase
        .from('test_records')
        .insert(records)
        .select('id');

      if (insertError) throw insertError;

      const testRecordIds = (inserted || []).map((row: { id: string }) => row.id);
      createdCount += testRecordIds.length;

      const { error: logError } = await supabase.from('routine_generation_logs').insert({
        routine_id: routine.id,
        generated_date: targetDate,
        student_ids: studentIds,
        test_record_ids: testRecordIds,
      });
      if (logError) throw logError;

      const { error: updateError } = await supabase
        .from('routine_schedules')
        .update({ last_generated_date: targetDate })
        .eq('id', routine.id);
      if (updateError) throw updateError;

      summaries.push({
        routine_id: routine.id,
        day: DAY_LABELS[dayOfWeek],
        student_count: studentIds.length,
        test_record_ids: testRecordIds,
      });
    }

    return json({ success: true, date: targetDate, routine_count: summaries.length, created_count: createdCount, routines: summaries });
  } catch (error) {
    console.error('[generate-routine-tests]', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
