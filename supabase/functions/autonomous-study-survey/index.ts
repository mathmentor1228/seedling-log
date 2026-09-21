// AUTONOMOUS-STUDY-SURVEY-V1: 추석 연휴 자습 희망 시간 조사
// - anon이 submit 가능
// - 집계(counts)만 익명 공개, 원본 rows는 authenticated만
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const SURVEY_DATES = ['2026-09-24', '2026-09-25', '2026-09-26'];
const START_HOUR = 9;
const END_HOUR = 19;

function validSlot(date: string, start: string, end: string): boolean {
  if (!SURVEY_DATES.includes(date)) return false;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (
    Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)
  ) return false;
  if (sh < START_HOUR || eh > END_HOUR) return false;
  if (sh >= eh) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const action = clean(body?.action, 30);

    if (action === 'counts') {
      const { data, error } = await supabase.rpc('autonomous_study_survey_counts', {
        _from_date: SURVEY_DATES[0],
        _to_date: SURVEY_DATES[SURVEY_DATES.length - 1],
      });
      if (error) throw error;
      return Response.json({ dates: SURVEY_DATES, counts: data }, { headers: corsHeaders });
    }

    if (action === 'submit') {
      const name = clean(body?.student_name, 40);
      const grade = clean(body?.grade, 20);
      const phone = clean(body?.phone, 30).replace(/[^0-9]/g, '');
      const selections = Array.isArray(body?.selections) ? body.selections : [];
      const isTest = body?.is_test === true;

      if (name.length < 2 || grade.length < 1) {
        return Response.json({ error: '이름과 학년을 입력해주세요.' }, { status: 400, headers: corsHeaders });
      }

      const validSelections = selections
        .map((s: any) => ({
          survey_date: clean(s?.survey_date, 12),
          start_time: clean(s?.start_time, 10),
          end_time: clean(s?.end_time, 10),
        }))
        .filter((s: any) => validSlot(s.survey_date, s.start_time, s.end_time));

      if (validSelections.length === 0) {
        return Response.json({ error: '최소 하나의 희망 시간을 선택해주세요.' }, { status: 400, headers: corsHeaders });
      }

      const rows = validSelections.map((s: any) => ({
        student_name: name,
        grade,
        phone: phone || null,
        survey_date: s.survey_date,
        start_time: s.start_time,
        end_time: s.end_time,
        is_test: isTest,
      }));

      const { error } = await supabase.from('autonomous_study_surveys').insert(rows);

      if (error) {
        if ((error as any).code === '23505') {
          return Response.json({ error: '이미 신청한 시간대가 포함되어 있습니다.' }, { status: 409, headers: corsHeaders });
        }
        throw error;
      }

      const { data: counts } = await supabase.rpc('autonomous_study_survey_counts', {
        _from_date: SURVEY_DATES[0],
        _to_date: SURVEY_DATES[SURVEY_DATES.length - 1],
      });

      return Response.json({ ok: true, dates: SURVEY_DATES, counts }, { headers: corsHeaders });
    }

    if (action === 'admin_list') {
      const authHeader = req.headers.get('authorization');
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader || '' } } },
      );
      const { data: { user }, error: authError } = await anonClient.auth.getUser();
      if (authError || !user) {
        return Response.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders });
      }

      const { data, error } = await supabase
        .from('autonomous_study_surveys')
        .select('*')
        .in('survey_date', SURVEY_DATES)
        .eq('is_test', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return Response.json({ rows: data }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders });
  } catch (e) {
    console.error('autonomous-study-survey error', e);
    return Response.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500, headers: corsHeaders });
  }
});
