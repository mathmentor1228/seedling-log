// EXAM-MODES-V1 ② 마감 점검 — 최근 끝난 시험에 대해 "결과값·시험지·분석지가 다 들어왔나"를 과목×담당 선생님 격자로.
// 빠진 칸은 빨강. 강사도 전체를 보되 자기 줄이 강조된다. 행을 누르면 그 사이클의 학생 결과 탭으로.
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ddayLabel, gradeLabel, type Cycle, type DdayState, type DeepReportRow, type ReportRow, type StudentSubjectRow } from './examHubUtils';

export interface ReviewCard {
  cycle: Cycle; st: DdayState; rows: StudentSubjectRow[]; reports: ReportRow[]; cycleSubjects: string[];
}
interface Props {
  cards: ReviewCard[];
  deepByReport: Map<string, DeepReportRow>;
  currentUserId: string | null;
  onOpen: (c: Cycle, tab: 'results' | 'papers') => void;
}

type Line = { subject: string; teacherId: string | null; teacherName: string; n: number; done: number; scoreEmpty: number; missing: number; pdf: number; absent: number };

function Cell({ ok, warn, children, title }: { ok: boolean; warn?: boolean; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs tabular-nums min-w-[56px]',
      ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
        : warn ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200')}>
      {children}
    </span>
  );
}

export function ExamCloseoutReview({ cards, deepByReport, currentUserId, onOpen }: Props) {
  const data = useMemo(() => cards.map(cc => {
    const byKey = new Map<string, Line>();
    for (const r of cc.rows) {
      const k = `${r.subject}|${r.teacherId || ''}`;
      const l = byKey.get(k) || { subject: r.subject, teacherId: r.teacherId, teacherName: r.teacherName || '담당 미지정', n: 0, done: 0, scoreEmpty: 0, missing: 0, pdf: 0, absent: 0 };
      if (r.status === 'absent') l.absent += 1; else { l.n += 1; if (r.status === 'done') l.done += 1; else if (r.status === 'score_empty') l.scoreEmpty += 1; else l.missing += 1; if (r.pdf) l.pdf += 1; }
      byKey.set(k, l);
    }
    const lines = [...byKey.values()].sort((a, b) => a.subject.localeCompare(b.subject, 'ko') || a.teacherName.localeCompare(b.teacherName, 'ko'));
    const reportBySubject = new Map(cc.reports.map(r => [r.subject, r]));
    const subjects = Array.from(new Set([...cc.cycleSubjects, ...lines.map(l => l.subject)])).sort((a, b) => a.localeCompare(b, 'ko'));
    const totalN = lines.reduce((s, l) => s + l.n, 0), totalDone = lines.reduce((s, l) => s + l.done, 0), totalPdf = lines.reduce((s, l) => s + l.pdf, 0);
    const reportsDone = subjects.filter(s => reportBySubject.has(s)).length;
    const complete = totalN > 0 && totalDone === totalN && totalPdf === totalN && reportsDone === subjects.length;
    return { cc, lines, reportBySubject, subjects, totalN, totalDone, totalPdf, reportsDone, complete };
  }), [cards]);

  if (data.length === 0) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">최근 60일 안에 끝난 시험이 없습니다. 시험이 끝나면 여기서 점수·시험지·분석지 입력 상태를 점검합니다.</div>;
  }

  return (
    <div className="space-y-4">
      {data.map(({ cc, lines, reportBySubject, subjects, totalN, totalDone, totalPdf, reportsDone, complete }) => (
        <div key={cc.cycle.id} className={cn('rounded-lg border', complete ? 'border-emerald-300/60' : 'border-red-300/60')}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
            {complete ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
            <span className="font-semibold">{cc.cycle.school_name} {gradeLabel(cc.cycle)} · {cc.cycle.semester} {cc.cycle.exam_type}</span>
            <Badge variant="outline" className="text-[11px]">{ddayLabel(cc.st)}</Badge>
            <span className="text-xs text-muted-foreground">
              점수 {totalDone}/{totalN} · 시험지 {totalPdf}/{totalN} · 분석지 {reportsDone}/{subjects.length}
            </span>
            <span className="flex-1" />
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => onOpen(cc.cycle, 'results')}>학생 결과 열기</button>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => onOpen(cc.cycle, 'papers')}>시험지 분석 열기</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-4 py-1.5 font-medium">과목 · 선생님</th>
                  <th className="text-center px-2 py-1.5 font-medium">학생</th>
                  <th className="text-center px-2 py-1.5 font-medium">점수 입력</th>
                  <th className="text-center px-2 py-1.5 font-medium">시험지 PDF</th>
                  <th className="text-center px-2 py-1.5 font-medium">분석지</th>
                  <th className="text-left px-2 py-1.5 font-medium">빠진 것</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-4 text-xs text-muted-foreground">대상 학생이 없습니다(수강 과목·담당 연결 없음 또는 전원 미응시).</td></tr>
                )}
                {lines.map(l => {
                  const mine = !!currentUserId && l.teacherId === currentUserId;
                  const rep = reportBySubject.get(l.subject);
                  const deep = rep ? deepByReport.get(rep.id) : undefined;
                  const gaps: string[] = [];
                  if (l.missing) gaps.push(`시트에 없음 ${l.missing}`);
                  if (l.scoreEmpty) gaps.push(`실점수 공란 ${l.scoreEmpty}`);
                  if (l.n - l.pdf > 0) gaps.push(`시험지 없음 ${l.n - l.pdf}`);
                  if (!rep) gaps.push('분석지 미작성'); else if (!rep.is_published) gaps.push('분석지 미공개');
                  return (
                    <tr key={`${l.subject}|${l.teacherId}`} className={cn('border-t', mine && 'bg-primary/5')}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="font-medium">{l.subject}</span>
                        <span className="ml-2 text-muted-foreground">{l.teacherName}</span>
                        {mine && <span className="ml-1 text-[10px] text-primary">(나)</span>}
                        {l.absent > 0 && <span className="ml-1 text-[10px] text-muted-foreground">미응시 {l.absent}</span>}
                      </td>
                      <td className="text-center px-2 py-2 tabular-nums">{l.n}</td>
                      <td className="text-center px-2 py-2"><Cell ok={l.done === l.n} warn={l.done > 0}>{l.done}/{l.n}</Cell></td>
                      <td className="text-center px-2 py-2"><Cell ok={l.pdf === l.n} warn={l.pdf > 0}>{l.pdf}/{l.n}</Cell></td>
                      <td className="text-center px-2 py-2">
                        <Cell ok={!!rep && rep.is_published} warn={!!rep} title={rep ? `${rep.created_by_name || ''} ${rep.updated_at?.slice(0, 10) || ''}` : undefined}>
                          {!rep ? '없음' : rep.is_published ? '공개' : deep?.teacher_notes ? '내부·메모' : '내부'}
                        </Cell>
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{gaps.length ? gaps.join(' · ') : <span className="text-emerald-700">완료</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5" />점수·시험지는 성적취합표(시트)와 드라이브에서 동기화된 값입니다. 빠진 칸은 시트에 입력하거나 제출창으로 시험지를 올리면 다음 동기화 때 채워집니다. 분석지는 시험지 분석 탭에서 작성·공개합니다.</p>
    </div>
  );
}
