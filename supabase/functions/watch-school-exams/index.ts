// WATCH-SCHOOL-EXAMS-V1: 학원 담당 학교의 시험 일정을 매일 모은다.
//  1) 나이스 학사일정 API(NEIS_API_KEY 있을 때) → 지필평가 날짜를 exam_cycles 초안으로
//  2) 학교 홈페이지 게시판(경기도교육청 goeas.kr 공통 CMS) → 시험·평가 키워드 글을 school_watch_log에 (첨부 PDF/이미지 링크 포함)
// 자동 수집은 전부 '초안'으로만 들어가고 확정은 원장이 화면에서 누른다 (2026-09-15 결정).
// 호출: 관리자/강사 JWT (화면의 "지금 확인") 또는 cron (Authorization: Bearer <anon key> + body.source='cron')
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const UA = 'Mozilla/5.0 (compatible; TheMentorExamWatcher/1.0)';
// 시험 관련 글 제목 판정. 수행평가·모의고사·학력평가 단독은 제외한다.
const EXAM_KEYWORDS = /지필|시험\s*(시간표|범위|일정)|(중간|기말)\s*고사|평가\s*계획|고사\s*(시간표|범위)|시험시간표|시험범위/;
// 수행평가·모의고사만 다루는 글은 뺀다 (지필·중간·기말이 같이 있으면 남김)
const EXCLUDE_ONLY = /^(?!.*(지필|중간|기말)).*(수행\s*평가|모의고사|학력평가|모의평가)/;
// 나이스 학사일정 실제 표기 (2026-09-15 실측): 신길중 "1차 정기고사(2학년)", 선부고 "1차정기시험", 그 외 지필평가·중간고사·기말고사
const NEIS_EXAM = /지필|정기\s*(고사|시험)|(중간|기말)\s*고사|\d\s*차\s*(고사|시험|평가)/;
const NEIS_EXCLUDE = /수행|모의|학력평가|성적|설명회|안내/;

