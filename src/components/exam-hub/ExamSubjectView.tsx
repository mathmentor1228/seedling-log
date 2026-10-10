// EXAM-MODES-V1 ③ 기록·과목 — "이 학교 이 학년 이 과목은 어떤 시험이고, 우리 아이들은 어떻게 흘러왔나" (vault 19 §19-1).
// 수업 준비(선생님)와 신규 상담(원장) 겸용. 선생님은 자기 담당 과목만.
// 재료: student_exam_results(우리 학생 점수, 시험 당시 학년으로 환산) · exam_analysis_reports/items/deep(시험 특성·총평·티칭 메모) · 범위(사이클·자료실).
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { normalizeSchool } from '@/components/exam-board/cycleUtils';
import { ExamHistoryView, schoolGradeKey } from './ExamHistoryView';
import { periodKey, periodLabel, type ArchiveRow, type ClassInfo, type Cycle, type CycleSubject, type DeepReportRow, type ExamResult, type ReportRow, type StudentRow, type SubjectTeacherLink } from './examHubUtils';

const db = supabase as any;
const SUBJECTS = ['수학', '영어', '국어', '과학'];
const DIFF_ORDER = ['하', '중하', '중', '중상', '상', '매우어려움'];
const ACADEMIC_YEAR = (() => { const d = new Date(Date.now() + 9 * 3600 * 1000); return d.getUTCMonth() + 1 >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; })();

export function baseSubject(s: string): string {
  if (s.startsWith('수학') || /대수|기하|미적분|확률/.test(s)) return '수학';
  if (s.includes('영어')) return '영어';
  if (s.startsWith('국어') || /화법|문학|독서/.test(s)) return '국어';
  if (s.startsWith('과학') || /물리|화학|생명|지구|통합과학/.test(s)) return '과학';
  return s;
}

interface Props {
  students: StudentRow[]; results: ExamResult[]; reports: ReportRow[]; deepByReport: Map<string, DeepReportRow>;
  cycles: Cycle[]; subjectsByCycle: Map<string, CycleSubject[]>; archives: ArchiveRow[];
  links: SubjectTeacherLink[]; classInfos: ClassInfo[];
  currentUserId: string | null; isAdmin: boolean; isTeacher: boolean;
  sel: { school: string; grade: number; subject: string } | null;
  onSel: (v: { school: string; grade: number; subject: string }) => void;
}

type PeriodStat = { k: number; label: string; n: number; avg: number; max: number; min: number; up: number; down: number; same: number; prevAvgSame: number | null };
type ItemRow = { report_id: string; difficulty: string | null; item_type: string | null; area: string | null; question_type: string | null; points: number | null };
type Extra = { id: string; overall_review: string | null; exam_scope: string | null; textbook: string | null };

