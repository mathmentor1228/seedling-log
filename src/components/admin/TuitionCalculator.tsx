import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Input as InputUI } from '@/components/ui/input';
import { Calculator, RotateCcw, Copy, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';

const DAYS_OF_WEEK = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
] as const;

const DAY_INDEX: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function getSessionDatesInRange(startDate: Date, endDate: Date, selectedDays: string[]): Date[] {
  const dayIndices = selectedDays.map(d => DAY_INDEX[d]);
  const dates: Date[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    if (dayIndices.includes(current.getDay())) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDate(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`;
}

export function TuitionCalculator() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [startDay, setStartDay] = useState(1); // 수업 시작일
  const [selectedDays, setSelectedDays] = useState<string[]>(['mon', 'wed', 'fri']);
  const [totalFee, setTotalFee] = useState<string>('');
  const [attendedIndices, setAttendedIndices] = useState<Set<number>>(new Set());
  const [studentName, setStudentName] = useState('');

  // 시작일~종료일 계산: startDay일 ~ 다음달 (startDay-1)일
  const { periodStart, periodEnd, periodLabel } = useMemo(() => {
    const start = new Date(year, month, startDay);
    let end: Date;
    if (startDay === 1) {
      // 1일 시작이면 해당월 말일까지
      end = new Date(year, month + 1, 0);
    } else {
      // N일 시작이면 다음달 (N-1)일까지
      end = new Date(year, month + 1, startDay - 1);
    }
    const startLabel = `${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()}`;
    const endLabel = `${end.getFullYear()}.${end.getMonth() + 1}.${end.getDate()}`;
    return { periodStart: start, periodEnd: end, periodLabel: `${startLabel} ~ ${endLabel}` };
  }, [year, month, startDay]);

  const sessionDates = useMemo(
    () => getSessionDatesInRange(periodStart, periodEnd, selectedDays),
    [periodStart, periodEnd, selectedDays]
  );

  const totalSessions = sessionDates.length;
  const attendedSessions = attendedIndices.size;
  const feeNum = Number(totalFee.replace(/,/g, '')) || 0;
  const perSession = totalSessions > 0 ? feeNum / totalSessions : 0;
  const prorated = Math.round(perSession * attendedSessions);

  const toggleDay = (key: string) => {
    setSelectedDays(prev =>
      prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key]
    );
    setAttendedIndices(new Set());
  };

  const toggleAttended = (idx: number) => {
    setAttendedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectRange = (endIdx: number) => {
    const indices = new Set<number>();
    for (let i = 0; i <= endIdx; i++) indices.add(i);
    setAttendedIndices(indices);
  };

  const handleReset = () => {
    setSelectedDays(['mon', 'wed', 'fri']);
    setTotalFee('');
    setAttendedIndices(new Set());
    setMonth(now.getMonth());
    setYear(now.getFullYear());
    setStartDay(1);
  };

  const handleCopy = () => {
    const dayLabels = selectedDays.map(d => DAYS_OF_WEEK.find(x => x.key === d)?.label).join(', ');
    const text = `[원비 정산]\n기간: ${periodLabel}\n수업 요일: ${dayLabels}\n총 회차: ${totalSessions}회\n수강 회차: ${attendedSessions}회\n월 수업료: ${feeNum.toLocaleString()}원\n정산 금액: ${prorated.toLocaleString()}원`;
    navigator.clipboard.writeText(text);
    toast.success('정산 내역이 복사되었습니다');
  };

  const handleFeeChange = (val: string) => {
    const num = val.replace(/[^0-9]/g, '');
    setTotalFee(num ? Number(num).toLocaleString() : '');
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setAttendedIndices(new Set());
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setAttendedIndices(new Set());
  };

  const handleStartDayChange = (val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1 && num <= 28) {
      setStartDay(num);
      setAttendedIndices(new Set());
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            원비 정산 계산기
          </h3>
          <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1 text-muted-foreground">
            <RotateCcw className="w-3.5 h-3.5" /> 초기화
          </Button>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <Button variant="outline" size="sm" onClick={prevMonth}>◀</Button>
          <span className="text-lg font-bold text-foreground">{year}년 {month + 1}월</span>
          <Button variant="outline" size="sm" onClick={nextMonth}>▶</Button>
        </div>

        {/* 수업 시작일 */}
        <div className="mb-4">
          <label className="text-sm font-medium text-foreground mb-1.5 block">수업 시작일 (매월 N일)</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">매월</span>
            <Input
              type="number"
              min={1}
              max={28}
              value={startDay}
              onChange={e => handleStartDayChange(e.target.value)}
              className="w-20 text-center font-semibold"
            />
            <span className="text-sm text-muted-foreground">일 시작</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 bg-muted/50 rounded-md px-2.5 py-1.5">
            📅 적용 기간: <strong className="text-foreground">{periodLabel}</strong>
          </p>
        </div>

        {/* Day of week selector */}
        <div className="mb-4">
          <label className="text-sm font-medium text-foreground mb-2 block">수업 요일 선택</label>
          <div className="flex gap-2 flex-wrap">
            {DAYS_OF_WEEK.map(d => (
              <Button
                key={d.key}
                variant={selectedDays.includes(d.key) ? 'default' : 'outline'}
                size="sm"
                className="w-10 h-10 text-sm font-medium"
                onClick={() => toggleDay(d.key)}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Total fee input */}
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">월 수업료 (원)</label>
          <Input
            placeholder="예: 300,000"
            value={totalFee}
            onChange={e => handleFeeChange(e.target.value)}
            className="text-right text-lg font-semibold"
          />
        </div>
      </Card>

      {/* Session dates grid */}
      {totalSessions > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-foreground">
              수업 일정 <span className="text-muted-foreground font-normal">({totalSessions}회)</span>
            </h4>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="text-xs h-7"
                onClick={() => setAttendedIndices(new Set(sessionDates.map((_, i) => i)))}>
                전체 선택
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7"
                onClick={() => setAttendedIndices(new Set())}>
                전체 해제
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-3">수강하는 일자를 클릭하세요. 연속 선택: 길게 누르면 처음부터 해당 일까지 자동 선택</p>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {sessionDates.map((date, idx) => {
              const isSelected = attendedIndices.has(idx);
              return (
                <button
                  key={idx}
                  onClick={() => toggleAttended(idx)}
                  onContextMenu={(e) => { e.preventDefault(); selectRange(idx); }}
                  className={`px-2 py-2 rounded-md border text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground border-border hover:bg-accent/50'
                  }`}
                >
                  {formatDate(date)}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Result */}
      {feeNum > 0 && totalSessions > 0 && (
        <Card className="p-5 bg-primary/5 border-primary/20">
          <h4 className="text-sm font-semibold text-foreground mb-4">정산 결과</h4>
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="text-muted-foreground text-xs">총 회차</p>
              <p className="text-xl font-bold text-foreground">{totalSessions}<span className="text-sm font-normal">회</span></p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="text-muted-foreground text-xs">수강 회차</p>
              <p className="text-xl font-bold text-primary">{attendedSessions}<span className="text-sm font-normal">회</span></p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="text-muted-foreground text-xs">1회당 수업료</p>
              <p className="text-lg font-bold text-foreground">{Math.round(perSession).toLocaleString()}<span className="text-sm font-normal">원</span></p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-primary/30">
              <p className="text-muted-foreground text-xs">정산 금액</p>
              <p className="text-xl font-bold text-primary">{prorated.toLocaleString()}<span className="text-sm font-normal">원</span></p>
            </div>
          </div>

          {attendedSessions > 0 && attendedSessions < totalSessions && (
            <div className="text-xs text-muted-foreground bg-card rounded-md p-2.5 border border-border mb-3">
              💡 {feeNum.toLocaleString()}원 ÷ {totalSessions}회 × {attendedSessions}회 = <strong className="text-foreground">{prorated.toLocaleString()}원</strong>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 w-full">
            <Copy className="w-3.5 h-3.5" /> 정산 내역 복사
          </Button>
        </Card>
      )}
    </div>
  );
}