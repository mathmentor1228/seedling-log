// EXAM-CYCLE-V1: 시험 단위 성적 입력 시트
// 연도·학기·유형은 시험에서 자동 설정 — 강사는 점수만 친다. Enter = 저장 + 다음 학생.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Save } from 'lucide-react';
import { CycleExam, SUBJECT_COLORS, DEFAULT_LINE_COLOR, examTitleLabel } from './cycleUtils';

export type EntryRow = {
  studentId: string;
  studentName: string;
  gradeLabel: string;
  subject: string;
  prev: number | null;      // 직전 시기 점수 (등락 표시용)
  existing: number | null;  // 이 시험에 이미 입력된 점수
};

export function ScoreEntrySheet({ open, onOpenChange, exam, rows, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  exam: CycleExam | null;
  rows: EntryRow[];
  // 저장 성공 시 true — 성공하면 행이 저장됨 상태로 바뀐다
  onSave: (row: EntryRow, score: number) => Promise<boolean>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedNow, setSavedNow] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (open) { setDrafts({}); setSavedNow({}); setSaving({}); }
  }, [open, exam?.school, exam?.period]);

  const keyOf = (r: EntryRow) => `${r.studentId}|${r.subject}`;
  const scoreOf = (r: EntryRow): number | null => savedNow[keyOf(r)] ?? r.existing;
  const doneCount = rows.filter(r => scoreOf(r) != null).length;

  const pendingKeys = useMemo(
    () => rows.filter(r => scoreOf(r) == null).map(keyOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, savedNow]
  );

  async function handleSave(r: EntryRow) {
    const key = keyOf(r);
    const raw = drafts[key];
    if (raw == null || raw.trim() === '') return;
    const score = Number(raw);
    if (Number.isNaN(score) || score < 0 || score > 100) return;
    setSaving(p => ({ ...p, [key]: true }));
    const ok = await onSave(r, score);
    setSaving(p => { const n = { ...p }; delete n[key]; return n; });
    if (ok) {
      setSavedNow(p => ({ ...p, [key]: score }));
      setDrafts(p => { const n = { ...p }; delete n[key]; return n; });
      // 다음 미입력 학생으로 포커스 이동
      const next = pendingKeys.find(k => k !== key && inputRefs.current[k]);
      if (next) setTimeout(() => inputRefs.current[next]?.focus(), 50);
    }
  }

  if (!exam) return null;
  const dateLabel = exam.start === exam.end
    ? exam.start.slice(5).replace('-', '/')
    : `${exam.start.slice(5).replace('-', '/')}–${exam.end.slice(5).replace('-', '/')}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{exam.school} {examTitleLabel(exam)} — 성적 입력</DialogTitle>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{exam.year}년 {examTitleLabel(exam)}</span>
            <Badge variant="secondary" className="ml-2 text-[11px]">시험 일정에서 자동 설정</Badge>
            {exam.grades && <Badge variant="outline" className="ml-1 text-[11px]">대상 {exam.grades.join('·')}학년</Badge>}
            <span className="ml-2">시행 {dateLabel} · 내 학생 {rows.length}명</span>
          </p>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto rounded-md border divide-y">
          {rows.map(r => {
            const key = keyOf(r);
            const saved = scoreOf(r);
            const delta = saved != null && r.prev != null ? saved - r.prev : null;
            return (
              <div key={key} className={`grid grid-cols-[1.2fr_auto_90px_1fr] items-center gap-3 px-4 py-2.5 ${saved != null ? 'bg-muted/30' : ''}`}>
                <div className="font-medium whitespace-nowrap">
                  {r.studentName}
                  <span className="ml-1 text-xs text-muted-foreground">{r.gradeLabel}</span>
                  <span className="ml-1.5 text-xs font-semibold" style={{ color: SUBJECT_COLORS[r.subject] || DEFAULT_LINE_COLOR }}>
                    {r.subject}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  직전 {r.prev != null ? <b className="text-foreground text-sm">{r.prev}</b> : '—'}
                </div>
                {saved != null ? (
                  <div className="text-center text-lg font-bold tabular-nums">{saved}</div>
                ) : (
                  <Input
                    ref={el => { inputRefs.current[key] = el; }}
                    type="number" min={0} max={100} placeholder="점수"
                    className="h-9 text-center text-base font-semibold"
                    value={drafts[key] ?? ''}
                    onChange={e => setDrafts(p => ({ ...p, [key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(r); }}
                  />
                )}
                <div className="text-sm whitespace-nowrap">
                  {saved != null ? (
                    delta != null ? (
                      <span className={`inline-flex items-center gap-1 font-semibold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : delta < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                        {delta > 0 ? `+${delta}` : delta === 0 ? '동일' : delta} 저장됨
                      </span>
                    ) : <span className="text-xs text-muted-foreground">저장됨</span>
                  ) : (
                    <Button
                      size="sm" variant="ghost" className="h-8"
                      disabled={saving[key] || !(drafts[key] ?? '').trim()}
                      onClick={() => handleSave(r)}
                    >
                      <Save className="w-4 h-4 mr-1" />저장
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">이 시험 대상인 담당 학생이 없습니다.</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${rows.length ? (doneCount / rows.length) * 100 : 0}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums">{doneCount}/{rows.length} 입력됨</span>
        </div>
        {doneCount === rows.length && rows.length > 0 && (
          <p className="rounded-md bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-3 py-2">
            ✓ 전원 입력 완료 — 성적 추이와 하락 경보에 반영됐습니다.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
