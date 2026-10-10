// EXAM-MODES-V1 ④ 기록·학생 — 학생 한 명의 성적 흐름 + 학원의 조치를 한 화면에 (vault 19 §19-1·19-2).
// 원장: 전 과목 통합, 상담 자료로 그대로 사용. 과목 선생님: 자기 담당 과목만.
// 조치 타임라인 재료: 특강(exam_prep_enrollments) · 클리닉(clinic_records) · 수업 기록의 모든 코멘트(주간 코멘트·학부모께 한 줄·학습 이슈·숙제 관찰·다음 목표·내부 메모)
//   · 조치 메모(student_action_notes) + 숙제 완료율. (2026-10-11 원장: 선생님들 코멘트가 다 보여야 하고 내부/외부용으로 정리)
// 내부/외부: external = 학부모 상담에서 말해도 되는 것(학부모께 한 줄·주간 코멘트·특강·클리닉 내용·외부용 조치 메모),
//           internal = 학원 안에서만(학습 이슈·숙제 관찰·다음 목표·내부 메모·클리닉 교사 메모·내부용 조치 메모).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, LabelList } from 'recharts';
import { Copy, Loader2, Lock, MessageSquareText, NotebookPen, Stethoscope, GraduationCap, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { normalizeSchool } from '@/components/exam-board/cycleUtils';
import { periodKey, periodLabel, type ClassInfo, type ExamResult, type StudentRow, type SubjectTeacherLink, type Teacher } from './examHubUtils';

const db = supabase as any;
/** 과목별 고정 색 (dataviz 검증: 명도·채도·대비 통과, CVD 경계는 선 끝 직접 라벨로 보완) */
const SUBJECT_COLOR: Record<string, string> = { '수학': '#2563EB', '영어': '#D97706', '국어': '#059669', '과학': '#7C3AED' };
const SUBJECT_ORDER = ['수학', '영어', '국어', '과학'];
const ALL = '__all__';

function baseSubject(s: string): string {
  if (s.startsWith('수학') || /대수|기하|미적분|확률/.test(s)) return '수학';
  if (s.includes('영어')) return '영어';
  if (s.startsWith('국어') || /화법|문학|독서/.test(s)) return '국어';
  if (s.startsWith('과학') || /물리|화학|생명|지구|통합과학/.test(s)) return '과학';
  return s;
}

interface Props {
  students: StudentRow[];
  results: ExamResult[];
  links: SubjectTeacherLink[];
  classInfos: ClassInfo[];
  teachers: Teacher[];
  currentUserId: string | null;
  currentUserName: string | null;
  isAdmin: boolean;
  isTeacher: boolean;
  myStudentIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type Kind = 'prep' | 'clinic' | 'comment' | 'parent_line' | 'issue' | 'hw_note' | 'next_goal' | 'internal' | 'note';
type Scope = 'external' | 'internal';
type Event = { kind: Kind; scope: Scope; date: string; subject: string | null; text: string; by: string | null; id?: string; mine?: boolean };

interface Timeline { events: Event[]; hwRecent: number | null; hwPrev: number | null; loading: boolean }

function useStudentTimeline(studentId: string | null, userId: string | null): Timeline & { reload: () => void } {
  const [state, setState] = useState<Timeline>({ events: [], hwRecent: null, hwPrev: null, loading: false });
  const load = useCallback(async () => {
    if (!studentId) { setState({ events: [], hwRecent: null, hwPrev: null, loading: false }); return; }
    setState(s => ({ ...s, loading: true }));
    const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const hw90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const hw180 = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    const [cl, en, ws, hw, nt] = await Promise.all([
      db.from('clinic_records').select('clinic_date, subject, content, teacher_note, teacher_note_shown, teacher_display_name').eq('student_id', studentId).gte('clinic_date', since).order('clinic_date', { ascending: false }).limit(100),
      db.from('exam_prep_enrollments').select('status, created_at, confirmed_at, exam_prep_courses(title, subject, deadline_date, school_name, teacher_id, deleted_at)').eq('student_id', studentId).limit(100),
      db.from('lesson_records').select('lesson_date, subject, teacher_display_name, weekly_summary, weekly_summary_week, notes, parent_direct_message, learning_issues, learning_issues_note, homework_check_note, next_lesson_goal, internal_notes')
        .eq('student_id', studentId).gte('lesson_date', since).order('lesson_date', { ascending: false }).limit(400),
      db.from('homework_assignments').select('assigned_date, check_status, result').eq('student_id', studentId).gte('assigned_date', hw180),
      db.from('student_action_notes').select('id, note_date, subject, text, visibility, created_by, created_by_name').eq('student_id', studentId).order('note_date', { ascending: false }).limit(200).then((r: any) => r, () => ({ data: [] })),
    ]);
    const events: Event[] = [];
    const clean = (t: any) => String(t || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim(); // [보충 시간…] 스탬프 제거
    for (const c of (cl.data || []) as any[]) {
      if (clean(c.content)) events.push({ kind: 'clinic', scope: 'external', date: c.clinic_date, subject: c.subject, text: clean(c.content), by: c.teacher_display_name });
      if (clean(c.teacher_note)) events.push({ kind: 'clinic', scope: c.teacher_note_shown ? 'external' : 'internal', date: c.clinic_date, subject: c.subject, text: `(교사 메모) ${clean(c.teacher_note)}`, by: c.teacher_display_name });
    }
    for (const e of (en.data || []) as any[]) { const co = e.exam_prep_courses; if (!co || co.deleted_at) continue; const stLabel: Record<string, string> = { pending: '신청 중', cancelled: '취소', canceled: '취소', rejected: '거절', waitlist: '대기' };
      const st = e.status && !['confirmed', 'auto_confirmed', 'attended', 'completed'].includes(e.status) ? ` (${stLabel[e.status] || e.status})` : '';
      events.push({ kind: 'prep', scope: 'external', date: (e.confirmed_at || e.created_at).slice(0, 10), subject: co.subject, text: `${co.title || '내신 특강'}${co.deadline_date ? ` · 시험 ${co.deadline_date.slice(5).replace('-', '/')}` : ''}${st}`, by: null }); }
    const seen = new Set<string>();
    const AUTO = /수업계획 자동 기록|자동 기록 · 확인:|\[자동\]/; // 수업계획 기능이 내부 메모에 남기는 자동 줄 — 사람이 쓴 코멘트가 아니므로 타임라인에서 뺀다
    const push = (kind: Kind, scope: Scope, w: any, text: string, date?: string) => { const t = clean(text); if (t.length < 2 || AUTO.test(t)) return; const k = `${kind}|${w.subject}|${date || w.lesson_date}|${t}`; if (seen.has(k)) return; seen.add(k); events.push({ kind, scope, date: date || w.lesson_date, subject: w.subject, text: t, by: w.teacher_display_name }); };
    for (const w of (ws.data || []) as any[]) {
      push('comment', 'external', w, w.weekly_summary, w.weekly_summary_week || w.lesson_date);
      push('parent_line', 'external', w, w.notes);
      push('parent_line', 'external', w, w.parent_direct_message);
      const tags = Array.isArray(w.learning_issues) && w.learning_issues.length ? `[${w.learning_issues.join('·')}] ` : '';
      if (w.learning_issues_note || tags) push('issue', 'internal', w, `${tags}${w.learning_issues_note || ''}`);
      push('hw_note', 'internal', w, w.homework_check_note);
      push('next_goal', 'internal', w, w.next_lesson_goal);
      push('internal', 'internal', w, w.internal_notes);
    }
    for (const n of ((nt && nt.data) || []) as any[]) events.push({ kind: 'note', scope: n.visibility === 'external' ? 'external' : 'internal', date: n.note_date, subject: n.subject, text: n.text, by: n.created_by_name, id: n.id, mine: !!userId && n.created_by === userId });
    events.sort((a, b) => b.date.localeCompare(a.date));
    const rate = (rows: any[]) => { const checked = rows.filter(h => h.check_status === 'checked'); if (checked.length === 0) return null; const done = checked.filter(h => !h.result || ['completed', 'done', '완료'].includes(h.result)).length + checked.filter(h => ['partial', '부분완료', '일부완료'].includes(h.result)).length * 0.5; return Math.round(100 * done / checked.length); };
    const all = (hw.data || []) as any[];
    setState({ events, hwRecent: rate(all.filter(h => h.assigned_date >= hw90)), hwPrev: rate(all.filter(h => h.assigned_date < hw90)), loading: false });
  }, [studentId, userId]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

const KIND_META: Record<Kind, { label: string; icon: React.ElementType; cls: string }> = {
  prep: { label: '특강', icon: GraduationCap, cls: 'bg-primary/10 text-primary' },
  clinic: { label: '클리닉', icon: Stethoscope, cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  comment: { label: '주간 코멘트', icon: MessageSquareText, cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  parent_line: { label: '학부모께 한 줄', icon: MessageSquareText, cls: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200' },
  issue: { label: '학습 이슈', icon: NotebookPen, cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200' },
  hw_note: { label: '숙제 관찰', icon: NotebookPen, cls: 'bg-muted text-muted-foreground' },
  next_goal: { label: '다음 목표', icon: NotebookPen, cls: 'bg-muted text-muted-foreground' },
  internal: { label: '내부 메모', icon: Lock, cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  note: { label: '조치 메모', icon: NotebookPen, cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' },
};
const SCOPE_LABEL: Record<Scope, string> = { external: '학부모 공유 가능', internal: '내부용' };

export function ExamStudentView({ students, results, links, classInfos, teachers, currentUserId, currentUserName, isAdmin, isTeacher, myStudentIds, selectedId, onSelect }: Props) {
  const [q, setQ] = useState('');
  const [mineOnly, setMineOnly] = useState(isTeacher);
  const [kindFilter, setKindFilter] = useState<string>(ALL);
  const [scope, setScope] = useState<'all' | Scope>('all');
  const [showAll, setShowAll] = useState(false);
  const [noteScope, setNoteScope] = useState<Scope>('internal');
  const [noteText, setNoteText] = useState('');
  const [noteSubject, setNoteSubject] = useState<string>(ALL);
  const [noteDate, setNoteDate] = useState(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const student = useMemo(() => students.find(s => s.id === selectedId) || null, [students, selectedId]);
  const tl = useStudentTimeline(student?.id ?? null, currentUserId);

  // 담당 과목 (학생별): 매핑 우선, 반 배정 보조
  const subjectTeachers = useMemo(() => {
    const m = new Map<string, { subject: string; teacherId: string | null; teacherName: string }>();
    if (!student) return m;
    const name = (id: string | null) => (id && teachers.find(t => t.id === id)?.full_name) || '담당 미지정';
    classInfos.filter(c => c.student_id === student.id && c.subject).forEach(c => m.set(c.subject, { subject: c.subject, teacherId: c.teacher_id, teacherName: name(c.teacher_id) }));
    links.filter(l => l.student_id === student.id && l.subject).forEach(l => m.set(l.subject, { subject: l.subject, teacherId: l.teacher_id, teacherName: name(l.teacher_id) }));
    return m;
  }, [student, classInfos, links, teachers]);

  // 역할 규칙: 선생님은 자기 담당 과목만
  const visibleSubjects = useMemo(() => {
    const all = SUBJECT_ORDER.filter(s => [...subjectTeachers.keys()].map(baseSubject).includes(s) || results.some(r => r.student_id === student?.id && baseSubject(r.subject) === s));
    if (isAdmin || !currentUserId) return all;
    const mine = new Set([...subjectTeachers.values()].filter(v => v.teacherId === currentUserId).map(v => baseSubject(v.subject)));
    return all.filter(s => mine.has(s));
  }, [subjectTeachers, results, student, isAdmin, currentUserId]);

  // 점수 시계열
  const series = useMemo(() => {
    if (!student) return { points: [] as any[], bySubject: new Map<string, { k: number; label: string; score: number }[]>() };
    const bySubject = new Map<string, Map<number, { label: string; score: number }>>();
    for (const r of results) {
      if (r.student_id !== student.id || r.exam_type === 'performance' || r.actual_score == null) continue;
      const s = baseSubject(r.subject); if (!visibleSubjects.includes(s)) continue;
      const k = periodKey(r.exam_year, r.exam_period, r.exam_type);
      const m = bySubject.get(s) || bySubject.set(s, new Map()).get(s)!;
      if (!m.has(k)) m.set(k, { label: periodLabel(r.exam_year, r.exam_period, r.exam_type), score: r.actual_score });
    }
    const keys = Array.from(new Set([...bySubject.values()].flatMap(m => [...m.keys()]))).sort((a, b) => a - b);
    const points = keys.map(k => { const row: any = { k, label: [...bySubject.values()].map(m => m.get(k)?.label).find(Boolean) || '' }; for (const [s, m] of bySubject) row[s] = m.get(k)?.score ?? null; return row; });
    const flat = new Map<string, { k: number; label: string; score: number }[]>();
    for (const [s, m] of bySubject) flat.set(s, [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ k, ...v })));
    return { points, bySubject: flat };
  }, [results, student, visibleSubjects]);

  const visibleEvents = useMemo(() => tl.events.filter(e => {
    if (scope !== 'all' && e.scope !== scope) return false;
    if (kindFilter !== ALL && e.kind !== kindFilter) return false;
    if (!isAdmin && e.subject && !visibleSubjects.includes(baseSubject(e.subject))) return false;
    return true;
  }), [tl.events, kindFilter, scope, isAdmin, visibleSubjects]);

  // 상담 요약 문안 (자동, 사실만) — 내부용(전부) / 학부모용(외부 항목만)
  const buildSummary = (forParent: boolean) => {
    if (!student) return '';
    const lines: string[] = [];
    lines.push(`${student.name} (${normalizeSchool(student.school)}${student.grade_year ?? ''}) · ${new Date().toISOString().slice(0, 10)} 기준`);
    for (const s of visibleSubjects) {
      const pts = series.bySubject.get(s) || [];
      const t = subjectTeachers.get(s) || [...subjectTeachers.values()].find(v => baseSubject(v.subject) === s);
      if (pts.length === 0) { lines.push(`- ${s}${t ? `(${t.teacherName})` : ''}: 기록된 시험 점수 없음`); continue; }
      const first = pts[0], last = pts[pts.length - 1];
      const prev = pts.length >= 2 ? pts[pts.length - 2] : null;
      lines.push(`- ${s}${t ? `(${t.teacherName})` : ''}: ${last.label} ${last.score}점${prev ? ` (직전 ${prev.label} ${prev.score}, ${last.score - prev.score >= 0 ? '+' : ''}${last.score - prev.score})` : ''}${pts.length >= 3 ? ` · ${first.label}부터 ${pts.length}회 ${last.score - first.score >= 0 ? '+' : ''}${last.score - first.score}` : ''}`);
    }
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const pool = tl.events.filter(e => (isAdmin || !e.subject || visibleSubjects.includes(baseSubject(e.subject))) && (!forParent || e.scope === 'external'));
    const recent = pool.filter(e => e.date >= d90);
    const cnt = (k: Kind) => recent.filter(e => e.kind === k).length;
    const commentN = cnt('comment') + cnt('parent_line');
    lines.push(`- 최근 90일 학원 조치: 특강 ${cnt('prep')} · 클리닉 ${cnt('clinic')} · 선생님 코멘트 ${commentN}${forParent ? '' : ` · 학습 이슈 ${cnt('issue')} · 내부 메모 ${cnt('internal')}`} · 조치 메모 ${cnt('note')}${tl.hwRecent != null ? ` · 숙제 완료율 ${tl.hwRecent}%${tl.hwPrev != null ? ` (이전 90일 ${tl.hwPrev}%)` : ''}` : ''}`);
    const picks = recent.filter(e => e.kind === 'note' || e.kind === 'comment' || e.kind === 'parent_line' || (!forParent && e.kind === 'issue')).slice(0, 5);
    for (const n of picks) lines.push(`  · ${n.date.slice(5).replace('-', '/')} ${n.subject ? `[${n.subject}] ` : ''}${KIND_META[n.kind].label}: ${n.text.length > 90 ? n.text.slice(0, 88) + '…' : n.text}${n.by ? ` — ${n.by}` : ''}`);
    return lines.join('\n');
  };
  const summary = useMemo(() => buildSummary(false), [student, visibleSubjects, series, subjectTeachers, tl, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const summaryParent = useMemo(() => buildSummary(true), [student, visibleSubjects, series, subjectTeachers, tl, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveNote() {
    if (!student || noteText.trim().length < 2) return;
    setSaving(true);
    const { error } = await db.from('student_action_notes').insert({ student_id: student.id, subject: noteSubject === ALL ? null : noteSubject, note_date: noteDate, text: noteText.trim(), visibility: noteScope, created_by: currentUserId, created_by_name: currentUserName });
    setSaving(false);
    if (error) { toast.error(error.message.includes('student_action_notes') ? '조치 메모 테이블이 아직 없습니다. Lovable에서 마이그레이션을 먼저 적용해 주세요.' : error.message); return; }
    setNoteText(''); toast.success('조치 메모 저장'); tl.reload();
  }
  async function deleteNote(id: string) {
    if (!window.confirm('이 조치 메모를 지울까요?')) return;
    const { error } = await db.from('student_action_notes').delete().eq('id', id);
    if (error) toast.error(error.message); else tl.reload();
  }

  // 학생 목록
  const list = useMemo(() => {
    const qq = q.trim();
    return students
      .filter(s => (!mineOnly || !isTeacher || myStudentIds.has(s.id)) && (!qq || s.name.includes(qq) || (s.school || '').includes(qq)))
      .sort((a, b) => (normalizeSchool(a.school) || '').localeCompare(normalizeSchool(b.school) || '', 'ko') || (a.grade_year ?? 0) - (b.grade_year ?? 0) || a.name.localeCompare(b.name, 'ko'));
  }, [students, q, mineOnly, isTeacher, myStudentIds]);

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      {/* 학생 목록 — 휴대폰은 고르기 한 칸, PC는 목록 */}
      <div className="md:hidden">
        <Select value={selectedId || ''} onValueChange={onSelect}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="학생 고르기" /></SelectTrigger>
          <SelectContent>{list.map(s => <SelectItem key={s.id} value={s.id}>{s.name} · {normalizeSchool(s.school)}{s.grade_year ?? ''}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="hidden md:block rounded-lg border p-2 space-y-2 md:max-h-[78vh] md:overflow-y-auto">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="이름·학교" className="h-8 text-xs" />
        {isTeacher && <label className="flex items-center gap-1.5 text-[11px] px-1"><Switch checked={mineOnly} onCheckedChange={setMineOnly} />내 학생만</label>}
        <div className="space-y-0.5">
          {list.map(s => (
            <button key={s.id} type="button" onClick={() => onSelect(s.id)}
              className={cn('w-full text-left rounded px-2 py-1 text-xs flex items-center gap-2 hover:bg-accent', s.id === selectedId && 'bg-primary/10 text-primary font-medium')}>
              <span className="truncate">{s.name}</span><span className="ml-auto text-[10px] text-muted-foreground shrink-0">{normalizeSchool(s.school)}{s.grade_year ?? ''}</span>
            </button>
          ))}
          {list.length === 0 && <p className="text-[11px] text-muted-foreground px-2 py-3">학생이 없습니다.</p>}
        </div>
      </div>

      {/* 학생 화면 */}
      {!student ? (
        <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground text-center flex flex-col items-center gap-2"><Users className="w-5 h-5" />왼쪽에서 학생을 고르면 성적 흐름과 학원의 조치가 한 화면에 나옵니다.</div>
      ) : (
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold">{student.name}</span>
            <span className="text-sm text-muted-foreground">{normalizeSchool(student.school)} {student.grade_year ?? ''}학년</span>
            <Badge variant="outline" className="text-[11px]">{student.enrollment_status}</Badge>
            {[...subjectTeachers.values()].filter(v => isAdmin || v.teacherId === currentUserId).map(v => <Badge key={v.subject} variant="secondary" className="text-[11px] font-normal">{v.subject} · {v.teacherName}</Badge>)}
            <span className="flex-1" />
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(summary).then(() => toast.success('내부용 요약을 복사했습니다')); }}><Copy className="w-3.5 h-3.5" />내부용 복사</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(summaryParent).then(() => toast.success('학부모 상담용 요약을 복사했습니다')); }}><Copy className="w-3.5 h-3.5" />학부모 상담용 복사</Button>
          </div>

          {/* 상담 요약 — 내부용 전체. 학부모용은 외부 항목만 담긴 복사본 */}
          <pre className="rounded-lg border bg-muted/30 p-3 text-xs whitespace-pre-wrap leading-relaxed font-sans">{summary}</pre>

          {/* 점수 흐름 */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 mb-1"><span className="text-sm font-semibold">시험 점수 흐름</span><span className="text-[11px] text-muted-foreground">실점수 · 회차는 오래된 순 · 2026년 2학기 중간고사부터 전부 기록, 그 이전은 찾은 것만</span></div>
            {visibleSubjects.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">{isTeacher ? '이 학생에게 내가 담당하는 과목이 없습니다.' : '수강 과목·시험 기록이 없습니다.'}</p>
            ) : series.points.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">기록된 시험 점수가 아직 없습니다.</p>
            ) : (
              <>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series.points} margin={{ top: 12, right: 48, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="currentColor" opacity={0.12} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any, n: any) => [`${v}점`, n]} />
                      {visibleSubjects.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                      {visibleSubjects.map(s => (
                        <Line key={s} type="monotone" dataKey={s} name={s} stroke={SUBJECT_COLOR[s] || '#64748B'} strokeWidth={2} dot={{ r: 3.5, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false}>
                          <LabelList dataKey={s} position="right" formatter={(v: any) => v} content={(p: any) => { const { x, y, value, index } = p; if (index !== series.points.length - 1 || value == null) return null; return <text x={x + 8} y={y + 4} fontSize={11} fill={SUBJECT_COLOR[s] || '#64748B'}>{s} {value}</text>; }} />
                        </Line>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto mt-2">
                  <table className="text-xs w-full">
                    <thead><tr className="text-muted-foreground"><th className="text-left py-1 pr-2 font-medium">과목</th>{series.points.map(p => <th key={p.k} className="text-center px-2 py-1 font-medium whitespace-nowrap">{p.label}</th>)}</tr></thead>
                    <tbody>
                      {visibleSubjects.map(s => (
                        <tr key={s} className="border-t">
                          <td className="py-1 pr-2 font-medium whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: SUBJECT_COLOR[s] }} />{s}</td>
                          {series.points.map((p, i) => { const v = p[s]; const prev = series.points.slice(0, i).map(x => x[s]).filter((x: any) => x != null).pop(); const d = v != null && prev != null ? v - prev : null; return <td key={p.k} className="text-center px-2 py-1 tabular-nums">{v == null ? <span className="text-muted-foreground/40">·</span> : <>{v}{d != null && d !== 0 && <span className={cn('ml-0.5 text-[10px]', d > 0 ? 'text-emerald-700' : 'text-red-700')}>{d > 0 ? `+${d}` : d}</span>}</>}</td>; })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* 학원의 조치 */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">학원의 조치</span>
              <span className="text-[11px] text-muted-foreground">수업 기록의 모든 코멘트 + 특강·클리닉·조치 메모{tl.hwRecent != null ? ` · 최근 90일 숙제 완료율 ${tl.hwRecent}%${tl.hwPrev != null ? ` (이전 ${tl.hwPrev}%)` : ''}` : ''}</span>
              <span className="flex-1" />
              <div className="flex rounded-md border overflow-hidden text-[11px]">
                {(['all', 'external', 'internal'] as const).map(sc => <button key={sc} type="button" onClick={() => setScope(sc)} className={cn('px-2 h-7', scope === sc ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{sc === 'all' ? '전체' : SCOPE_LABEL[sc]}</button>)}
              </div>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ALL}>전체</SelectItem>{(Object.keys(KIND_META) as Event['kind'][]).map(k => <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* 조치 메모 입력 */}
            <div className="flex flex-wrap items-start gap-1.5 rounded-md bg-muted/30 p-2">
              <Input type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} className="h-8 w-[130px] text-xs" />
              <Select value={noteSubject} onValueChange={setNoteSubject}>
                <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ALL}>전 과목</SelectItem>{(isAdmin ? SUBJECT_ORDER : visibleSubjects).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={noteScope} onValueChange={v => setNoteScope(v as Scope)}>
                <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="internal">내부용</SelectItem><SelectItem value="external">학부모 공유 가능</SelectItem></SelectContent>
              </Select>
              <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={1} placeholder="이 시험 뒤에 학원이 한 것 · 앞으로 할 것 (예: 2학기 중간 후 수학 오답 클리닉 주 1회 추가, 11월 기말까지)" className="text-xs min-h-[32px] flex-1 min-w-[220px]" />
              <Button size="sm" className="h-8 text-xs" disabled={saving || noteText.trim().length < 2} onClick={saveNote}>{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '메모 저장'}</Button>
            </div>
            {tl.loading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />불러오는 중</p>
            ) : visibleEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">최근 1년 기록이 없습니다.</p>
            ) : (
              <ul className="space-y-1">
                {visibleEvents.slice(0, showAll ? 400 : 40).map((e, i) => { const M = KIND_META[e.kind]; const Icon = M.icon; return (
                  <li key={`${e.kind}-${e.id || i}`} className={cn('flex items-start gap-2 text-xs', e.scope === 'internal' && 'opacity-90')}>
                    <span className="w-[42px] shrink-0 tabular-nums text-muted-foreground">{e.date.slice(2).replace(/-/g, '.')}</span>
                    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 shrink-0', M.cls)} title={SCOPE_LABEL[e.scope]}><Icon className="w-3 h-3" />{M.label}{e.scope === 'internal' && <Lock className="w-2.5 h-2.5 opacity-70" />}</span>
                    {e.subject && <span className="shrink-0 text-muted-foreground">{e.subject}</span>}
                    <span className="min-w-0 flex-1 leading-snug">{e.text}{e.by && <span className="ml-1 text-muted-foreground">— {e.by}</span>}</span>
                    {e.kind === 'note' && (e.mine || isAdmin) && e.id && <button type="button" className="text-muted-foreground hover:text-destructive" title="삭제" onClick={() => deleteNote(e.id!)}><Trash2 className="w-3.5 h-3.5" /></button>}
                  </li>); })}
                {visibleEvents.length > 40 && <li><button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowAll(v => !v)}>{showAll ? '접기' : `${visibleEvents.length - 40}건 더 보기`}</button></li>}
              </ul>
            )}
            <p className="text-[10px] text-muted-foreground">🔒 = 내부용(학습 이슈·숙제 관찰·다음 목표·내부 메모·교사 메모). "학부모 상담용 복사"에는 들어가지 않습니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}
