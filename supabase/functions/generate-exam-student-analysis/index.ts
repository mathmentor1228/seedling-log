// EXAM-STUDENT-ANALYSIS-V1 — 학생별 시험 분석 "기본 방향" 초안 (vault 19 §11)
// 입력: { result_id }. 재료 = 점수·직전 점수·총 문항·틀린 문항 번호·이유 태그·메모·(분석지가 있으면) 틀린 문항 난도·전체 난도.
// 규칙: 기록에 없는 행동·감정·장면을 만들지 않는다. 숫자 나열 금지. 학원이 어떻게 대응하는지는 AI가 쓰지 않는다(사람이 academy_action_text에 쓴다).
//       호칭은 '아이' 또는 이름(성 제외). 검증 실패 시 1회 재작성, 또 실패하면 저장하지 않고 위반 목록을 돌려준다.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MODEL = 'google/gemini-2.5-flash';
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SCENE = ['연필', '표정', '눈빛', '한숨', '웃음', '미소', '고개', '자세', '목소리', '환하게', '골똘히', '멈칫', '손을'];
const VAGUE = ['전반적으로', '안정적으로', '꾸준히', '항상', '전혀', '완벽', '또래', '다른 학생', '친구들보다', '놀랍게도', '대견하게도', '기특하게도'];
const PROMISE = [/(?<!감사하|좋)겠습니다/, /할 예정/, /예정입니다/, /계획입니다/];
const ACADEMY = [/학원(에서|은|이|의)\s*[^.]*?(하겠|합니다|해 드리|지도|관리|진행|준비|제공|돕)/];
function givenName(n: string) { const s = (n || '').trim().replace(/_.*$/, ''); return s.length >= 3 ? s.slice(1) : s; }

function validate(text: string, name: string): string[] {
  const v: string[] = [];
  const g = givenName(name);
  if (!text || text.length < 150) v.push('TOO_SHORT');
  if (text.length > 700) v.push('TOO_LONG');
  if (text.includes('자녀')) v.push('WORD:자녀');
  if (g && !text.includes(g) && !text.includes('아이')) v.push('NAME_MISSING');
  if (/(^|\n)\s*[-•·]/.test(text)) v.push('BULLETS');
  for (const w of SCENE) if (text.includes(w)) v.push(`SCENE:${w}`);
  for (const w of VAGUE) if (text.includes(w)) v.push(`VAGUE:${w}`);
  for (const p of PROMISE) if (p.test(text)) v.push(`PROMISE:${p.source}`);
  for (const p of ACADEMY) if (p.test(text)) v.push('ACADEMY_ACTION_BY_AI');
  if ((text.match(/\d+점/g) || []).length > 3) v.push('TOO_MANY_SCORES');
  const sentences = text.split(/(?<=[.!?다])\s+/).filter(s => s.trim());
  if (sentences.length > 8) v.push('TOO_MANY_SENTENCES');
  return v;
}

const SYSTEM = `당신은 더멘토학원의 담당 선생님입니다. 학부모께 아이의 이번 학교 시험 결과를 설명하는 짧은 글을 씁니다.

[재료 원칙]
1. 아래 [기록]에 있는 사실만 씁니다. 점수·직전 점수·틀린 문항 수·틀린 이유 태그·문항 난도가 전부입니다. 기록에 없는 행동·표정·감정·수업 장면·노력의 정도는 만들지 않습니다.
2. 틀린 이유는 선생님이 붙인 태그를 근거로 "~로 보입니다", "~에서 시간이 걸린 것으로 보입니다"처럼 제한적으로 해석합니다.
3. **학원이 어떻게 대응할지는 쓰지 않습니다.** "학원에서는 ~하겠습니다", "~지도하겠습니다", "~관리합니다" 같은 문장은 금지입니다. 그 문장은 선생님이 따로 씁니다.

[구조] 4~6문장, 한 단락.
- 첫 문장: 확인된 사실(과목·시험·점수, 직전 대비 변동이 있으면 한 구절). 점수는 한 번만 씁니다. 숫자를 나열하지 않습니다.
- 둘째~넷째: 틀린 문항의 성격(이유 태그·난도 기준)과 제한적 해석. 결론짓는 말("못합니다", "약합니다", "부족합니다") 대신 "~까지는 되고, ~에서 시간이 걸립니다"처럼 어디까지 왔는지를 씁니다. 잘된 부분이 기록에 있으면 먼저 씁니다.
- 마지막: 다음 시험까지 아이가 살펴볼 부분 한 문장(아이가 할 것. 학원이 할 것 아님). 미래 약속("~하겠습니다", "예정입니다") 금지, 현재형.

[호칭·말투] 성을 떼고 "민준이는"처럼 부르거나 "아이"라고 합니다. "자녀"는 쓰지 않습니다. ~합니다 체. 쓰지 않는 말: 전반적으로·안정적으로·꾸준히·항상·전혀·완벽·또래·다른 학생·놀랍게도·대견하게도. 글머리 기호 금지.

출력은 JSON만: {"parent_text": "..."}`;

