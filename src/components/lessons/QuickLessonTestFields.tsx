import { useId, useState } from 'react';
import { ClipboardCheck, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { hasTest, type QuickLessonTest, type TestOutcome } from './quickLessonTests';

interface Props {
  tests: QuickLessonTest[];
  disabled: boolean;
  refreshing: boolean;
  onChange: (tests: QuickLessonTest[]) => void;
  onRefresh: () => void;
}

const OUTCOMES: { value: TestOutcome; label: string }[] = [
  { value: 'none', label: '미선택' }, { value: 'pass', label: '통과' }, { value: 'fail', label: '불통과' },
];

export function QuickLessonTestFields({ tests, disabled, refreshing, onChange, onRefresh }: Props) {
  const id = useId();
  const [secondOpen, setSecondOpen] = useState(false);
  const second = tests.find(t => t.key === 'lesson-2');
  const visible = tests.filter(t => t.key !== 'lesson-2' || secondOpen || hasTest(t));
  const patch = (key: string, next: Partial<QuickLessonTest>) => onChange(tests.map(t => t.key === key ? { ...t, ...next } : t));

  return (
    <section aria-label="테스트 결과" className="space-y-2 border-t border-border/60 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 font-semibold text-foreground"><ClipboardCheck className="h-3.5 w-3.5 text-primary" />테스트 결과</h4>
        <div className="flex items-center gap-1">
          {second && !secondOpen && !hasTest(second) && (
            <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" disabled={disabled} onClick={() => setSecondOpen(true)}><Plus className="h-3 w-3" />테스트 2</Button>
          )}
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={disabled || refreshing} onClick={onRefresh} title="테스트 결과 다시 불러오기" aria-label="테스트 결과 다시 불러오기">
            <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>
      {visible.map((test, index) => (
        <div key={test.key} className="space-y-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">{test.source === 'lesson' ? `테스트 ${test.slot}` : `추가 테스트 ${index}`}</span>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(120px,180px)_auto]">
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`${id}-${test.key}-content`} className="text-[11px] text-muted-foreground">테스트내용 및 범위 <span className="text-destructive">*</span></Label>
              <Input id={`${id}-${test.key}-content`} aria-label={`테스트 ${index + 1} 내용 및 범위`} value={test.content} onChange={e => patch(test.key, { content: e.target.value })} placeholder="예: 명제 주간테스트" className="h-8 min-w-0 text-xs" disabled={disabled || refreshing} />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`${id}-${test.key}-score`} className="text-[11px] text-muted-foreground">결과 / 점수</Label>
              <Input id={`${id}-${test.key}-score`} aria-label={`테스트 ${index + 1} 결과 및 점수`} value={test.score} onChange={e => patch(test.key, { score: e.target.value })} placeholder="예: 85점 / 17개 정답" className="h-8 min-w-0 text-xs" disabled={disabled || refreshing} />
            </div>
            <div className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">통과 여부</span>
              <div role="group" aria-label={`테스트 ${index + 1} 통과 여부`} className="flex h-8 items-center gap-1">
                {OUTCOMES.map(o => (
                  <Button key={o.value} type="button" size="sm" variant={test.outcome === o.value ? 'secondary' : 'ghost'} aria-pressed={test.outcome === o.value} disabled={disabled || refreshing} onClick={() => patch(test.key, { outcome: o.value })}
                    className={cn('h-8 px-2 text-[11px]', test.outcome === o.value && 'border border-primary/30 text-primary')}>
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}