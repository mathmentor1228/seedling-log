// EXAM-MODES-V1 §19-3: 수행평가 항목을 "유형 · 제목 · 비율(· 시기)"로 쪼개 보여준다.
// 원문 벽 대신 한 줄 요약("8개 · 서술형 3 · 최대 30%") + 펼치면 비율 내림차순 표. 강조는 셋만: 비율 ≥20% · 서술/논술형 · (시기 있으면) 2주 안.
import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PerfItem { type: string; title: string; ratio: number | null; when: string | null; raw: string }

const ESSAY = /서술|논술|논설|글쓰기|보고서|에세이/;
const TYPE_WORDS = /^(서술형|논술형|논술|서술|탐구형|탐구|실험|발표|포트폴리오|토의|토론|프로젝트|관찰|수행|지필|구술|실기|독서|글쓰기|보고서|활동|과제|평가)/;

/** AI 추출 줄("유형 · 제목 · 15% / 유형 · 제목 · 20%")과 자료실 자유 텍스트 모두 받는다 */
export function parsePerfItems(lines: string[]): PerfItem[] {
  const out: PerfItem[] = [];
  for (const line of lines) {
    for (const chunk of line.split(/\s+\/\s+|\n/).map(s => s.trim()).filter(Boolean)) {
      const parts = chunk.split(/\s+·\s+|\s+\|\s+/).map(s => s.trim()).filter(Boolean);
      let ratio: number | null = null; let when: string | null = null; let type = ''; let title = '';
      const rest: string[] = [];
      for (const p of parts) {
        const m = p.match(/(\d{1,3})\s*%/);
        if (m && ratio == null) { ratio = Number(m[1]); const t = p.replace(/\(?\s*\d{1,3}\s*%\s*\)?/, '').trim(); if (t) rest.push(t); continue; }
        if (/\d{1,2}\s*월|\d{1,2}\/\d{1,2}|\d{1,2}주|학기\s*(중|말|초)|시험\s*(전|후)/.test(p) && !when) { when = p; continue; }
        rest.push(p);
      }
      if (rest.length >= 2 && TYPE_WORDS.test(rest[0])) { type = rest[0]; title = rest.slice(1).join(' · '); }
      else if (rest.length >= 1) { title = rest.join(' · '); const tm = title.match(TYPE_WORDS); if (tm) type = tm[0]; }
      if (!title && !type) continue;
      out.push({ type, title: title || type, ratio, when, raw: chunk });
    }
  }
  return out.sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));
}

export function perfSummary(items: PerfItem[]): string {
  if (items.length === 0) return '';
  const essay = items.filter(i => ESSAY.test(i.type) || ESSAY.test(i.title)).length;
  const max = Math.max(...items.map(i => i.ratio ?? 0));
  return `${items.length}개${essay ? ` · 서술형 ${essay}` : ''}${max ? ` · 최대 ${max}%` : ''}`;
}

export function PerfItemsCell({ lines, fallback }: { lines: string[]; fallback?: string | null }) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => parsePerfItems(lines.length ? lines : fallback ? [fallback] : []), [lines, fallback]);
  if (items.length === 0) return <span className="text-muted-foreground">-</span>;
  const summary = perfSummary(items);
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 hover:underline">
        <ChevronRight className={cn('w-3 h-3 transition-transform', open && 'rotate-90')} />
        <span className="font-medium">수행평가 {summary}</span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {items.map((it, i) => {
            const heavy = (it.ratio ?? 0) >= 20;
            const essay = ESSAY.test(it.type) || ESSAY.test(it.title);
            const quiet = !heavy && !essay;
            return (
              <li key={i} className={cn('flex items-start gap-1.5 leading-snug', quiet && 'text-muted-foreground')} title={it.raw}>
                <span className={cn('shrink-0 tabular-nums w-9 text-right font-semibold', heavy ? 'text-red-700' : quiet ? 'text-muted-foreground' : 'text-foreground')}>{it.ratio != null ? `${it.ratio}%` : '–'}</span>
                {it.type && <span className={cn('shrink-0 rounded px-1 py-px text-[10px]', essay ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-muted')}>{it.type}</span>}
                <span className="min-w-0">{it.title}{it.when && <span className="ml-1 text-[10px] text-muted-foreground">{it.when}</span>}</span>
              </li>
            );
          })}
          <li className="text-[10px] text-muted-foreground pl-10">빨강 = 비율 20% 이상 · 노랑 = 서술·논술형. 비율 높은 순.</li>
        </ul>
      )}
    </div>
  );
}
