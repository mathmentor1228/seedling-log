// WEEKLY-LETTER-V2 — 주간 학습 편지 생성
// 선생님 말(주간 코멘트 1순위)이 있는 학생은 AI 호출 1번으로 학부모 편지 + 학생 메모를, 없는 학생은 AI 없이 약식(기록만)을 만들어 weekly_reports에 저장한다.
// 검증 실패 시 저장하지 않는다(중립 대체 문안 없음). 공개·발송된 행은 건드리지 않는다.
//
// 요청 (POST, 관리자 JWT 또는 x-cron-key)
//   { week_start: 'YYYY-MM-DD'(월), week_end?: 'YYYY-MM-DD'(기본 +5=토), student_ids?: string[],
//     dry_run?: boolean (재료 점검만, AI·DB 쓰기 없음), force?: boolean (기존 초안 덮어쓰기),
//     skip_facts_only?: boolean (선생님 말 없는 학생의 약식은 만들지 않음) }
// 응답
//   { week_start, week_end, dry_run, ready: [{id,name,mode:'letter'|'facts_only',...}], skipped: [{id,name,reason}], generated: [...], failed: [...], protected: [...], exists: [...] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type LessonRow, type Material,
  collectMaterial, skipReason, letterMode, buildUserPrompt, LETTER_SYSTEM_PROMPT, parseLetterJson,
  validateParentLetter, validateStudentNote, composeParentMessage, composeFactsOnlyMessage, averageUnderstanding,
  homeworkCompletionRate, firstSentence, type LetterMode,
} from './letter.ts';