export function ExamSubjectView({ students, results, reports, deepByReport, cycles, subjectsByCycle, archives, links, classInfos, currentUserId, isAdmin, isTeacher, sel, onSel }: Props) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [extras, setExtras] = useState<Map<string, Extra>>(new Map());
  const [loading, setLoading] = useState(false);
  const [openReview, setOpenReview] = useState<Set<string>>(new Set());

  // 선택지
  const schools = useMemo(() => Array.from(new Set([...students.map(s => normalizeSchool(s.school)), ...reports.map(r => r.school_name)].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')), [students, reports]);
  const mySubjects = useMemo(() => {
    if (isAdmin || !currentUserId) return SUBJECTS;
    const set = new Set<string>();
    links.filter(l => l.teacher_id === currentUserId).forEach(l => set.add(baseSubject(l.subject)));
    classInfos.filter(c => c.teacher_id === currentUserId && c.subject).forEach(c => set.add(baseSubject(c.subject)));
    return SUBJECTS.filter(s => set.has(s));
  }, [isAdmin, currentUserId, links, classInfos]);

  useEffect(() => {
    if (!sel && schools.length > 0 && mySubjects.length > 0) onSel({ school: schools[0], grade: 1, subject: mySubjects[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools.length, mySubjects.length]);

  const allowed = !!sel && (isAdmin || mySubjects.includes(sel.subject));

  // 이 학교·학년·과목의 분석보고서 (회차순)
  const subjReports = useMemo(() => !sel ? [] : reports
    .filter(r => r.school_name === sel.school && String(r.grade).replace(/[^0-9]/g, '') === String(sel.grade) && baseSubject(r.subject) === sel.subject)
    .map(r => ({ r, k: periodKey(r.exam_year, r.exam_period, r.exam_type), label: periodLabel(r.exam_year, r.exam_period, r.exam_type) }))
    .sort((a, b) => a.k - b.k), [reports, sel]);

  useEffect(() => {
    const ids = subjReports.map(x => x.r.id);
    if (ids.length === 0) { setItems([]); setExtras(new Map()); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      db.from('exam_analysis_items').select('report_id, difficulty, item_type, area, question_type, points').in('report_id', ids).limit(2000),
      db.from('exam_analysis_reports').select('id, overall_review, exam_scope, textbook').in('id', ids),
    ]).then(([it, ex]: any[]) => {
      if (cancelled) return;
      setItems((it.data || []) as ItemRow[]);
      setExtras(new Map(((ex.data || []) as Extra[]).map(e => [e.id, e])));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [subjReports.map(x => x.r.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // 우리 학생 점수 — 시험 당시 학년으로 환산해 같은 학년 시험끼리 모은다
  const stats = useMemo<PeriodStat[]>(() => {
    if (!sel) return [];
    const byId = new Map(students.map(s => [s.id, s]));
    const byPeriod = new Map<number, { label: string; scores: Map<string, number> }>();
    for (const r of results) {
      if (r.exam_type === 'performance' || r.actual_score == null || !r.exam_year) continue;
      const st = byId.get(r.student_id); if (!st || st.grade_year == null) continue;
      if (normalizeSchool(st.school) !== sel.school || baseSubject(r.subject) !== sel.subject) continue;
      const gradeAt = st.grade_year - (ACADEMIC_YEAR - r.exam_year);
      if (gradeAt !== sel.grade) continue;
      const k = periodKey(r.exam_year, r.exam_period, r.exam_type);
      const p = byPeriod.get(k) || byPeriod.set(k, { label: periodLabel(r.exam_year, r.exam_period, r.exam_type), scores: new Map() }).get(k)!;
      if (!p.scores.has(r.student_id)) p.scores.set(r.student_id, r.actual_score);
    }
    const keys = [...byPeriod.keys()].sort((a, b) => a - b);
    return keys.map((k, i) => {
      const p = byPeriod.get(k)!; const vals = [...p.scores.values()];
      const prev = i > 0 ? byPeriod.get(keys[i - 1])! : null;
      let up = 0, down = 0, same = 0, prevSum = 0, prevN = 0;
      if (prev) for (const [sid, v] of p.scores) { const pv = prev.scores.get(sid); if (pv == null) continue; prevN += 1; prevSum += pv; if (v > pv) up += 1; else if (v < pv) down += 1; else same += 1; }
      return { k, label: p.label, n: vals.length, avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10, max: Math.max(...vals), min: Math.min(...vals), up, down, same, prevAvgSame: prevN ? Math.round(prevSum / prevN * 10) / 10 : null };
    });
  }, [results, students, sel]);

  // 시험 특성 (보고서별)
  const traits = useMemo(() => subjReports.map(({ r, k, label }) => {
    const its = items.filter(i => i.report_id === r.id);
    const diff = new Map<string, number>(); its.forEach(i => { if (i.difficulty) diff.set(i.difficulty, (diff.get(i.difficulty) || 0) + 1); });
    const hard = its.filter(i => i.difficulty === '중상' || i.difficulty === '상' || i.difficulty === '매우어려움').length;
    const essay = its.filter(i => i.item_type && i.item_type !== '객관식').length;
    const essayPts = its.filter(i => i.item_type && i.item_type !== '객관식').reduce((s, i) => s + (i.points || 0), 0);
    const area = new Map<string, number>(); its.forEach(i => { if (i.area) area.set(i.area, (area.get(i.area) || 0) + 1); });
    const topAreas = [...area.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const ex = extras.get(r.id); const deep = deepByReport.get(r.id);
    return { r, k, label, n: its.length, diff, hard, essay, essayPts, topAreas, review: ex?.overall_review || null, scope: ex?.exam_scope || null, textbook: ex?.textbook || null, notes: deep?.teacher_notes || null };
  }), [subjReports, items, extras, deepByReport]);

  // 범위 이력 (사이클·자료실)
  const scopeHistory = useMemo(() => {
    if (!sel) return [] as { k: number; label: string; scope: string; src: string }[];
    const out: { k: number; label: string; scope: string; src: string }[] = [];
    for (const c of cycles) {
      if (normalizeSchool(c.school_name) !== sel.school || c.grade_year !== sel.grade) continue;
      const cs = (subjectsByCycle.get(c.id) || []).find(x => baseSubject(x.subject) === sel.subject);
      if (cs?.scope) out.push({ k: periodKey(c.academic_year, c.semester.includes('2') ? '2' : '1', c.exam_type), label: `${String(c.academic_year).slice(2)}년 ${c.semester} ${c.exam_type.replace('고사', '')}`, scope: cs.scope, src: '시험 정보' });
    }
    for (const a of archives) {
      if (a.school_name !== sel.school || a.grade_year !== sel.grade || baseSubject(a.subject) !== sel.subject || !a.exam_scope) continue;
      const k = periodKey(a.academic_year, a.semester.includes('2') ? '2' : '1', a.exam_type);
      if (out.some(o => o.k === k)) continue;
      out.push({ k, label: `${String(a.academic_year).slice(2)}년 ${a.semester} ${a.exam_type.replace('고사', '')}`, scope: a.exam_scope, src: '자료실' });
    }
    for (const t of traits) if (t.scope && !out.some(o => o.k === t.k)) out.push({ k: t.k, label: t.label, scope: t.scope, src: '분석지' });
    return out.sort((a, b) => b.k - a.k).slice(0, 6);
  }, [cycles, subjectsByCycle, archives, traits, sel]);

  // 신규 상담 요약 (사실만)
  const summary = useMemo(() => {
    if (!sel) return '';
    const L: string[] = [`${sel.school} ${sel.grade}학년 ${sel.subject} · ${new Date().toISOString().slice(0, 10)} 기준`];
    if (stats.length === 0) L.push('- 우리 학원 학생의 이 시험 점수 기록 없음');
    else {
      const last = stats[stats.length - 1];
      const ids = new Set<number>(); const n = stats.reduce((s, p) => s + p.n, 0);
      L.push(`- 우리 학원 학생 점수 기록 ${stats.length}회차 · 누적 ${n}명분`);
      L.push(`- 회차별 평균: ${stats.map(p => `${p.label} ${p.avg}`).join(' → ')}`);
      L.push(`- 최근 ${last.label}: 평균 ${last.avg} (최고 ${last.max} · 최저 ${last.min}, ${last.n}명)${last.prevAvgSame != null ? ` · 직전 회차 대비 상승 ${last.up}명 · 하락 ${last.down}명 · 유지 ${last.same}명` : ''}`);
      void ids;
    }
    const t = traits[traits.length - 1];
    if (t && t.n > 0) L.push(`- 최근 시험지(${t.label}) 특성: ${t.n}문항 · 중상 이상 ${Math.round(100 * t.hard / t.n)}% · 논술형 ${t.essay}문항${t.essayPts ? `(${t.essayPts}점)` : ''}${t.topAreas.length ? ` · 주요 영역 ${t.topAreas.map(a => a[0]).join('·')}` : ''}${t.r.exam_difficulty ? ` · 전체 난도 ${t.r.exam_difficulty}` : ''}`);
    else if (t?.r.exam_difficulty) L.push(`- 최근 시험지(${t.label}) 난도 ${t.r.exam_difficulty}`);
    if (scopeHistory[0]) L.push(`- 최근 범위(${scopeHistory[0].label}): ${scopeHistory[0].scope.replace(/\s+/g, ' ').slice(0, 120)}${scopeHistory[0].scope.length > 120 ? '…' : ''}`);
    return L.join('\n');
  }, [sel, stats, traits, scopeHistory]);

  const presetSchoolGrade = sel ? `${sel.school} ${sel.grade}` : undefined;

  return (
    <div className="space-y-4">
      {/* 선택 */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sel?.school || ''} onValueChange={v => sel && onSel({ ...sel, school: v })}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="학교" /></SelectTrigger>
          <SelectContent>{schools.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex rounded-md border overflow-hidden">
          {[1, 2, 3].map(g => <button key={g} type="button" onClick={() => sel && onSel({ ...sel, grade: g })} className={cn('px-3 h-8 text-xs', sel?.grade === g ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{g}학년</button>)}
        </div>
        <div className="flex rounded-md border overflow-hidden">
          {SUBJECTS.map(s => { const ok = isAdmin || mySubjects.includes(s); return <button key={s} type="button" disabled={!ok} onClick={() => sel && onSel({ ...sel, subject: s })} title={ok ? undefined : '담당 과목이 아닙니다'} className={cn('px-3 h-8 text-xs', sel?.subject === s ? 'bg-primary text-primary-foreground' : ok ? 'hover:bg-muted' : 'text-muted-foreground/40 cursor-not-allowed')}>{s}</button>; })}
        </div>
        <span className="flex-1" />
        {allowed && <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => navigator.clipboard.writeText(summary).then(() => toast.success('상담 요약을 복사했습니다'))}><Copy className="w-3.5 h-3.5" />신규 상담 요약 복사</Button>}
      </div>

      {!sel ? null : !allowed ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">담당 과목({mySubjects.join('·') || '없음'})의 기록만 볼 수 있습니다.</div>
      ) : (
        <>
          <pre className="rounded-lg border bg-muted/30 p-3 text-xs whitespace-pre-wrap leading-relaxed font-sans">{summary}</pre>

          {/* 회차별 우리 학생 평균 */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 mb-1"><span className="text-sm font-semibold">회차별 우리 학생 평균</span><span className="text-[11px] text-muted-foreground">시험 당시 학년 기준으로 같은 학년 시험끼리 · 현재 재원생 기록만 · 2026년 2학기 중간부터 전부 기록</span></div>
            {stats.length === 0 ? <p className="text-xs text-muted-foreground py-3">이 학교·학년·과목의 우리 학생 점수 기록이 없습니다.</p> : (
              <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="currentColor" opacity={0.12} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any, n: any) => [v, n === 'avg' ? '평균' : n === 'max' ? '최고' : '최저']} />
                      <Line type="monotone" dataKey="max" stroke="#94A3B8" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="min" stroke="#94A3B8" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="avg" stroke="#2563EB" strokeWidth={2} dot={{ r: 3.5, strokeWidth: 2, fill: '#fff' }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead><tr className="text-muted-foreground"><th className="text-left py-1 font-medium">회차</th><th className="text-right px-1 font-medium">인원</th><th className="text-right px-1 font-medium">평균</th><th className="text-right px-1 font-medium">최고·최저</th><th className="text-right px-1 font-medium">직전 대비</th></tr></thead>
                    <tbody>{[...stats].reverse().map(p => (
                      <tr key={p.k} className="border-t"><td className="py-1 whitespace-nowrap">{p.label}</td><td className="text-right px-1 tabular-nums">{p.n}</td><td className="text-right px-1 tabular-nums font-medium">{p.avg}</td><td className="text-right px-1 tabular-nums text-muted-foreground">{p.max}·{p.min}</td>
                        <td className="text-right px-1 tabular-nums whitespace-nowrap">{p.prevAvgSame == null ? <span className="text-muted-foreground">–</span> : <><span className="text-emerald-700">▲{p.up}</span> <span className="text-red-700">▼{p.down}</span>{p.same ? <span className="text-muted-foreground"> ={p.same}</span> : null}</>}</td></tr>
                    ))}</tbody>
                  </table>
                  <p className="text-[10px] text-muted-foreground mt-1">직전 대비는 두 회차에 모두 점수가 있는 학생만 셉니다.</p>
                </div>
              </div>
            )}
          </div>

          {/* 시험 특성 — 분석지 */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2"><span className="text-sm font-semibold">시험 특성 · 출제 경향</span><span className="text-[11px] text-muted-foreground">시험지 분석보고서 기준(문항 난도·유형·영역·총평·티칭 메모). 수업 준비용.</span>{loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}</div>
            {traits.length === 0 ? <p className="text-xs text-muted-foreground py-2">이 학교·학년·과목의 시험지 분석이 아직 없습니다. 시험이 끝나면 시험지 분석 탭에서 작성합니다.</p> : (
              <div className="space-y-2">
                {[...traits].reverse().map(t => {
                  const open = openReview.has(t.r.id);
                  return (
                    <div key={t.r.id} className="rounded-md border p-2.5 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-sm">{t.label}</span>
                        <span className="text-muted-foreground">{t.r.subject}</span>
                        {t.r.exam_difficulty && <Badge variant="outline" className="text-[11px]">난도 {t.r.exam_difficulty}</Badge>}
                        {t.r.avg_score != null && <span className="text-muted-foreground">학교 평균 {t.r.avg_score}</span>}
                        <Badge variant={t.r.is_published ? 'default' : 'secondary'} className="text-[10px]">{t.r.is_published ? '학부모 공개' : '내부'}</Badge>
                        {t.textbook && <span className="text-muted-foreground">교과서 {t.textbook}</span>}
                      </div>
                      {t.n > 0 && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span>{t.n}문항 · 객관식 {t.n - t.essay} · <b>논술형 {t.essay}</b>{t.essayPts ? ` (${t.essayPts}점)` : ''}</span>
                          <span className="inline-flex items-center gap-1">난도
                            <span className="inline-flex h-2.5 w-[120px] rounded overflow-hidden bg-muted" title={DIFF_ORDER.filter(d => t.diff.get(d)).map(d => `${d} ${t.diff.get(d)}`).join(' · ')}>
                              {DIFF_ORDER.map((d, i) => { const c = t.diff.get(d) || 0; if (!c) return null; const shade = ['#CBD5E1', '#94A3B8', '#64748B', '#F59E0B', '#DC2626', '#7F1D1D'][i]; return <span key={d} style={{ width: `${100 * c / t.n}%`, background: shade }} />; })}
                            </span>
                            <b className={cn(t.hard / t.n >= 0.4 ? 'text-red-700' : '')}>중상 이상 {Math.round(100 * t.hard / t.n)}%</b>
                          </span>
                          {t.topAreas.length > 0 && <span>주요 영역 {t.topAreas.map(a => `${a[0]} ${a[1]}`).join(' · ')}</span>}
                        </div>
                      )}
                      {(t.review || t.notes) && (
                        <div className="text-xs">
                          <button type="button" className="text-primary hover:underline" onClick={() => setOpenReview(prev => { const n = new Set(prev); if (n.has(t.r.id)) n.delete(t.r.id); else n.add(t.r.id); return n; })}>{open ? '총평·티칭 메모 접기' : '총평·티칭 메모 보기'}</button>
                          {open && (
                            <div className="mt-1.5 space-y-1.5">
                              {t.review && <p className="whitespace-pre-wrap leading-relaxed rounded bg-muted/30 p-2">{t.review}</p>}
                              {t.notes && <p className="whitespace-pre-wrap leading-relaxed rounded bg-amber-50 dark:bg-amber-950/20 p-2"><span className="font-medium">티칭 메모</span> {t.notes}</p>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 범위 이력 */}
          {scopeHistory.length > 0 && (
            <div className="rounded-lg border p-3">
              <div className="text-sm font-semibold mb-1">시험 범위 이력</div>
              <ul className="text-xs space-y-1">{scopeHistory.map(s => <li key={s.k} className="flex gap-2"><span className="w-[110px] shrink-0 text-muted-foreground">{s.label}</span><span className="whitespace-pre-wrap">{s.scope}</span><span className="text-[10px] text-muted-foreground shrink-0">{s.src}</span></li>)}</ul>
            </div>
          )}

          {/* 현재 학생들의 추이 표 */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 mb-2"><span className="text-sm font-semibold">현재 {sel.school} {sel.grade}학년 학생 · {sel.subject} 추이</span><span className="text-[11px] text-muted-foreground">학생 × 회차 실점수(현재 학년 기준 명단)</span></div>
            <ExamHistoryView students={students} results={results} preset={{ schoolGrade: presetSchoolGrade, subject: sel.subject }} hideFilters />
          </div>
        </>
      )}
    </div>
  );
}
