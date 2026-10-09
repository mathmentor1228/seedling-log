// EXTRACT-SCHOOL-NOTICE-V1: 학교 홈페이지에서 모아온 글(school_watch_log)의 첨부(PDF·이미지)를 AI로 읽어
// 과목별 시험일·시간·범위·수행평가를 exam_cycle_subjects 초안으로 채운다. (vault 17 재설계안 2주차, 19 개편안 A-2)
//  - 자동 수집은 전부 '초안/확인 필요'로만 들어가고, 원장이 /exam 시험 정보 탭에서 보고 확정한다.
//  - 직접 입력(source='manual')한 칸은 비어 있을 때만 채운다. 다른 자동 출처는 새 값이 있으면 갱신.
// 호출: { post_id } (화면 버튼) / { source:'cron' } (anon 키) / { source:'internal' } (watch-school-exams가 service 키로 호출)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const READABLE = /\.(pdf|jpg|jpeg|png|webp)$/i;
const MAX_ATTACHMENTS_PER_POST = 3;
const ACADEMY_SUBJECTS = ['수학', '영어', '국어', '과학'] as const;

type Post = {
  id: string; school_id: string | null; school_name: string; title: string; posted_on: string | null; post_url: string | null;
  attachments: { name: string; url: string }[]; status: string;
};
type School = { id: string; name: string; school_level: string; grades: number[]; subjects: string[] };
type Extracted = {
  exam_type?: string | null; exam_year?: string | number | null; exam_period?: string | null; grade?: string | number | null;
  exam_schedule?: { date?: string | null; subject?: string | null; start_time?: string | null; end_time?: string | null; grade?: string | number | null }[];
  exam_scope?: { subject?: string | null; scope_text?: string | null; chapters?: string[] | null; pages?: string | null; grade?: string | number | null }[];
  performance_assessments?: { subject?: string | null; type?: string | null; title?: string | null; ratio?: string | number | null; period?: string | null; grade?: string | number | null }[];
  notes?: string | null;
};

/** 학교 과목명 → 학원 과목(수학·영어·국어·과학). 해당 없으면 null (한국사·사회 등은 메모로만) */
export function mapSubject(raw: string | null | undefined): string | null {
  const s = (raw || '').replace(/\s+/g, '');
  if (!s) return null;
  if (/수학|대수|기하|미적|확통|확률/.test(s)) return '수학';
  if (/영어|english/i.test(s)) return '영어';
  if (/국어|문학|독서|화법|언어와매체|작문/.test(s)) return '국어';
  if (/과학|물리|화학|생명|지구|융합과학/.test(s)) return '과학';
  return null;
}
function toGrade(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(/[^0-9]/g, ''));
  return n >= 1 && n <= 6 ? n : null;
}
function semesterOf(month: number) { return month >= 3 && month <= 8 ? '1학기' : '2학기'; }
function academicYearOf(y: number, m: number) { return m >= 3 ? y : y - 1; }
function examTypeOf(text: string, month: number | null): '중간고사' | '기말고사' {
  if (/기말|2차/.test(text)) return '기말고사';
  if (/중간|1차/.test(text)) return '중간고사';
  if (month != null) return [3, 4, 5, 9, 10].includes(month) ? '중간고사' : '기말고사';
  return '중간고사';
}

