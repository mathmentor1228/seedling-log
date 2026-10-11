// PAST-CYCLES-V1: '지난 시험' 정리 표 — 연도 → 학교·학년 → 회차 행 × 과목 열. 카드 띠 대신 한눈에 보기 (원장 요청 2026-10-11)
import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { gradeLabel, periodKey, type Cycle, type ReportRow, type StudentSubjectRow } from './examHubUtils';

export type PastCard = {
  cycle: Cycle; key: { year: number; period: string; examType: string };
  rows: StudentSubjectRow[]; reports: ReportRow[]; targets: unknown[]; tracked: boolean; done: number; expected: number; pdfCount: number;
};

const SUBJECT_ORDER = ['국어', '수학', '영어', '과학', '사회', '한국사'];
const subjIdx = (s: string) => { const i = SUBJECT_ORDER.indexOf(s); return i < 0 ? 99 : i; };
const periodShort = (p: string) => `${p.startsWith('2') ? '2학기' : '1학기'} ${p.endsWith('a') ? '중간' : '기말'}`;

type Props = { cards: PastCard[]; selectedId: string | null; onSelect: (c: Cycle, tab?: 'results' | 'papers') => void };

export function PastExamsTable({ cards, selectedId, onSelect }: Props) {
  const years = useMemo(() => {
    // 연도 → 학교·학년 → 회차(오래된 순)
    const byYear = new Map<number, Map<string, PastCard[]>>();
    for (const cc of cards) {
      const y = cc.key.year;
      const g = `${cc.cycle.school_name} ${gradeLabel(cc.cycle)}`;
      const ym = byYear.get(y) || byYear.set(y, new Map()).get(y)!;
      (ym.get(g) || ym.set(g, []).get(g)!).push(cc);
    }
    return [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, groups]) => ({
      year,
      groups: [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko')).map(([title, list]) => {
        const sorted = [...list].sort((a, b) => periodKey(a.key.year, a.key.period, null) - periodKey(b.key.year, b.key.period, null));
        const subjects = Array.from(new Set(sorted.flatMap(cc => [...cc.rows.map(r => r.subject), ...cc.reports.map(r => r.subject)]))).sort((a, b) => subjIdx(a) - subjIdx(b) || a.localeCompare(b, 'ko'));
        return { title, subjects, cycles: sorted };
      }),
    }));
  }, [cards]);

  if (cards.length === 0) return <p className="text-xs text-muted-foreground px-1">지난 시험 기록이 없습니다.</p>;

  return (
    <div className="space-y-4">
      {years.map(y => (
        <div key={y.year} className="space-y-2">
          <div className="text-sm font-semibold">{y.year}년</div>
          {y.groups.map(g => (
            <div key={g.title} className="rounded-lg border overflow-hidden">
              <div className="px-3 py-1.5 text-xs font-medium bg-muted/40">{g.title}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-t">
                      <th className="text-left px-3 py-1.5 font-medium whitespace-nowrap w-[120px]">회차</th>
                      <th className="text-right px-2 py-1.5 font-medium whitespace-nowrap">학생</th>
                      {g.subjects.map(s => <th key={s} className="text-left px-2 py-1.5 font-medium whitespace-nowrap">{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {g.cycles.map(cc => {
                      const active = cc.cycle.id === selectedId;
                      const bySubj = new Map<string, { done: number; total: number; pdfs: number }>();
                      for (const r of cc.rows) {
                        const v = bySubj.get(r.subject) || bySubj.set(r.subject, { done: 0, total: 0, pdfs: 0 }).get(r.subject)!;
                        if (r.status !== 'absent' && r.status !== 'untracked') v.total += 1;
                        if (r.status === 'done') v.done += 1;
                        if (r.pdf) v.pdfs += 1;
                      }
                      return (
                        <tr key={cc.cycle.id} className={cn('border-t hover:bg-accent/40 cursor-pointer', active && 'bg-primary/5')} onClick={() => onSelect(cc.cycle)}>
                          <td className="px-3 py-1.5 whitespace-nowrap font-medium">
                            {periodShort(cc.key.period)}
                            {cc.cycle.virtual ? <span className="ml-1 text-[10px] text-muted-foreground">기록</span> : cc.cycle.start_date ? <span className="ml-1 text-[10px] text-muted-foreground">{cc.cycle.start_date.slice(5).replace('-', '/')}</span> : null}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{cc.targets.length}</td>
                          {g.subjects.map(s => {
                            const v = bySubj.get(s);
                            const reps = cc.reports.filter(r => r.subject === s);
                            const pub = reps.some(r => r.is_published);
                            if (!v && reps.length === 0) return <td key={s} className="px-2 py-1.5 text-muted-foreground/40">·</td>;
                            return (
                              <td key={s} className="px-2 py-1.5 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5">
                                  {v && (v.done > 0 || v.total > 0) && (
                                    <button type="button" onClick={e => { e.stopPropagation(); onSelect(cc.cycle, 'results'); }} className={cn('tabular-nums hover:underline', v.total > 0 && v.done < v.total ? 'text-amber-700' : '')} title="학생 결과 열기">
                                      점수 {v.done}{v.total > 0 ? `/${v.total}` : ''}
                                    </button>
                                  )}
                                  {v && v.pdfs > 0 && (
                                    <button type="button" onClick={e => { e.stopPropagation(); onSelect(cc.cycle, 'results'); }} className="inline-flex items-center gap-0.5 text-primary hover:underline" title="시험지 열기">
                                      <FileText className="w-3 h-3" />{v.pdfs}
                                    </button>
                                  )}
                                  {reps.length > 0 && (
                                    <button type="button" onClick={e => { e.stopPropagation(); onSelect(cc.cycle, 'papers'); }} className={cn('rounded px-1 py-0.5 text-[10px] hover:underline', pub ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-muted text-muted-foreground')} title="시험지 분석 열기">
                                      분석{pub ? '·공개' : ''}
                                    </button>
                                  )}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
