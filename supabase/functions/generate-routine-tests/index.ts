import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const DAY_MAP: Record<number, string> = {
  0: '일',
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const targetDate = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().split('T')[0];

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Server is not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const date = new Date(`${targetDate}T00:00:00+09:00`);
    const dayOfWeek = DAY_MAP[date.getDay()];

    const { data: routines, error: routinesError } = await supabase
      .from('routine_schedules')
      .select('*')
      .eq('is_active', true)
      .eq('auto_create_test', true)
      .contains('days', JSON.stringify([dayOfWeek]));

    if (routinesError) throw routinesError;

    if (!routines?.length) {
      return json({ message: '오늘 루틴 없음' });
    }

    const results: Array<{ routine_id: string; generated: number }> = [];

    for (const routine of routines) {
      const { data: existing, error: existingError } = await supabase
        .from('routine_generation_logs')
        .select('id')
        .eq('routine_id', routine.id)
        .eq('generated_date', targetDate)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) continue;

      const studentIds: string[] = Array.isArray(routine.student_ids) ? routine.student_ids : [];
      const createdIds: string[] = [];

      for (const studentId of studentIds) {
        const { data: existingTest, error: existingTestError } = await supabase
          .from('test_records')
          .select('id')
          .eq('student_id', studentId)
          .eq('test_date', targetDate)
          .eq('subject', routine.subject)
          .maybeSingle();

        if (existingTestError) throw existingTestError;

        if (existingTest) {
          createdIds.push(existingTest.id);
          continue;
        }

        const { data: newTest, error: insertError } = await supabase
          .from('test_records')
          .insert({
            student_id: studentId,
            test_date: targetDate,
            subject: routine.subject,
            teacher_id: routine.teacher_id,
            assistant_id: routine.assistant_id || null,
            room_id: routine.room_id || null,
            content: routine.test_content || routine.template_content || null,
            source: 'routine_auto',
            routine_id: routine.id,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        if (newTest) createdIds.push(newTest.id);
      }

      const { error: logError } = await supabase
        .from('routine_generation_logs')
        .insert({
          routine_id: routine.id,
          generated_date: targetDate,
          student_ids: studentIds,
          test_record_ids: createdIds,
        });

      if (logError) throw logError;

      const { error: updateError } = await supabase
        .from('routine_schedules')
        .update({ last_generated_date: targetDate })
        .eq('id', routine.id);

      if (updateError) throw updateError;

      results.push({
        routine_id: routine.id,
        generated: createdIds.length,
      });
    }

    return json({ success: true, results });
  } catch (e) {
    console.error('[generate-routine-tests]', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
