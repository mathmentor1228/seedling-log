// EXAM-HISTORY-V1: 과거 시험 기록을 한 표로. (원장 요청 2026-10-10: "최신 시험 기준으로만 보이고 과거 기록은 보기 불편")
// 행 = 학생 × 과목, 열 = 시험 회차(오래된 → 최신), 칸 = 실점수(가채점만 있으면 괄호). 사이클이 없는 옛 시험(2023~)도 결과만 있으면 보인다.
// 필터: 학교·학년 / 과목 / 학생 검색. 회차 표기는 periodLabel 로 정규화(1-a · 1학기 · None 혼재).
import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { normalizeSchool } from '@/components/exam-board/cycleUtils';
import { periodKey, periodLabel, type ExamResult, type StudentRow } from './examHubUtils';

interface Props {
  students: StudentRow[]; results: ExamResult[];
  /** 기록·과목 모드에서 학교·학년·과목을 고정해 끼워 넣을 때 */
  preset?: { schoolGrade?: string; subject?: string };
  hideFilters?: boolean;
}
export function schoolGradeKey(s: Pick<StudentRow, 'school' | 'grade_year'>): string { return `${normalizeSchool(s.school) || '학교 미상'} ${s.grade_year ?? '?'}`; }

const ALL = '__all__';

function baseSubject(s: string): string {
  if (s.startsWith('수학') || /대수|기하|미적분|확률/.test(s)) return '수학';
  if (s.startsWith('영어') || s.includes('영어')) return '영어';
  if (s.startsWith('국어') || /화법|문학|독서/.test(s)) return '국어';
  if (s.startsWith('과학') || /물리|화학|생명|지구|통합과학/.test(s)) return '과학';
  return s;
}

