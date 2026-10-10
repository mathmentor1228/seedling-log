// INGEST-EXAM-SHEET-V1: 구글 시트(성적취합표)·드라이브(시험지 PDF)를 Apps Script가 밀어 넣는 수신 함수. (vault 19 §9, A안 2026-10-10)
//  - 인증: 헤더 x-sheet-secret == EXAM_SHEET_SECRET (Apps Script Sync.gs와 같은 값)
//  - action 'rows': 성적입력 탭 전체 → student_exam_results upsert (학교·학년·이름으로 학생 매칭, 동명이인은 미매칭으로 멈춤)
//  - action 'file': PDF 1개(base64) → Storage exam-results 복사 + student_exam_result_pdfs upsert
//  원칙: 시트가 원본. 시트 값이 비면 기존 값을 NULL로 덮지 않는다. 수동 입력(source NULL) 점수는 실점수가 있을 때만 시트 값으로 갱신.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sheet-secret' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type SheetRow = { row_no?: number; grade?: string; school?: string; name?: string; subject?: string; teacher?: string; expected?: number | string | null; actual?: number | string | null; previous?: number | string | null; uploaded?: boolean | string | null; note?: string | null };
type ExamKey = { year: number; semester: '1' | '2'; type: 'a' | 'b' };
type Student = { id: string; name: string; school: string | null; school_level: string | null; grade_year: number | null; enrollment_status: string };

