import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BodySchema = z.object({ report_id: z.string().uuid() });

const EXAM_TYPE_TO_RESULT: Record<string, string> = {
  중간고사: 'midterm',
  기말고사: 'final',
  수행평가: 'performance',
  기타: 'other',
};

function safeJsonFromAi(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI 응답을 JSON으로 해석하지 못했습니다.');
  }
}

function bandForScore(score: number | null | undefined) {
  if (score == null || Number.isNaN(Number(score))) return '미입력';
  const n = Number(score);
  if (n >= 90) return '90점 이상';
  if (n >= 80) return '80점대';
  if (n >= 70) return '70점대';
  if (n >= 60) return '60점대';
  return '60점 미만';
}

function itemTitle(item: any) {
  return item.unit_name || item.problem_desc || item.question_type || item.source_type || item.content || item.item_type || `${item.item_number}번`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const canManage = (roles || []).some((r: any) => ['admin', 'teacher', 'assistant'].includes(r.role));
    if (!canManage) {
      return new Response(JSON.stringify({ error: '권한이 없습니다.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: report, error: reportError } = await supabase
      .from('exam_analysis_reports')
      .select('*')
      .eq('id', parsed.data.report_id)
      .single();
    if (reportError || !report) throw reportError || new Error('분석보고서를 찾을 수 없습니다.');

    const { data: items, error: itemError } = await supabase
      .from('exam_analysis_items')
      .select('*')
      .eq('report_id', report.id)
      .order('item_number', { ascending: true });
    if (itemError) throw itemError;

    let resultQuery = supabase
      .from('student_exam_results')
      .select('id, student_id, school_name, subject, exam_type, exam_year, exam_period, actual_score, expected_score, review_status, students(id, name, grade, school_level, grade_year)')
      .eq('school_name', report.school_name)
      .eq('subject', report.subject)
      .eq('review_status', 'done');

    const mappedType = EXAM_TYPE_TO_RESULT[report.exam_type] || report.exam_type;
    resultQuery = resultQuery.eq('exam_type', mappedType);
    if (report.exam_year) resultQuery = resultQuery.eq('exam_year', report.exam_year);
    if (report.exam_period) resultQuery = resultQuery.eq('exam_period', report.exam_period);

    const { data: rawResults, error: resultError } = await resultQuery.limit(200);
    if (resultError) throw resultError;

    const results = (rawResults || []).filter((row: any) => {
      const student = row.students;
      return !report.grade || String(student?.grade_year || student?.grade || '').includes(String(report.grade));
    });
    const resultIds = results.map((r: any) => r.id);

    const { data: reviews } = resultIds.length
      ? await supabase.from('exam_reviews').select('id, result_id, earned_score, total_score, overall_comment').in('result_id', resultIds)
      : { data: [] };
    const reviewIds = (reviews || []).map((r: any) => r.id);

    const [{ data: itemReviews }, { data: selfChecks }] = await Promise.all([
      reviewIds.length ? supabase.from('exam_item_reviews').select('review_id, item_number, result, error_types, score_earned, custom_reason').in('review_id', reviewIds) : Promise.resolve({ data: [] }),
      reviewIds.length ? supabase.from('exam_student_self_checks').select('review_id, item_number, self_error_types, self_custom_reason, q_remembered, q_concept_confused, q_academy_helped, q_need_more, q_my_mistake').in('review_id', reviewIds) : Promise.resolve({ data: [] }),
    ]);

    const reviewByResult = new Map((reviews || []).map((r: any) => [r.result_id, r]));
    const studentSummaries = results.map((row: any) => {
      const review: any = reviewByResult.get(row.id);
      const reviewItems = (itemReviews || []).filter((item: any) => item.review_id === review?.id);
      const checks = (selfChecks || []).filter((check: any) => check.review_id === review?.id);
      const score = review?.earned_score ?? row.actual_score ?? row.expected_score ?? null;
      return {
        student_id: row.student_id,
        student_name: row.students?.name || '학생',
        score,
        score_band: bandForScore(score),
        wrong_items: reviewItems.filter((i: any) => i.result === 'wrong' || i.result === 'partial').map((i: any) => ({ item_number: i.item_number, result: i.result, error_types: i.error_types || [], reason: i.custom_reason || null })),
        self_checks: checks.map((c: any) => ({ item_number: c.item_number, confused: c.q_concept_confused, need_more: c.q_need_more, mistake: c.q_my_mistake, error_types: c.self_error_types || [] })),
      };
    });

    const itemStats = (items || []).map((item: any) => {
      const related = (itemReviews || []).filter((r: any) => r.item_number === item.item_number);
      const wrong = related.filter((r: any) => r.result === 'wrong' || r.result === 'partial');
      return {
        item_number: item.item_number,
        title: itemTitle(item),
        difficulty: item.difficulty,
        points: item.points,
        wrong_count: wrong.length,
        attempted_count: related.length,
        wrong_rate: related.length ? Math.round((wrong.length / related.length) * 100) : 0,
        common_errors: [...new Set(wrong.flatMap((r: any) => Array.isArray(r.error_types) ? r.error_types : []))].slice(0, 5),
      };
    });

    const prompt = `아래 시험지 분석보고서와 실제 학생 채점/자가진단 데이터를 바탕으로, 학부모와 학생에게 공개할 수 있는 고도화된 시험 분석 리포트를 작성해줘.

목표:
- 푸는 학생 입장에서 어떤 부분이 어려웠을지 구체적으로 설명
- 점수대별로 지금부터 어떤 학습을 우선하면 좋을지 추천
- 학생별로 오답/점수/자가진단을 반영한 개인 추천 제공
- 과장하지 말고 제공 데이터에 근거해서 작성

시험 정보: ${report.school_name} ${report.grade}학년 ${report.subject} ${report.exam_year}년 ${report.exam_period} ${report.exam_type}
시험 범위: ${report.exam_scope || '-'}
기존 총평: ${report.overall_review || '-'}
문항 분석: ${JSON.stringify(itemStats)}
학생 요약: ${JSON.stringify(studentSummaries)}

반드시 JSON만 반환:
{
  "overall_insights": "시험 전체 총평 500자 이내",
  "difficult_points": [{"title":"어려웠을 포인트", "reason":"왜 어려웠는지", "items":[1,2], "study_tip":"대응 학습"}],
  "score_band_recommendations": [{"band":"90점 이상|80점대|70점대|60점대|60점 미만", "diagnosis":"현재 상태", "priority":"우선 학습", "actions":["실행1","실행2"]}],
  "student_recommendations": [{"student_id":"uuid", "student_name":"이름", "score_band":"점수대", "summary":"개인 요약", "focus_items":[1,2], "recommended_actions":["실행1","실행2"]}]
}`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('AI 설정이 준비되지 않았습니다.');

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: '당신은 중고등 내신 시험 분석을 학부모와 학생이 이해하기 쉽게 작성하는 베테랑 학원 선생님입니다. 반드시 JSON만 반환합니다.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: 'AI 요청이 많습니다. 잠시 후 다시 시도해주세요.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: 'AI 사용 한도가 부족합니다.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error(`AI 분석 실패: ${await aiResp.text()}`);
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    const parsedAi = safeJsonFromAi(content);

    const payload = {
      analysis_report_id: report.id,
      status: 'draft',
      overall_insights: String(parsedAi.overall_insights || ''),
      difficult_points: Array.isArray(parsedAi.difficult_points) ? parsedAi.difficult_points : [],
      score_band_recommendations: Array.isArray(parsedAi.score_band_recommendations) ? parsedAi.score_band_recommendations : [],
      student_recommendations: Array.isArray(parsedAi.student_recommendations) ? parsedAi.student_recommendations : [],
      generated_by: user.id,
      reviewed_by: null,
      published_by: null,
      published_at: null,
    };

    const { data: saved, error: saveError } = await supabase
      .from('exam_deep_analysis_reports')
      .upsert(payload, { onConflict: 'analysis_report_id' })
      .select('*')
      .single();
    if (saveError) throw saveError;

    return new Response(JSON.stringify({ report: saved }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