async function callModel(apiKey: string, user: string, retry?: string) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0.3, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: retry ? `${user}\n\n[재작성 요청] 이전 답안이 다음 규칙에 걸렸습니다: ${retry}. 해당 표현을 빼고 같은 재료로 다시 쓰세요.` : user },
    ] }),
  });
  if (!res.ok) { if (res.status === 429) throw new Error('RATE_LIMIT'); if (res.status === 402) throw new Error('PAYMENT_REQUIRED'); throw new Error(`AI_GATEWAY_${res.status}`); }
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content as string) || '';
  try { const o = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); return typeof o?.parent_text === 'string' ? o.parent_text.trim() : ''; } catch { return ''; }
}

const periodLabel = (year: number | null, period: string | null, type: string | null) => {
  const sem = period ? (period.includes('2') ? '2학기' : '1학기') : '';
  const half = period && /-[ab]$/.test(period) ? (period.endsWith('a') ? '중간고사' : '기말고사') : type === 'midterm' || type === '중간고사' ? '중간고사' : type === 'final' || type === '기말고사' ? '기말고사' : '';
  return [year ? `${year}년` : '', sem, half].filter(Boolean).join(' ');
};
const baseSubject = (s: string) => s.startsWith('수학') || /대수|기하|미적분|확률/.test(s) ? '수학' : s.includes('영어') ? '영어' : s.startsWith('국어') || /화법|문학|독서/.test(s) ? '국어' : s.startsWith('과학') || /물리|화학|생명|지구|통합과학/.test(s) ? '과학' : s;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);
  const authHeader = req.headers.get('Authorization'); if (!authHeader) return json({ error: 'missing_auth' }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser(); if (!user) return json({ error: 'unauthorized' }, 401);
  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
  if (!(roles || []).some((r: { role: string }) => r.role === 'admin' || r.role === 'teacher')) return json({ error: 'forbidden' }, 403);

  let body: Record<string, unknown> = {}; try { body = await req.json(); } catch { /* empty */ }
  const resultId = String(body.result_id || ''); if (!resultId) return json({ error: 'result_id_required' }, 400);

  const { data: r } = await admin.from('student_exam_results').select('id, student_id, subject, exam_type, exam_year, exam_period, actual_score, expected_score, previous_score, grade_at_exam, school_name').eq('id', resultId).maybeSingle();
  if (!r) return json({ error: 'result_not_found' }, 404);
  if (r.actual_score == null) return json({ error: 'score_missing', message: '실점수가 있어야 초안을 만들 수 있습니다.' }, 400);
  const [{ data: st }, { data: items }, { data: tags }, { data: an }] = await Promise.all([
    admin.from('students').select('id, name, school, grade_year').eq('id', r.student_id).maybeSingle(),
    admin.from('exam_result_items').select('item_number, is_wrong, reason_tags, memo').eq('result_id', resultId).eq('is_wrong', true).order('item_number'),
    admin.from('exam_wrong_reason_tags').select('subject, code, label'),
    admin.from('exam_student_analyses').select('id, total_items, academy_action_text, final_text, status').eq('result_id', resultId).maybeSingle(),
  ]);
  if (!st) return json({ error: 'student_not_found' }, 404);
  const wrong = (items || []) as { item_number: number; reason_tags: string[]; memo: string | null }[];
  if (wrong.length === 0) return json({ error: 'no_wrong_items', message: '틀린 문항을 먼저 표시해 주세요. 태그가 하나도 없으면 초안을 만들지 않습니다.' }, 400);
  const tagLabel = new Map(((tags || []) as any[]).map(t => [`${t.subject}|${t.code}`, t.label]));
  const subj = baseSubject(r.subject);
  const label = (code: string) => tagLabel.get(`${subj}|${code}`) || tagLabel.get(`공통|${code}`) || code;
  if (!wrong.some(w => (w.reason_tags || []).length > 0)) return json({ error: 'no_tags', message: '틀린 문항에 이유 태그를 하나 이상 붙여 주세요.' }, 400);

  // 분석지 문항 난도 (같은 학교·학년·과목·회차)
  let diffByItem = new Map<number, string>(); let examDifficulty: string | null = null;
  try {
    const grade = String(r.grade_at_exam || st.grade_year || '').replace(/[^0-9]/g, '');
    const schoolN = String(st.school || r.school_name || '').replace(/(등학교|학교)$/, '');
    const { data: reps } = await admin.from('exam_analysis_reports').select('id, school_name, grade, subject, exam_year, exam_period, exam_type, exam_difficulty').eq('exam_year', r.exam_year).limit(50);
    const rep = ((reps || []) as any[]).find(x => String(x.school_name || '').replace(/(등학교|학교)$/, '') === schoolN && String(x.grade).replace(/[^0-9]/g, '') === grade && baseSubject(x.subject) === subj
      && ((x.exam_period === r.exam_period) || (String(x.exam_period || '').startsWith(r.exam_period?.includes('2') ? '2' : '1') && ((x.exam_type || '').includes('중간') === (r.exam_period || '').endsWith('a')))));
    if (rep) {
      examDifficulty = rep.exam_difficulty || null;
      const { data: ai } = await admin.from('exam_analysis_items').select('item_number, difficulty').eq('report_id', rep.id);
      for (const it of (ai || []) as any[]) if (it.difficulty) diffByItem.set(it.item_number, it.difficulty);
    }
  } catch { diffByItem = new Map(); }

  const g = givenName(st.name);
  const delta = r.previous_score != null ? r.actual_score - r.previous_score : null;
  const wrongLines = wrong.map(w => `- ${w.item_number}번${diffByItem.get(w.item_number) ? ` (난도 ${diffByItem.get(w.item_number)})` : ''}: ${(w.reason_tags || []).map(label).join(', ') || '태그 없음'}${w.memo ? ` — ${w.memo}` : ''}`).join('\n');
  const totalItems = an?.total_items || null;
  const userPrompt = `학생 호칭: "${g}이는" 또는 "아이"
과목: ${r.subject}
시험: ${periodLabel(r.exam_year, r.exam_period, r.exam_type)}
[기록]
- 실점수 ${r.actual_score}점${delta != null ? ` (직전 시험 ${r.previous_score}점, ${delta >= 0 ? '+' : ''}${delta})` : ''}${r.expected_score != null ? ` · 가채점 ${r.expected_score}점` : ''}
- 틀린 문항 ${wrong.length}개${totalItems ? ` / 전체 ${totalItems}문항` : ''}${examDifficulty ? ` · 이번 시험 전체 난도 ${examDifficulty}` : ''}
${wrongLines}

위 기록만으로 학부모께 보내는 글(parent_text)을 JSON으로 작성하세요.`;

  const apiKey = Deno.env.get('LOVABLE_API_KEY'); if (!apiKey) return json({ error: 'LOVABLE_API_KEY_missing' }, 500);
  let text = '', violations: string[] = [], attempts = 0; let retry: string | undefined;
  while (attempts < 2) {
    attempts += 1;
    try { text = await callModel(apiKey, userPrompt, retry); } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 502); }
    violations = text ? validate(text, st.name) : ['EMPTY'];
    if (violations.length === 0) break;
    retry = violations.join(', ');
  }
  if (violations.length > 0) return json({ ok: false, violations, draft: text, attempts });

  const payload = { result_id: resultId, student_id: r.student_id, subject: r.subject, exam_year: r.exam_year, exam_period: r.exam_period, wrong_count: wrong.length, ai_draft: text, updated_at: new Date().toISOString() } as Record<string, unknown>;
  if (!an) { payload.final_text = text; payload.created_by = user.id; payload.status = 'draft'; }
  else if (!an.final_text || an.status === 'draft') payload.final_text = an.final_text && an.final_text !== an.status ? (an.final_text.trim() ? an.final_text : text) : text;
  const { error } = an ? await admin.from('exam_student_analyses').update(payload).eq('id', an.id) : await admin.from('exam_student_analyses').insert(payload);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, draft: text, attempts, wrong_count: wrong.length, difficulty_used: diffByItem.size > 0 });
});