export function normalizeSchool(name: string | null | undefined): string {
  if (!name) return '';
  const c = name.trim().replace(/\s+/g, '');
  for (const [suf, rep] of [['초등학교', '초'], ['중학교', '중'], ['고등학교', '고']] as const) if (c.endsWith(suf)) return c.slice(0, -suf.length) + rep;
  return c;
}
export function parseGrade(text: string | null | undefined): { level: string | null; grade: number | null } {
  const t = (text || '').replace(/\s+/g, '');
  const m = t.match(/([초중고])?\s*([1-6])/);
  if (!m) return { level: null, grade: null };
  return { level: m[1] || null, grade: Number(m[2]) };
}
export function normalizeName(n: string | null | undefined) { return (n || '').replace(/\s+/g, '').trim(); }
export function toScore(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
export function examKeyToPeriod(k: ExamKey) { return `${k.semester}-${k.type}`; }
export function examKeyToType(k: ExamKey) { return k.type === 'a' ? 'midterm' : 'final'; }
/** 드라이브 파일명 `2026-2-a 영어 신길중 우시연.pdf` */
export function parseDriveName(name: string): { key: ExamKey; subject: string; school: string; student: string } | null {
  const m = name.replace(/\.pdf$/i, '').trim().match(/^(\d{4})-([12])-([ab])\s+(\S+)\s+(\S+)\s+(.+)$/);
  if (!m) return null;
  return { key: { year: Number(m[1]), semester: m[2] as '1' | '2', type: m[3] as 'a' | 'b' }, subject: m[4], school: m[5], student: m[6].trim() };
}

function matchStudent(students: Student[], school: string, gradeText: string | null, name: string): { student: Student | null; reason?: string } {
  const sch = normalizeSchool(school); const nm = normalizeName(name); const g = parseGrade(gradeText);
  if (!sch || !nm) return { student: null, reason: '학교 또는 이름 비어 있음' };
  let cands = students.filter(s => normalizeSchool(s.school) === sch && normalizeName(s.name) === nm);
  if (cands.length > 1 && g.grade) cands = cands.filter(s => s.grade_year === g.grade);
  if (cands.length === 0) {
    // 학교 표기가 다르거나 학년만 맞는 경우를 위해 이름+학년으로 2차 시도
    const byName = students.filter(s => normalizeName(s.name) === nm && (!g.grade || s.grade_year === g.grade));
    if (byName.length === 1) return { student: byName[0], reason: `학교 표기 불일치(${school}→${byName[0].school}) — 이름·학년으로 매칭` };
    return { student: null, reason: byName.length > 1 ? '동명이인(학교 불일치)' : '재원생 중 같은 이름 없음' };
  }
  if (cands.length > 1) return { student: null, reason: '동명이인(같은 학교·학년)' };
  if (g.grade && cands[0].grade_year && cands[0].grade_year !== g.grade) return { student: cands[0], reason: `시트 학년(${gradeText})과 앱 학년(${cands[0].grade_year}) 다름` };
  return { student: cands[0] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const secret = Deno.env.get('EXAM_SHEET_SECRET') ?? '';
  const given = req.headers.get('x-sheet-secret') ?? '';
  if (!secret || given !== secret) return json({ error: 'Unauthorized' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => null);
  if (!body?.action) return json({ error: 'action required' }, 400);

  // 과거 자료 가져오기(노션 2023~2025)는 퇴원생도 매칭해야 하므로 allow_inactive 허용
  let sq = admin.from('students').select('id, name, school, school_level, grade_year, enrollment_status');
  if (!body.allow_inactive) sq = sq.in('enrollment_status', ['재학', '재등원']);
  const { data: studentsRaw, error: sErr } = await sq;
  if (sErr) return json({ error: sErr.message }, 500);
  const students = (studentsRaw ?? []) as Student[];
  const now = new Date().toISOString();

  // ── rows: 성적입력 탭 ─────────────────────────────────────────
  if (body.action === 'rows') {
    const key = body.exam as ExamKey | undefined;
    if (!key?.year || !key.semester || !key.type) return json({ error: 'exam {year, semester, type} required' }, 400);
    const period = examKeyToPeriod(key); const examType = examKeyToType(key);
    const rows = (Array.isArray(body.rows) ? body.rows : []) as SheetRow[];
    const unmatched: any[] = []; const errors: any[] = []; let matched = 0;
    const { data: profiles } = await admin.from('profiles').select('id, full_name').eq('is_active', true);
    const teacherIds = new Map(((profiles ?? []) as any[]).map(p => [normalizeName(p.full_name), p.id]));
    const { data: existingRaw } = await admin.from('student_exam_results').select('id, student_id, subject, exam_type, exam_year, exam_period, actual_score, expected_score, source, note')
      .eq('exam_year', key.year).eq('exam_period', period).eq('exam_type', examType);
    const existing = (existingRaw ?? []) as any[];

    for (const r of rows) {
      const subject = (r.subject || '').trim();
      if (!r.name && !r.school && !subject) continue; // 빈 줄
      if (!subject) { unmatched.push({ row_no: r.row_no, school: r.school, grade: r.grade, name: r.name, subject, reason: '과목 비어 있음' }); continue; }
      const m = matchStudent(students, r.school || '', r.grade || null, r.name || '');
      if (!m.student) { unmatched.push({ row_no: r.row_no, school: r.school, grade: r.grade, name: r.name, subject, reason: m.reason }); continue; }
      const expected = toScore(r.expected), actual = toScore(r.actual), previous = toScore(r.previous);
      const bad = [expected, actual, previous].find(v => v != null && (v < 0 || v > 100));
      if (bad != null) { unmatched.push({ row_no: r.row_no, school: r.school, grade: r.grade, name: r.name, subject, reason: `점수 범위 벗어남(${bad})` }); continue; }
      const note = (r.note || '').toString().trim() || null;
      const teacherName = (r.teacher || '').toString().trim() || null;
      const found = existing.find(e => e.student_id === m.student!.id && e.subject === subject);
      try {
        if (found) {
          const patch: Record<string, unknown> = { source: 'sheet', sheet_row_no: r.row_no ?? null, sheet_teacher_name: teacherName, synced_at: now };
          if (expected != null) patch.expected_score = expected;
          if (actual != null) patch.actual_score = actual;
          if (previous != null) patch.previous_score = previous;
          if (note != null) patch.note = note;
          const { error } = await admin.from('student_exam_results').update(patch).eq('id', found.id);
          if (error) throw error;
        } else {
          const { error } = await admin.from('student_exam_results').insert({
            student_id: m.student.id, school_name: m.student.school || normalizeSchool(r.school || ''), subject, exam_type: examType,
            exam_year: key.year, exam_period: period, expected_score: expected, actual_score: actual, previous_score: previous, note,
            grade_at_exam: r.grade || null, is_staff_upload: true, uploaded_by_staff_name: '성적취합표 동기화',
            source: 'sheet', sheet_row_no: r.row_no ?? null, sheet_teacher_name: teacherName, synced_at: now, exam_date: null,
          });
          if (error) throw error;
        }
        matched++;
        if (m.reason) unmatched.push({ row_no: r.row_no, school: r.school, grade: r.grade, name: r.name, subject, reason: m.reason, matched_student_id: m.student.id, warning: true });
        // 담당선생님 매핑 후보: 이미 링크가 없을 때만 기록(자동 insert 안 함) — 화면에서 확인 후 지정
        void teacherIds;
      } catch (e: any) { errors.push({ row_no: r.row_no, name: r.name, subject, error: e.message || String(e) }); }
    }
    await admin.from('exam_sheet_syncs').insert({
      kind: 'rows', spreadsheet_id: body.spreadsheet_id ?? null, spreadsheet_name: body.spreadsheet_name ?? null,
      exam_year: key.year, exam_period: period, exam_type: examType, rows_total: rows.length, rows_matched: matched, unmatched, errors,
    });
    return json({ ok: true, rows: rows.length, matched, unmatched: unmatched.length, errors: errors.length, period });
  }

  // ── file: 시험지 PDF 1개 ─────────────────────────────────────
  if (body.action === 'file') {
    const f = body.file as { name?: string; drive_file_id?: string; modified?: string; size?: number; data_base64?: string; subject_folder?: string } | undefined;
    if (!f?.name || (!f.data_base64 && !body.dry_run)) return json({ error: 'file {name, data_base64} required' }, 400);
    const parsed = parseDriveName(f.name);
    const log = async (ok: boolean, reason?: string, detail?: any) => {
      await admin.from('exam_sheet_syncs').insert({
        kind: 'file', spreadsheet_id: body.spreadsheet_id ?? null, exam_year: parsed?.key.year ?? null, exam_period: parsed ? examKeyToPeriod(parsed.key) : null,
        exam_type: parsed ? examKeyToType(parsed.key) : null, files_total: 1, files_matched: ok ? 1 : 0,
        unmatched: ok ? [] : [{ file: f.name, reason }], detail: { name: f.name, drive_file_id: f.drive_file_id, ...(detail || {}) },
      });
    };
    if (!parsed) { await log(false, '파일명 규칙 불일치 (YYYY-S-a 과목 학교 이름.pdf)'); return json({ ok: false, reason: 'bad_name' }); }
    if (f.subject_folder && !f.subject_folder.includes(parsed.subject)) { /* 폴더와 과목이 다르면 경고만 */ }
    const m = matchStudent(students, parsed.school, body.file?.grade ?? null, parsed.student);
    if (body.dry_run) {
      let existing: any = null;
      if (m.student) {
        const { data } = await admin.from('student_exam_results').select('id, actual_score, expected_score').eq('student_id', m.student.id).eq('subject', parsed.subject)
          .eq('exam_year', parsed.key.year).eq('exam_period', examKeyToPeriod(parsed.key)).eq('exam_type', examKeyToType(parsed.key)).maybeSingle();
        existing = data;
        if (existing) {
          const { data: pdf } = await admin.from('student_exam_result_pdfs').select('id, drive_file_name, source').eq('result_id', existing.id).maybeSingle();
          existing = { ...existing, pdf };
        }
      }
      return json({ ok: !!m.student, dry_run: true, parsed, student: m.student ? { id: m.student.id, name: m.student.name, school: m.student.school, grade_year: m.student.grade_year, status: m.student.enrollment_status } : null, reason: m.reason, existing });
    }
    if (!m.student) { await log(false, m.reason); return json({ ok: false, reason: m.reason }); }
    const period = examKeyToPeriod(parsed.key); const examType = examKeyToType(parsed.key);
    // 결과 행 찾기/없으면 점수 없는 행 생성 (PDF를 붙일 자리)
    let { data: result } = await admin.from('student_exam_results').select('id').eq('student_id', m.student.id).eq('subject', parsed.subject)
      .eq('exam_year', parsed.key.year).eq('exam_period', period).eq('exam_type', examType).maybeSingle();
    if (!result) {
      const { data: ins, error } = await admin.from('student_exam_results').insert({
        student_id: m.student.id, school_name: m.student.school || parsed.school, subject: parsed.subject, exam_type: examType,
        exam_year: parsed.key.year, exam_period: period, is_staff_upload: true, uploaded_by_staff_name: '드라이브 시험지 동기화', source: 'drive', synced_at: now,
      }).select('id').single();
      if (error) { await log(false, error.message); return json({ ok: false, reason: error.message }, 500); }
      result = ins;
    }
    // Storage 복사
    const bytes = Uint8Array.from(atob(f.data_base64 || ""), c => c.charCodeAt(0));
    // Storage 키는 ASCII만 (한글 학교·과목명은 거부될 수 있음) — 학교·과목은 DB 행에 있으므로 경로엔 결과 id만
    const path = f.drive_file_id ? `sheet/${parsed.key.year}-${period}/${result.id}-${(f.drive_file_id as string).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60)}.pdf` : `sheet/${parsed.key.year}-${period}/${result.id}.pdf`;
    const { error: upErr } = await admin.storage.from('exam-results').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) { await log(false, 'storage: ' + upErr.message); return json({ ok: false, reason: 'storage: ' + upErr.message }, 500); }
    // 같은 결과 행에 PDF가 여러 장일 수 있다(고3 확통+미적분, 언어와매체+화법과작문). 파일 단위(drive_file_id)로 찾고 없으면 새 행.
    const fileKey = f.drive_file_id ?? null;
    let pdfRow: any = null;
    if (fileKey) { const { data } = await admin.from('student_exam_result_pdfs').select('id').eq('result_id', result.id).eq('drive_file_id', fileKey).maybeSingle(); pdfRow = data; }
    if (!pdfRow && !fileKey) { const { data } = await admin.from('student_exam_result_pdfs').select('id').eq('result_id', result.id).eq('source', 'drive').maybeSingle(); pdfRow = data; }
    const safeId = (fileKey || 'file').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
    const pdfPatch = { storage_path: path, display_title: (f as any).title || f.name.replace(/\.pdf$/i, ''), file_size: f.size ?? bytes.length, source: (body.source_label as string) || 'drive', drive_file_id: fileKey, drive_file_name: f.name, drive_modified_at: f.modified ?? null, generated_by_name: (body.source_label as string) === 'notion' ? '노션 과거자료 가져오기' : '드라이브 시험지 동기화' };
    void safeId;
    if (pdfRow) await admin.from('student_exam_result_pdfs').update(pdfPatch).eq('id', pdfRow.id);
    else await admin.from('student_exam_result_pdfs').insert({ result_id: result.id, ...pdfPatch });
    await admin.from('student_exam_results').update({ synced_at: now }).eq('id', result.id);
    await log(true, undefined, { student_id: m.student.id, result_id: result.id, path, warning: m.reason });
    return json({ ok: true, student: m.student.name, result_id: result.id, warning: m.reason });
  }

  // ── ensure_students: 과거 자료(노션 2025) 가져오기용 — 앱에 없는 학생을 '퇴원' 상태로 생성 (원장 결정 2026-10-11)
  //    body.students = [{ name, school, grade }]  grade는 2025년 기준 표기('중3','고1'). 같은 학교·이름이 이미 있으면 만들지 않는다.
  if (body.action === 'ensure_students') {
    const list = (Array.isArray(body.students) ? body.students : []) as { name?: string; school?: string; grade?: string }[];
    const created: any[] = []; const skipped: any[] = []; const errors: any[] = [];
    for (const st of list) {
      const name = normalizeName(st.name).replace(/_.*$/, ''); const school = normalizeSchool(st.school); const g = parseGrade(st.grade);
      if (!name || !school) { errors.push({ ...st, error: '이름·학교 필요' }); continue; }
      const exists = students.find(s => normalizeName(s.name) === name && normalizeSchool(s.school) === school);
      if (exists) { skipped.push({ name, school, id: exists.id, status: exists.enrollment_status }); continue; }
      if (body.dry_run) { created.push({ name, school, grade: st.grade, dry_run: true }); continue; }
      const level = g.level || (school.endsWith('고') ? '고' : school.endsWith('중') ? '중' : school.endsWith('초') ? '초' : null);
      const { data: ins, error } = await admin.from('students').insert({
        name, school, school_level: level, grade_year: g.grade, grade: st.grade || null, enrollment_status: '퇴원',
        notes: `2025 노션 과거자료 가져오기(${now.slice(0, 10)})로 생성. 학교·학년은 2025년 기준. 연락처·등록일 없음.`,
      }).select('id').single();
      if (error) errors.push({ name, school, error: error.message }); else { created.push({ name, school, grade: st.grade, id: ins.id }); students.push({ id: ins.id, name, school, school_level: level, grade_year: g.grade, enrollment_status: '퇴원' }); }
    }
    return json({ ok: true, created, skipped, errors });
  }

  return json({ error: 'unknown action' }, 400);
});
