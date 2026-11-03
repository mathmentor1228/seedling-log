import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CalendarDays, Loader2 } from 'lucide-react';
import { LEDGER_START } from '@/lib/tuitionLedger';
import { MONTH_JUMP_EARLIEST_YEAR, monthJumpTarget, monthJumpYears } from './monthJump';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMonth: Date;
  onJump: (monthStr: string) => void;
}

export function MonthJumpDialog({ open, onOpenChange, currentMonth, onJump }: Props) {
  const today = new Date();
  const [year, setYear] = useState(String(currentMonth.getFullYear()));
  const [month, setMonth] = useState(String(currentMonth.getMonth() + 1));
  const years = monthJumpYears(today.getFullYear());
  const target = monthJumpTarget(year, month);
  const isHistorical = target !== null && target < LEDGER_START;

  useEffect(() => {
    if (open) {
      setYear(String(currentMonth.getFullYear()));
      setMonth(String(currentMonth.getMonth() + 1));
    }
  }, [open, currentMonth]);

  const jump = () => {
    if (!target) return;
    onJump(target);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />연·월로 바로 이동
          </DialogTitle>
          <DialogDescription className="text-xs">
            지금 보는 달: {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="jump-year" className="text-xs text-muted-foreground">연도</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger id="jump-year" aria-label="이동할 연도" className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jump-month" className="text-xs text-muted-foreground">월</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger id="jump-month" aria-label="이동할 월" className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <SelectItem key={m} value={String(m)}>{m}월</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setYear(String(today.getFullYear())); setMonth(String(today.getMonth() + 1)); }}>
            이번 달
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setYear(String(MONTH_JUMP_EARLIEST_YEAR)); setMonth('1'); }}>
            {MONTH_JUMP_EARLIEST_YEAR}년
          </Button>
        </div>

        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {target ? `${Number(target.slice(0, 4))}년 ${Number(target.slice(5))}월로 이동` : '연도와 월을 다시 선택해주세요'}
          {isHistorical && ' · 2026-10 이전은 출결버스 기록(미납 판정 없음)'}
        </p>

        <Button onClick={jump} disabled={target === null} className="w-full">
          {target === null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          이 달로 이동
        </Button>
      </DialogContent>
    </Dialog>
  );
}