export function ExamHistoryView({ students, results, preset, hideFilters }: Props) {
  const [schoolGrade, setSchoolGrade] = useState(preset?.schoolGrade || ALL);
  const [subject, setSubject] = useState(preset?.subject || ALL);
  useEffect(() => { if (preset) { setSchoolGrade(preset.schoolGrade || ALL); setSubject(preset.subject || ALL); } }, [preset?.schoolGrade, preset?.subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState('');
  const [allPeriods, setAllPeriods] = useState(false);
  const RECENT = 8;

  const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
  const schoolGrades = useMemo(() => {
    const set = new Map<string, number>();
    for (const s of students) { const k = schoolGradeKey(s); set.set(k, (set.get(k) || 0) + 1); }
    return [...set.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  }, [students]);

  // 회차 열 (오래된 → 최신), 결과 있는 회차만
  const periods = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of results) {
      if (r.exam_type === 'performance') continue;
      const k = periodKey(r.exam_year, r.exam_period, r.exam_type);
      if (!m.has(k)) m.set(k, periodLabel(r.exam_year, r.exam_period, r.exam_type));
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [results]);

  const rows = useMemo(() => {
    const byKey = new Map<string, { student: StudentRow; subject: string; cells: Map<number, ExamResult> }>();
    for (const r of results) {
      if (r.exam_type === 'performance') continue;
      const st = studentById.get(r.student_id);
      if (!st) continue; // 퇴원생 등 현재 명단 밖
      const subj = baseSubject(r.subject);
      if (subject !== ALL && subj !== subject) continue;
      if (schoolGrade !== ALL && schoolGradeKey(st) !== schoolGrade) continue;
      if (q && !st.name.includes(q)) continue;
      const key = `${st.id}|${subj}`;
      const row = byKey.get(key) || { student: st, subject: subj, cells: new Map() };
      const pk = periodKey(r.exam_year, r.exam_period, r.exam_type);
      const prev = row.cells.get(pk);
      // 같은 회차에 여러 행(세부 과목)이면 실점수 있는 쪽 우선
      if (!prev || (prev.actual_score == null && r.actual_score != null)) row.cells.set(pk, r);
      byKey.set(key, row);
    }
    return [...byKey.values()].sort((a, b) =>
      (normalizeSchool(a.student.school) || '').localeCompare(normalizeSchool(b.student.school) || '', 'ko')
      || (a.student.grade_year ?? 0) - (b.student.grade_year ?? 0)
      || a.student.name.localeCompare(b.student.name, 'ko')
      || a.subject.localeCompare(b.subject, 'ko'));
  }, [results, studentById, subject, schoolGrade, q]);

  // 표시 열: 필터된 행에 값이 하나라도 있는 회차만. 기본은 최근 8회차, "전체 회차"로 펼침
  const periodsWithData = useMemo(() => periods.filter(([k]) => rows.some(r => r.cells.has(k))), [periods, rows]);
  const visiblePeriods = useMemo(() => allPeriods ? periodsWithData : periodsWithData.slice(-RECENT), [periodsWithData, allPeriods]);
  const visibleRows = useMemo(() => rows.filter(r => visiblePeriods.some(([k]) => r.cells.has(k))), [rows, visiblePeriods]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!hideFilters && <>
        <Select value={schoolGrade} onValueChange={setSchoolGrade}>
          <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="학교·학년" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체 학교·학년</SelectItem>
            {schoolGrades.map(([k, n]) => <SelectItem key={k} value={k}>{k} ({n})</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="과목" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체 과목</SelectItem>
            {['수학', '영어', '국어', '과학'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        </>}
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="학생 이름" className="h-8 w-[140px] text-xs" />
        {periodsWithData.length > RECENT && (
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setAllPeriods(v => !v)}>
            {allPeriods ? `최근 ${RECENT}회차만` : `전체 ${periodsWithData.length}회차 보기`}
          </button>
        )}
        <span className="text-[11px] text-muted-foreground">학생 {new Set(visibleRows.map(r => r.student.id)).size}명 · {visibleRows.length}행 · 회차 {visiblePeriods.length}개. 가로로 넘기며 추이를 봅니다. 괄호는 가채점만 있는 값.</span>
      </div>

      {visibleRows.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">조건에 맞는 기록이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs sticky left-0 bg-background z-10 min-w-[150px]">학생 · 과목</TableHead>
                {visiblePeriods.map(([k, label]) => <TableHead key={k} className="text-xs text-center whitespace-nowrap min-w-[76px]">{label}</TableHead>)}
                <TableHead className="text-xs text-center whitespace-nowrap">추이</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map(r => {
                const seq = visiblePeriods.map(([k]) => r.cells.get(k)?.actual_score ?? null).filter((v): v is number => v != null);
                const first = seq[0], last = seq[seq.length - 1];
                const delta = seq.length >= 2 ? last - first : null;
                return (
                  <TableRow key={`${r.student.id}|${r.subject}`}>
                    <TableCell className="text-xs sticky left-0 bg-background z-10 whitespace-nowrap">
                      <span className="font-medium">{r.student.name}</span>
                      <span className="ml-1 text-muted-foreground">{normalizeSchool(r.student.school)}{r.student.grade_year}</span>
                      <Badge variant="outline" className="ml-1 text-[10px] px-1">{r.subject}</Badge>
                    </TableCell>
                    {visiblePeriods.map(([k], i) => {
                      const c = r.cells.get(k);
                      if (!c) return <TableCell key={k} className="text-center text-muted-foreground/40 text-xs">·</TableCell>;
                      const v = c.actual_score ?? c.expected_score;
                      const prevK = visiblePeriods.slice(0, i).map(([pk]) => r.cells.get(pk)?.actual_score ?? null).filter((x): x is number => x != null).pop();
                      const diff = c.actual_score != null && prevK != null ? c.actual_score - prevK : null;
                      return (
                        <TableCell key={k} className="text-center text-xs tabular-nums whitespace-nowrap" title={c.note || undefined}>
                          <span className={cn(c.actual_score == null && 'text-muted-foreground')}>{c.actual_score == null ? (v != null ? `(${v})` : '–') : v}</span>
                          {diff != null && diff !== 0 && <span className={cn('ml-0.5 text-[10px]', diff > 0 ? 'text-emerald-700' : 'text-red-700')}>{diff > 0 ? `+${diff}` : diff}</span>}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center text-xs tabular-nums whitespace-nowrap">
                      {delta == null ? <span className="text-muted-foreground">–</span>
                        : <span className={cn(delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-700' : 'text-muted-foreground')}>{first}→{last} ({delta > 0 ? '+' : ''}{delta})</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