const ENGINE = 'LETTER_V2';
const MODEL = 'google/gemini-2.5-flash';
const MAX_PER_CALL = 12;
// 주간 코멘트 대상에서 제외하는 선생님 — 영어 이재진. 수업 코멘트가 학부모 포털에 그대로 노출되므로 편지로 갈음한다 (원장 결정 2026-10-09).
// 프런트 src/lib/constants.ts 의 WEEKLY_COMMENT_EXCLUDED_TEACHER_IDS 와 함께 갱신할 것.
const EXCLUDED_TEACHER_IDS = ['916c5055-2a8c-46d8-b84c-fd280d7f541f'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface StudentRow { id: string; name: string; enrollment_status: string }
interface Named { id: string; name: string }

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function callLetterModel(apiKey: string, system: string, user: string, retryNote?: string) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: retryNote ? `${user}\n\n[재작성 요청] 이전 답안이 다음 규칙에 걸렸습니다: ${retryNote}. 해당 표현을 빼고 같은 재료로 다시 쓰세요.` : user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('RATE_LIMIT');
    if (res.status === 402) throw new Error('PAYMENT_REQUIRED');
    throw new Error(`AI_GATEWAY_${res.status}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content as string) || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  // --- 인증: 관리자 JWT 또는 cron 비밀키 ---
  const cronKey = req.headers.get('x-cron-key');
  const cronSecret = Deno.env.get('WEEKLY_LETTER_CRON_SECRET');
  let source = 'manual';
  if (cronKey && cronSecret && cronKey === cronSecret) {
    source = 'cron';
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_auth' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', user.id);
    if (!(roleRows || []).some((r: { role: string }) => r.role === 'admin')) return json({ error: 'forbidden' }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const weekStart = String(body.week_start || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: 'week_start_required' }, 400);
  const weekEnd = /^\d{4}-\d{2}-\d{2}$/.test(String(body.week_end || '')) ? String(body.week_end) : addDays(weekStart, 5);
  const dryRun = body.dry_run === true;
  const force = body.force === true;
  const skipFactsOnly = body.skip_facts_only === true;
  const requestedIds = Array.isArray(body.student_ids) ? (body.student_ids as string[]).filter(Boolean) : null;

  // --- 대상 학생 ---
  let studentsQ = admin.from('students').select('id, name, enrollment_status').order('name');
  studentsQ = requestedIds ? studentsQ.in('id', requestedIds) : studentsQ.in('enrollment_status', ['재학', '재등원']);
  const { data: students, error: sErr } = await studentsQ;
  if (sErr) return json({ error: 'students_load_failed', detail: sErr.message }, 500);
  const studentList = (students || []) as StudentRow[];
  const ids = studentList.map(s => s.id);
  if (ids.length === 0) return json({ week_start: weekStart, week_end: weekEnd, dry_run: dryRun, ready: [], skipped: [], generated: [], failed: [], protected: [], exists: [] });

  // --- 이번 주 제출 일지 (한 번에) ---
  const { data: lessons, error: lErr } = await admin
    .from('lesson_records')
    .select('id, student_id, subject, lesson_date, teacher_id, teacher_display_name, lesson_range, notes, parent_direct_message, learning_issues_note, next_lesson_goal, homework_check_note, homework_status, test_result, test_result_text, test_title, test_name, understanding_score, attendance_status, weekly_summary, weekly_summary_week')
    .in('student_id', ids)
    .gte('lesson_date', weekStart)
    .lte('lesson_date', weekEnd)
    .eq('submitted', true);
  if (lErr) return json({ error: 'lessons_load_failed', detail: lErr.message }, 500);

  const { data: existingRows } = await admin
    .from('weekly_reports')
    .select('id, student_id, parent_visible, parent_sent_status, student_sent_status, debug_info')
    .eq('week_start', weekStart)
    .in('student_id', ids);
  const existing = new Map<string, { id: string; locked: boolean; engine: string }>();
  for (const r of (existingRows || []) as Array<{ id: string; student_id: string; parent_visible: boolean; parent_sent_status: string | null; student_sent_status: string | null; debug_info: string | null }>) {
    existing.set(r.student_id, {
      id: r.id,
      locked: !!r.parent_visible || r.parent_sent_status === 'sent' || r.student_sent_status === 'sent',
      engine: r.debug_info?.startsWith('LETTER_V') ? ENGINE : 'legacy',
    });
  }

  const byStudent = new Map<string, LessonRow[]>();
  for (const l of (lessons || []) as LessonRow[]) {
    const arr = byStudent.get(l.student_id) ?? [];
    arr.push(l);
    byStudent.set(l.student_id, arr);
  }

  const ready: Array<Named & { mode: LetterMode; lines: number; subjects: string[] }> = [];
  const skipped: Array<Named & { reason: string }> = [];
  const protectedRows: Named[] = [];
  const existsRows: Named[] = [];
  const materials = new Map<string, Material>();

  for (const s of studentList) {
    const m = collectMaterial(byStudent.get(s.id) ?? [], EXCLUDED_TEACHER_IDS, weekStart);
    const reason = skipReason(m);
    if (reason) { skipped.push({ id: s.id, name: s.name, reason }); continue; }
    const mode = letterMode(m);
    if (mode === 'facts_only' && skipFactsOnly) { skipped.push({ id: s.id, name: s.name, reason: 'no_teacher_note' }); continue; }
    const ex = existing.get(s.id);
    if (ex?.locked) { protectedRows.push({ id: s.id, name: s.name }); continue; }
    if (ex && !force) { existsRows.push({ id: s.id, name: s.name }); continue; }
    materials.set(s.id, m);
    ready.push({ id: s.id, name: s.name, mode, lines: m.lines.length, subjects: m.subjects.map(x => x.subject) });
  }

  if (dryRun) {
    return json({ week_start: weekStart, week_end: weekEnd, dry_run: true, ready, skipped, generated: [], failed: [], protected: protectedRows, exists: existsRows });
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return json({ error: 'LOVABLE_API_KEY_missing' }, 500);

  const generated: Array<Named & { attempts: number; mode: LetterMode }> = [];
  const failed: Array<Named & { reason: string }> = [];
  const targets = ready.slice(0, MAX_PER_CALL);

  for (const t of targets) {
    const m = materials.get(t.id)!;
    const breakdown = {
      engine: ENGINE,
      mode: t.mode,
      subjects: m.subjects.map(s => ({ subject: s.subject, ranges: s.ranges, homework: s.homework, tests: s.tests })),
      teacher_lines: m.lines,
      excluded_lessons: m.excludedLessons,
    };

    // 약식: 선생님 말이 없으면 AI 없이 헤더 + 기록 카드만 저장
    if (t.mode === 'facts_only') {
      const payload = {
        student_id: t.id,
        week_start: weekStart,
        week_end: weekEnd,
        parent_message: composeFactsOnlyMessage(t.name, weekStart, weekEnd, m),
        student_message: null,
        summary: '📋 기록만 (선생님 코멘트 없음)',
        total_lessons: m.totalLessons,
        avg_understanding: averageUnderstanding(m),
        homework_completion_rate: homeworkCompletionRate(m),
        report_quality_tag: 'FACTS_ONLY',
        risk_level: null,
        parent_visible: false,
        subject_breakdown: breakdown,
        debug_info: `${ENGINE} mode=facts_only lines=${m.lines.length} source=${source}`,
        generated_at: new Date().toISOString(),
      };
      const ex = existing.get(t.id);
      const { error: saveErr } = ex
        ? await admin.from('weekly_reports').update(payload).eq('id', ex.id)
        : await admin.from('weekly_reports').insert(payload);
      if (saveErr) failed.push({ id: t.id, name: t.name, reason: `SAVE_FAILED:${saveErr.message}` });
      else generated.push({ id: t.id, name: t.name, attempts: 0, mode: 'facts_only' });
      continue;
    }

    const userPrompt = buildUserPrompt(t.name, weekStart, weekEnd, m);
    let attempts = 0;
    let retryNote: string | undefined;
    let saved = false;
    let lastReason = 'unknown';
    let firstFail = '';
    while (attempts < 2 && !saved) {
      attempts += 1;
      try {
        const raw = await callLetterModel(apiKey, LETTER_SYSTEM_PROMPT, userPrompt, retryNote);
        const parsed = parseLetterJson(raw);
        if (!parsed) { lastReason = 'JSON_PARSE_FAILED'; retryNote = 'JSON 형식이 아니었습니다'; continue; }
        const pv = validateParentLetter(parsed.parent_letter, t.name);
        const sv = validateStudentNote(parsed.student_note, t.name);
        if (!pv.ok || !sv.ok) {
          const all = [...pv.violations, ...sv.violations.map(v => `student:${v}`)];
          lastReason = all.join(',');
          retryNote = all.join(', ');
          if (!firstFail) firstFail = all.join('|');
          continue;
        }
        const parentMessage = composeParentMessage(t.name, weekStart, weekEnd, parsed.parent_letter, m);
        const payload = {
          student_id: t.id,
          week_start: weekStart,
          week_end: weekEnd,
          parent_message: parentMessage,
          student_message: parsed.student_note,
          summary: `✉ ${firstSentence(parsed.parent_letter)}`,
          total_lessons: m.totalLessons,
          avg_understanding: averageUnderstanding(m),
          homework_completion_rate: homeworkCompletionRate(m),
          report_quality_tag: 'GREEN',
          risk_level: null,
          parent_visible: false,
          subject_breakdown: breakdown,
          debug_info: `${ENGINE} mode=letter model=${MODEL} lines=${m.lines.length} attempts=${attempts} source=${source}${firstFail ? ` first_fail=${firstFail}` : ''}`,
          generated_at: new Date().toISOString(),
        };
        const ex = existing.get(t.id);
        const { error: saveErr } = ex
          ? await admin.from('weekly_reports').update(payload).eq('id', ex.id)
          : await admin.from('weekly_reports').insert(payload);
        if (saveErr) { lastReason = `SAVE_FAILED:${saveErr.message}`; break; }
        saved = true;
        generated.push({ id: t.id, name: t.name, attempts, mode: 'letter' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastReason = msg;
        if (msg === 'RATE_LIMIT' || msg === 'PAYMENT_REQUIRED') break;
      }
    }
    if (!saved) failed.push({ id: t.id, name: t.name, reason: lastReason });
    if (failed.some(f => f.reason === 'PAYMENT_REQUIRED' || f.reason === 'RATE_LIMIT')) break;
  }

  await admin.from('weekly_jobs_log').insert({
    job_name: 'generate_weekly_letter',
    week_start: weekStart,
    week_end: weekEnd,
    status: failed.length === 0 ? 'completed' : 'completed_with_errors',
    scheduler_source: source,
    message: `${ENGINE}: generated ${generated.length} (letter ${generated.filter(g => g.mode === 'letter').length}, facts_only ${generated.filter(g => g.mode === 'facts_only').length}), failed ${failed.length}, skipped ${skipped.length}, protected ${protectedRows.length}, exists ${existsRows.length}`,
  });

  return json({
    week_start: weekStart,
    week_end: weekEnd,
    dry_run: false,
    ready: ready.slice(MAX_PER_CALL),
    skipped,
    generated,
    failed,
    protected: protectedRows,
    exists: existsRows,
  });
});