type School = {
  id: string; name: string; official_name: string; school_level: string; neis_office_code: string | null; neis_school_code: string | null;
  homepage_url: string | null; boards: { name: string; url: string }[]; grades: number[]; is_active: boolean;
};

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}
function stripTags(s: string) { return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function semesterOf(month: number) { return month >= 3 && month <= 8 ? '1학기' : '2학기'; }
function academicYearOf(d: Date) { return d.getMonth() + 1 >= 3 ? d.getFullYear() : d.getFullYear() - 1; }

// ── 홈페이지 게시판 ──────────────────────────────────────────────
// goeas.kr 목록 HTML: <a href="javascript:" data-id="1528213" class="nttInfoBtn"> 제목 </a> … 등록일 2026.09.09
function parseBoardList(html: string) {
  const rows: { sn: string; title: string; date: string | null }[] = [];
  const trRe = /<tr[\s>][\s\S]*?<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html))) {
    const tr = m[0];
    const a = tr.match(/data-id="(\d+)"[^>]*class="nttInfoBtn"[^>]*>([\s\S]*?)<\/a>/) || tr.match(/nttSn=(\d+)[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const title = stripTags(a[2]);
    const date = tr.match(/(20\d{2})[.\-](\d{2})[.\-](\d{2})/);
    rows.push({ sn: a[1], title, date: date ? `${date[1]}-${date[2]}-${date[3]}` : null });
  }
  return rows;
}
function parseAttachments(html: string, origin: string) {
  const out: { name: string; url: string }[] = [];
  const seen = new Set<string>();
  // goeas.kr 게시판 첨부는 /upload/<학교>/ba/... 아래에 놓인다 (subImg·images 는 사이트 장식)
  const re = /(\/upload\/[^\/"'\s]+\/ba\/[^"'\s<>]+?\.(?:pdf|jpg|jpeg|png|hwp|hwpx|xlsx|docx))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = origin + decodeEntities(m[1]);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ name: '', url });
  }
  // 표시용 파일명: 본문에 나오는 "....pdf" 텍스트를 순서대로 붙인다
  const names = [...html.matchAll(/>([^<>"]{2,120}?\.(?:pdf|jpg|jpeg|png|hwp|hwpx|xlsx|docx))</gi)].map((x) => decodeEntities(x[1].trim()));
  out.forEach((a, i) => { a.name = names[i] ?? a.url.split('/').pop() ?? ''; });
  return out;
}

async function watchBoards(admin: any, school: School, sinceDays: number) {
  let newPosts = 0, checked = 0;
  const since = new Date(Date.now() - sinceDays * 86400000);
  for (const board of school.boards ?? []) {
    if (!board?.url) continue;
    try {
      const res = await fetch(board.url, { headers: { 'User-Agent': UA } });
      if (!res.ok) { console.warn('[watch] board fetch failed', school.name, board.name, res.status); continue; }
      const html = await res.text();
      const u = new URL(board.url);
      const origin = u.origin;
      const mi = u.searchParams.get('mi'); const bbsId = u.searchParams.get('bbsId');
      const pathBase = u.pathname.replace(/selectNttList\.do$/, '');
      for (const row of parseBoardList(html)) {
        checked++;
        if (row.date && new Date(row.date) < since) continue;
        if (!EXAM_KEYWORDS.test(row.title) || EXCLUDE_ONLY.test(row.title)) continue;
        const postKey = `${board.url}#${row.sn}`;
        const { data: exists } = await admin.from('school_watch_log').select('id').eq('post_key', postKey).maybeSingle();
        if (exists) continue;
        const postUrl = `${origin}${pathBase}selectNttInfo.do?mi=${mi}&bbsId=${bbsId}&nttSn=${row.sn}`;
        let attachments: { name: string; url: string }[] = [];
        try {
          const pr = await fetch(postUrl, { headers: { 'User-Agent': UA } });
          if (pr.ok) attachments = parseAttachments(await pr.text(), origin);
        } catch (e) { console.warn('[watch] post fetch failed', postUrl, String(e)); }
        const matched = (row.title.match(/지필|시간표|범위|중간|기말|평가\s*계획|고사/g) ?? []).map((k) => k.replace(/\s+/g, ''));
        const { error } = await admin.from('school_watch_log').insert({
          school_id: school.id, school_name: school.name, board_name: board.name, post_key: postKey, title: row.title,
          posted_on: row.date, post_url: postUrl, attachments, matched_keywords: [...new Set(matched)], status: 'new',
        });
        if (!error) newPosts++;
      }
    } catch (e) { console.warn('[watch] board error', school.name, board.name, String(e)); }
  }
  return { newPosts, checked };
}

// ── 나이스 학사일정 ──────────────────────────────────────────────
async function watchNeis(admin: any, school: School, key: string, horizonDays: number) {
  if (!school.neis_office_code || !school.neis_school_code) return { cycles: 0, skipped: 'no_code' };
  const from = new Date(); const to = new Date(Date.now() + horizonDays * 86400000);
  const url = `https://open.neis.go.kr/hub/SchoolSchedule?KEY=${encodeURIComponent(key)}&Type=json&pSize=500&ATPT_OFCDC_SC_CODE=${school.neis_office_code}&SD_SCHUL_CODE=${school.neis_school_code}&AA_FROM_YMD=${ymd(from).replace(/-/g, '')}&AA_TO_YMD=${ymd(to).replace(/-/g, '')}`;
  const res = await fetch(url);
  if (!res.ok) return { cycles: 0, skipped: `http_${res.status}` };
  const body = await res.json().catch(() => null);
  const rows: any[] = body?.SchoolSchedule?.[1]?.row ?? [];
  if (rows.length === 0) return { cycles: 0, skipped: body?.RESULT?.MESSAGE ?? 'empty' };
  // 학년별로 시험 날짜를 모아 연속 구간 = 한 사이클
  const gradeKeys = ['ONE_GRADE_EVENT_YN', 'TWO_GRADE_EVENT_YN', 'THREE_GRADE_EVENT_YN', 'FOUR_GRADE_EVENT_YN', 'FIVE_GRADE_EVENT_YN', 'SIX_GRADE_EVENT_YN'];
  const byGrade = new Map<number, { date: string; name: string }[]>();
  for (const r of rows) {
    const name = String(r.EVENT_NM ?? '');
    if (!NEIS_EXAM.test(name) || NEIS_EXCLUDE.test(name)) continue;
    const d = String(r.AA_YMD ?? ''); if (d.length !== 8) continue;
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    // 학년: ① 학년별 Y 플래그 → ② 행사명/내용의 "(2학년)" → ③ 없으면 학원 담당 학년 전부
    let grades = gradeKeys.map((k, i) => (r[k] === 'Y' ? i + 1 : 0)).filter(Boolean);
    if (grades.length === 0) {
      const inText = [...`${name} ${r.EVENT_CNTNT ?? ''}`.matchAll(/([1-6])\s*학년/g)].map((m) => Number(m[1]));
      grades = inText.length > 0 ? [...new Set(inText)] : [...school.grades];
    }
    for (const g of grades) {
      if (school.grades.length > 0 && !school.grades.includes(g)) continue;
      const arr = byGrade.get(g) ?? []; arr.push({ date, name }); byGrade.set(g, arr);
    }
  }
  let cycles = 0;
  for (const [grade, list] of byGrade) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    // 7일 이상 떨어지면 다른 시험
    const groups: { date: string; name: string }[][] = [];
    for (const it of list) {
      const last = groups[groups.length - 1];
      if (last && (new Date(it.date).getTime() - new Date(last[last.length - 1].date).getTime()) <= 7 * 86400000) last.push(it); else groups.push([it]);
    }
    for (const g of groups) {
      const start = g[0].date, end = g[g.length - 1].date;
      const sd = new Date(start);
      const name = g[0].name;
      const examType = /기말|2차/.test(name) ? '기말고사' : /중간|1차/.test(name) ? '중간고사' : (sd.getMonth() + 1 >= 11 || sd.getMonth() + 1 === 6 || sd.getMonth() + 1 === 7 ? '기말고사' : '중간고사');
      const semester = semesterOf(sd.getMonth() + 1);
      const academicYear = academicYearOf(sd);
      const { data: existing } = await admin.from('exam_cycles').select('id, status, start_date, end_date')
        .eq('school_name', school.name).eq('grade_year', grade).eq('academic_year', academicYear).eq('semester', semester).eq('exam_type', examType).maybeSingle();
      if (!existing) {
        const { error } = await admin.from('exam_cycles').insert({
          school_id: school.id, school_name: school.name, school_level: school.school_level, grade_year: grade, academic_year: academicYear,
          semester, exam_type: examType, start_date: start, end_date: end, status: 'draft', source: 'neis', notes: `나이스 학사일정: ${name}`,
        });
        if (!error) cycles++;
      } else if (existing.status === 'draft' && (existing.start_date !== start || existing.end_date !== end)) {
        // 초안이면 나이스 값으로 따라간다. 확정본은 건드리지 않고 메모만 남긴다.
        await admin.from('exam_cycles').update({ start_date: start, end_date: end, source: 'neis', updated_at: new Date().toISOString() }).eq('id', existing.id);
        cycles++;
      } else if (existing.status === 'confirmed' && (existing.start_date !== start || existing.end_date !== end)) {
        await admin.from('exam_cycles').update({ notes: `⚠ 나이스 학사일정과 다름: ${start}~${end} (${name})`, updated_at: new Date().toISOString() }).eq('id', existing.id);
      }
    }
  }
  return { cycles, rows: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const admin = createClient(supabaseUrl, serviceKey);
  const body = await req.json().catch(() => ({}));

  // 권한: cron(anon 키 + source=cron) 또는 관리자/강사
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  let allowed = body?.source === 'cron' && anonKey && token === anonKey;
  if (!allowed && token) {
    const { data: { user } } = await admin.auth.getUser(token);
    if (user) {
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
      allowed = (roles ?? []).some((r: any) => ['admin', 'teacher'].includes(r.role));
    }
  }
  if (!allowed) return json({ error: 'Unauthorized' }, 401);

  const neisKey = Deno.env.get('NEIS_API_KEY');
  const sinceDays = Number(body?.since_days ?? 21);
  const horizonDays = Number(body?.horizon_days ?? 120);
  const onlySchool = typeof body?.school_id === 'string' ? body.school_id : null;

  let q = admin.from('academy_schools').select('*').eq('is_active', true);
  if (onlySchool) q = q.eq('id', onlySchool);
  const { data: schools, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const report: any[] = [];
  for (const s of (schools ?? []) as School[]) {
    const r: any = { school: s.name };
    try { r.boards = await watchBoards(admin, s, sinceDays); } catch (e) { r.boards = { error: String(e) }; }
    if (neisKey) { try { r.neis = await watchNeis(admin, s, neisKey, horizonDays); } catch (e) { r.neis = { error: String(e) }; } }
    else r.neis = { skipped: 'NEIS_API_KEY 없음' };
    await admin.from('academy_schools').update({ last_checked_at: new Date().toISOString() }).eq('id', s.id);
    report.push(r);
  }
  return json({ ok: true, neis: !!neisKey, schools: report });
});
