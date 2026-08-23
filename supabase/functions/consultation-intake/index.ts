import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const clean = (value: unknown, max = 500) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const normalizePhone = (value: unknown) => clean(value, 30).replace(/[^0-9]/g, '');

const allowedTimesForDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const weekday = parsed.getUTCDay();
  if (weekday === 1 || weekday === 3) return ['21:00', '21:30'];
  if (weekday === 2 || weekday === 4) {
    return Array.from({ length: 16 }, (_, index) => {
      const totalMinutes = 10 * 60 + index * 30;
      return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
    });
  }
  return [];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = clean(body?.action, 30);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (action === 'create') {
      const studentName = clean(body.studentName, 60);
      const guardianPhone = normalizePhone(body.guardianPhone);
      const preferredDate = clean(body.preferredDate, 10);
      const preferredTime = clean(body.preferredTime, 5);
      if (studentName.length < 2 || guardianPhone.length < 10 || !allowedTimesForDate(preferredDate).includes(preferredTime)) {
        return Response.json({ error: '필수 정보를 확인해주세요.' }, { status: 400, headers: corsHeaders });
      }

      const subjects = Array.isArray(body.subjects)
        ? body.subjects.map((v: unknown) => clean(v, 20)).filter(Boolean).slice(0, 5)
        : [];
      const { data, error } = await supabase.from('consultation_leads').insert({
        student_name: studentName,
        guardian_name: clean(body.guardianName, 60) || null,
        guardian_phone: guardianPhone,
        school: clean(body.school, 100) || null,
        school_level: clean(body.schoolLevel, 5) || null,
        grade_year: Number(body.gradeYear) || null,
        subjects,
        learning_concern: clean(body.learningConcern, 1200) || null,
        referral_source: clean(body.referralSource, 100) || null,
        preferred_date: preferredDate,
        preferred_time: preferredTime,
      }).select('id, public_token, student_name, school_level, grade_year, preferred_date, preferred_time, guardian_name, guardian_phone, subjects').single();
      if (error) throw error;

      // 예약 접수 자체는 알림 생성 실패와 무관하게 성공시킨다.
      // service role로 첫 관리자 계정을 찾아 기존 관리자 업무함에 한 번만 알린다.
      try {
        const { data: adminRole } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin')
          .limit(1)
          .maybeSingle();
        if (adminRole?.user_id) {
          const grade = `${data.school_level || ''}${data.grade_year || ''}` || '학년 미입력';
          const schedule = [data.preferred_date, data.preferred_time].filter(Boolean).join(' ');
          await supabase.from('admin_office_tasks').insert({
            category: '상담 예약',
            title: `[상담 요청] ${data.student_name} (${grade})`,
            description: [
              `희망 일정: ${schedule || '-'}`,
              `보호자: ${data.guardian_name || '-'} · ${data.guardian_phone}`,
              `희망 과목: ${data.subjects?.join(', ') || '-'}`,
              '상담·등록 파이프라인에서 일정을 확인해주세요.',
            ].join('\n'),
            created_by: adminRole.user_id,
            created_by_name: '상담예약 시스템',
            source_type: 'consultation_lead',
            source_id: data.id,
          });
        }
      } catch (notificationError) {
        console.error('consultation task notification failed', notificationError);
      }
      return Response.json({ token: data.public_token }, { headers: corsHeaders });
    }

    if (action === 'get' || action === 'update-intake') {
      const token = clean(body.token, 80);
      if (!/^[0-9a-f-]{36}$/i.test(token)) {
        return Response.json({ error: '유효하지 않은 링크입니다.' }, { status: 400, headers: corsHeaders });
      }
      if (action === 'get') {
        const { data, error } = await supabase.from('consultation_leads')
          .select('student_name, school, school_level, grade_year, subjects, learning_concern, preferred_date, preferred_time, appointment_at, status')
          .eq('public_token', token).single();
        if (error) throw error;
        return Response.json({ lead: data }, { headers: corsHeaders });
      }

      const { error } = await supabase.from('consultation_leads').update({
        student_phone: normalizePhone(body.studentPhone) || null,
        school: clean(body.school, 100) || null,
        school_level: clean(body.schoolLevel, 5) || null,
        grade_year: Number(body.gradeYear) || null,
        subjects: Array.isArray(body.subjects) ? body.subjects.slice(0, 5) : [],
        learning_concern: clean(body.learningConcern, 1200) || null,
        intake_submitted_at: new Date().toISOString(),
        status: 'intake_complete',
      }).eq('public_token', token).not('status', 'in', '(converted,closed)');
      if (error) throw error;
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    return Response.json({ error: '지원하지 않는 요청입니다.' }, { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error('consultation-intake', error);
    return Response.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500, headers: corsHeaders });
  }
});