async function readAttachment(supabaseUrl: string, serviceKey: string, schoolName: string, att: { name: string; url: string }, gradeFilter: number | null): Promise<Extracted | null> {
  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-school-document`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileUrl: att.url, fileName: att.name || att.url.split('/').pop(), fileType: 'evaluation_plan', schoolName, gradeFilter: gradeFilter ?? undefined }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) { console.warn('[extract] analyze failed', att.url, res.status, body?.error); return null; }
  return body.data as Extracted;
}

/** 여러 첨부의 결과를 하나로 합친다 (일정·범위·수행은 이어 붙이고 메타는 먼저 나온 값 우선) */
function mergeExtracted(list: Extracted[]): Extracted {
  const out: Extracted = { exam_schedule: [], exam_scope: [], performance_assessments: [] };
  for (const e of list) {
    if (!e) continue;
    for (const k of ['exam_type', 'exam_year', 'exam_period', 'grade', 'notes'] as const) {
      if ((out as any)[k] == null && (e as any)[k] != null) (out as any)[k] = (e as any)[k];
    }
    out.exam_schedule!.push(...(e.exam_schedule || []));
    out.exam_scope!.push(...(e.exam_scope || []));
    out.performance_assessments!.push(...(e.performance_assessments || []));
  }
  return out;
}

async function applyToCycles(admin: any, school: School, post: Post, data: Extracted, targetGrade: number | null) {
  // ── 사이클 키 결정 ──
  const dates = (data.exam_schedule || []).map(r => String(r.date || '')).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const firstDate = dates[0] || null;
  const month = firstDate ? Number(firstDate.slice(5, 7)) : (post.posted_on ? Number(post.posted_on.slice(5, 7)) : null);
  const yearFromData = Number(data.exam_year) || (firstDate ? Number(firstDate.slice(0, 4)) : (post.posted_on ? Number(post.posted_on.slice(0, 4)) : new Date().getFullYear()));
  const semester = data.exam_period?.includes('2') ? '2학기' : data.exam_period?.includes('1') ? '1학기' : semesterOf(month ?? new Date().getMonth() + 1);
  const examType = examTypeOf(`${data.exam_type || ''} ${post.title}`, month);
  const academicYear = academicYearOf(yearFromData, month ?? 9);

  // 학년: 문서 전체 학년 → 행별 학년 → 학원 담당 학년 전부
  const docGrade = toGrade(data.grade);
  const rowGrades = new Set<number>();
  for (const r of [...(data.exam_schedule || []), ...(data.exam_scope || []), ...(data.performance_assessments || [])]) { const g = toGrade((r as any).grade); if (g) rowGrades.add(g); }
  let grades = targetGrade ? [targetGrade] : docGrade ? [docGrade] : rowGrades.size > 0 ? [...rowGrades] : [...(school.grades || [])];
  if (school.grades?.length && !targetGrade) grades = grades.filter(g => school.grades.includes(g));
  if (grades.length === 0) return { cycles: [] as string[], subjects: 0, warnings: ['학년을 알 수 없고 학교 담당 학년도 비어 있음'], ungraded: 0 };

  // 학년이 안 적힌 행을 어느 학년으로 볼지: 화면에서 지정한 학년 → 문서 전체 학년 → 학교 담당 학년이 하나뿐이면 그 학년 → 그 외는 건너뜀(모든 학년에 복사하지 않는다)
  const fallbackGrade: number | null = targetGrade ?? docGrade ?? (grades.length === 1 ? grades[0] : null);
  const rowGrade = (r: { grade?: unknown }): number | null => toGrade(r.grade) ?? fallbackGrade;
  let ungraded = 0;
  const countUngraded = () => { for (const r of [...(data.exam_schedule || []), ...(data.exam_scope || []), ...(data.performance_assessments || [])]) if (!toGrade((r as any).grade) && !fallbackGrade) ungraded++; };
  countUngraded();

  const warnings: string[] = [];
  if (ungraded > 0) warnings.push(`학년이 적히지 않은 항목 ${ungraded}건은 어느 학년인지 알 수 없어 건너뜀 (해당 사이클에서 'AI로 읽어 채우기'를 누르면 그 학년으로 읽습니다)`);
  const cycleIds: string[] = [];
  let subjectsTouched = 0;

  for (const grade of grades) {
    // 사이클 찾기 / 없으면 초안 생성
    let { data: cycle } = await admin.from('exam_cycles').select('id, status, start_date, end_date')
      .eq('school_name', school.name).eq('grade_year', grade).eq('academic_year', academicYear).eq('semester', semester).eq('exam_type', examType).maybeSingle();
    const gradeDates = (data.exam_schedule || []).filter(r => rowGrade(r) === grade)
      .map(r => String(r.date || '')).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (!cycle) {
      const { data: created, error } = await admin.from('exam_cycles').insert({
        school_id: school.id, school_name: school.name, school_level: school.school_level, grade_year: grade, academic_year: academicYear,
        semester, exam_type: examType, start_date: gradeDates[0] || null, end_date: gradeDates[gradeDates.length - 1] || null,
        status: 'draft', source: 'homepage', source_url: post.post_url, notes: `학교 홈페이지 글: ${post.title}`,
      }).select('id, status, start_date, end_date').single();
      if (error) { warnings.push(`${grade}학년 사이클 생성 실패: ${error.message}`); continue; }
      cycle = created;
    } else if (cycle.status === 'draft' && gradeDates.length > 0) {
      await admin.from('exam_cycles').update({ start_date: gradeDates[0], end_date: gradeDates[gradeDates.length - 1], source_url: cycle.source_url || post.post_url, updated_at: new Date().toISOString() }).eq('id', cycle.id);
    }
    cycleIds.push(cycle.id);

    // 과목별 값 모으기 (학원 과목으로 정규화)
    type Acc = { exam_date?: string; exam_time?: string; scope?: string; perf: string[]; others: string[] };
    const acc = new Map<string, Acc>();
    const get = (subj: string) => acc.get(subj) || acc.set(subj, { perf: [], others: [] }).get(subj)!;
    for (const r of data.exam_schedule || []) {
      if (rowGrade(r) !== grade) continue;
      const subj = mapSubject(r.subject); if (!subj) continue;
      const a = get(subj);
      if (!a.exam_date && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || ''))) a.exam_date = String(r.date);
      if (!a.exam_time && r.start_time) a.exam_time = `${r.start_time}${r.end_time ? `~${r.end_time}` : ''}`;
      if (r.subject && r.subject !== subj) a.others.push(String(r.subject));
    }
    for (const r of data.exam_scope || []) {
      if (rowGrade(r) !== grade) continue;
      const subj = mapSubject(r.subject); if (!subj) continue;
      const a = get(subj);
      const text = [r.scope_text, r.pages ? `(${r.pages})` : null, r.chapters?.length ? r.chapters.join(', ') : null].filter(Boolean).join(' ').trim();
      if (text) a.scope = a.scope ? `${a.scope}\n${r.subject && r.subject !== subj ? `[${r.subject}] ` : ''}${text}` : `${r.subject && r.subject !== subj ? `[${r.subject}] ` : ''}${text}`;
    }
    for (const r of data.performance_assessments || []) {
      if (rowGrade(r) !== grade) continue;
      const subj = mapSubject(r.subject); if (!subj) continue;
      const line = [r.type, r.title, r.ratio != null && r.ratio !== '' ? `${r.ratio}%` : null, r.period].filter(Boolean).join(' · ');
      if (line) get(subj).perf.push(line);
    }

    for (const [subject, a] of acc) {
      if (!ACADEMY_SUBJECTS.includes(subject as any)) continue;
      const perfNote = a.perf.length ? `수행평가: ${a.perf.join(' / ')}` : null;
      const { data: existing } = await admin.from('exam_cycle_subjects').select('id, source, exam_date, exam_time, scope, notes').eq('cycle_id', cycle.id).eq('subject', subject).maybeSingle();
      if (!existing) {
        const { error } = await admin.from('exam_cycle_subjects').insert({
          cycle_id: cycle.id, subject, exam_date: a.exam_date || null, exam_time: a.exam_time || null, scope: a.scope || null,
          notes: perfNote, source: 'homepage', source_url: post.post_url, updated_at: new Date().toISOString(),
        });
        if (error) warnings.push(`${grade}학년 ${subject} 저장 실패: ${error.message}`); else subjectsTouched++;
        continue;
      }
      const manual = existing.source === 'manual';
      const patch: Record<string, unknown> = {};
      const fill = (k: 'exam_date' | 'exam_time' | 'scope', v?: string) => {
        if (!v) return;
        if (manual ? !existing[k] : existing[k] !== v) patch[k] = v;
      };
      fill('exam_date', a.exam_date); fill('exam_time', a.exam_time); fill('scope', a.scope);
      if (perfNote && (!existing.notes || !existing.notes.includes(perfNote))) {
        patch.notes = existing.notes && !existing.notes.startsWith('수행평가:') ? `${existing.notes}\n${perfNote}` : perfNote;
      }
      if (Object.keys(patch).length === 0) continue;
      patch.updated_at = new Date().toISOString();
      if (!manual) { patch.source = 'homepage'; patch.source_url = post.post_url; }
      const { error } = await admin.from('exam_cycle_subjects').update(patch).eq('id', existing.id);
      if (error) warnings.push(`${grade}학년 ${subject} 갱신 실패: ${error.message}`); else subjectsTouched++;
    }
  }
  return { cycles: cycleIds, subjects: subjectsTouched, warnings, ungraded };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const admin = createClient(supabaseUrl, serviceKey);
  const body = await req.json().catch(() => ({}));

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const apikeyHeader = req.headers.get('apikey') ?? '';
  let allowed = (body?.source === 'cron' && (
      (cronSecret && (token === cronSecret || apikeyHeader === cronSecret || body?.cron_secret === cronSecret))
      || (anonKey && (token === anonKey || apikeyHeader === anonKey))))
    || (body?.source === 'internal' && token === serviceKey);
  if (!allowed && token) {
    const { data: { user } } = await admin.auth.getUser(token);
    if (user) {
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
      allowed = (roles ?? []).some((r: any) => ['admin', 'teacher'].includes(r.role));
    }
  }
  if (!allowed) return json({ error: 'Unauthorized' }, 401);
  if (!Deno.env.get('LOVABLE_API_KEY')) return json({ error: 'AI 키(LOVABLE_API_KEY)가 없어 첨부를 읽을 수 없습니다.' }, 500);

  const targetGrade: number | null = toGrade(body?.grade);
  // 대상 글: 지정 1건 또는 새 글(첨부 있음) 최대 N건
  let posts: Post[] = [];
  if (typeof body?.post_id === 'string') {
    const { data } = await admin.from('school_watch_log').select('*').eq('id', body.post_id).maybeSingle();
    if (!data) return json({ error: '글을 찾을 수 없습니다' }, 404);
    posts = [data as Post];
  } else {
    const limit = Math.min(Number(body?.limit ?? 5), 20);
    const { data } = await admin.from('school_watch_log').select('*').eq('status', 'new').order('created_at', { ascending: false }).limit(50);
    posts = ((data ?? []) as Post[]).filter(p => (p.attachments || []).some(a => READABLE.test(a.url))).slice(0, limit);
  }

  const { data: schoolsRaw } = await admin.from('academy_schools').select('id, name, school_level, grades, subjects');
  const schools = (schoolsRaw ?? []) as School[];
  const report: any[] = [];

  for (const post of posts) {
    const school = schools.find(s => s.id === post.school_id) || schools.find(s => s.name === post.school_name);
    const r: any = { post_id: post.id, title: post.title, school: post.school_name };
    if (!school) { r.error = '학교 설정 없음'; report.push(r); continue; }
    const readable = (post.attachments || []).filter(a => READABLE.test(a.url)).slice(0, MAX_ATTACHMENTS_PER_POST);
    const skipped = (post.attachments || []).filter(a => !READABLE.test(a.url)).map(a => a.name || a.url.split('/').pop());
    if (readable.length === 0) {
      r.skipped = skipped; r.error = 'AI가 읽을 수 있는 첨부(PDF·이미지)가 없음 (hwp·xlsx는 지원 안 함)';
      await admin.from('school_watch_log').update({ extracted: { error: r.error, skipped } }).eq('id', post.id);
      report.push(r); continue;
    }
    const results: Extracted[] = [];
    for (const att of readable) { const e = await readAttachment(supabaseUrl, serviceKey, school.name, att, targetGrade); if (e) results.push(e); }
    if (results.length === 0) {
      r.error = '첨부를 읽지 못함';
      await admin.from('school_watch_log').update({ extracted: { error: r.error, tried: readable.map(a => a.url) } }).eq('id', post.id);
      report.push(r); continue;
    }
    const merged = mergeExtracted(results);
    const applied = await applyToCycles(admin, school, post, merged, targetGrade);
    const summary = {
      schedule: (merged.exam_schedule || []).length, scope: (merged.exam_scope || []).length, performance: (merged.performance_assessments || []).length,
      cycles: applied.cycles.length, subjects: applied.subjects, warnings: applied.warnings, ungraded: applied.ungraded, grade: targetGrade, skipped, read: readable.map(a => a.name || a.url.split('/').pop()),
      extracted_at: new Date().toISOString(),
    };
    await admin.from('school_watch_log').update({
      status: applied.cycles.length > 0 ? 'extracted' : 'new',
      extracted: { ...merged, summary },
      cycle_id: applied.cycles[0] ?? null,
    }).eq('id', post.id);
    Object.assign(r, summary);
    report.push(r);
  }
  return json({ ok: true, processed: report.length, report });
});
