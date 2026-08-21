// TEACHER-TODAY-V1
// 교사 홈 상단: 오늘 수업 요약 + 반별 카드 (읽기 전용, 저장은 마감 화면에서만)
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn, getTodayKST } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertTriangle, RefreshCw, Users, Clock, Calendar } from 'lucide-react';
import { useTodayClasses, type TodayClassCard } from './useTodayClasses';
import { getCardDisplay } from './cardStatus';


function formatKoreanDay(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00+09:00`).toLocaleDateString('ko-KR', { weekday: 'long' });
}

function findRecentClassDate(selectedDate: string, activeDays: number[]): string | null {
  if (!activeDays.length) return null;
  const activeSet = new Set(activeDays);
  for (let i = 1; i <= 7; i++) {
    const d = new Date(`${selectedDate}T12:00:00+09:00`);
    d.setDate(d.getDate() - i);
    if (activeSet.has(d.getDay())) {
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

function ClassCardRow({ card, date, onOpen }: { card: TodayClassCard; date: string; onOpen: () => void }) {
  const meta = STATE_META[card.state];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="text-center shrink-0 w-14">
        <p className="text-xs font-mono font-bold tabular-nums text-foreground">{card.startTime}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums">{card.endTime}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold truncate">{card.className}</span>
          {card.subject && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{card.subject}</Badge>}
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold', meta.chip)}>
            {meta.label}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{card.studentCount}명</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />입실 {card.checkedInCount}/{card.studentCount}</span>
          <span>일지 {card.submittedCount}/{card.studentCount}</span>
          {card.classroomName && <span>· {card.classroomName}</span>}
        </p>
      </div>
      <Button size="sm" variant={card.state === 'closed' ? 'outline' : 'default'} onClick={onOpen} className="shrink-0">
        {meta.cta}
      </Button>
    </div>
  );
}

export function TeacherTodayBoard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(getTodayKST());
  const [activeDays, setActiveDays] = useState<number[]>([]);
  const { cards, missedCount, loading, error, reload } = useTodayClasses(user?.id || '', date);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase
      .from('class_schedules')
      .select('day_of_week')
      .eq('teacher_id', user.id)
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled) return;
        const days = [...new Set((data || []).map((r: any) => r.day_of_week))];
        setActiveDays(days);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const stats = useMemo(() => {
    const total = cards.length;
    const closed = cards.filter((c) => c.state === 'closed').length;
    return { total, closed, remaining: total - closed };
  }, [cards]);

  const open = (card: TodayClassCard) => {
    navigate(`/lessons/close?classId=${card.classId}&date=${date}&scheduleId=${card.scheduleId}`);
  };

  const selectedDayLabel = formatKoreanDay(date);
  const recentDate = useMemo(() => findRecentClassDate(date, activeDays), [date, activeDays]);
  const todayKST = getTodayKST();
  const isSelectedPast = date !== todayKST;
  const formattedSelectedDate = date.replace(/-/g, '.');

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-base">🗓️</span>
            <h2 className="text-sm font-bold">선택한 수업일 마감</h2>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">
              {formattedSelectedDate} ({selectedDayLabel})
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || getTodayKST())}
              className="h-8 w-[150px] text-xs"
            />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {selectedDayLabel}
            </span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={reload} aria-label="새로고침">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {isSelectedPast && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <span className="text-xs text-amber-700 dark:text-amber-400">
              현재 과거 수업일을 보고 있습니다.
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDate(todayKST)}>
              오늘로 돌아가기
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '오늘 수업', value: stats.total, tone: 'text-foreground' },
            { label: '마감', value: stats.closed, tone: 'text-emerald-600' },
            { label: '남은 반', value: stats.remaining, tone: 'text-amber-600' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className={cn('text-lg font-bold tabular-nums', s.tone)}>{s.value}반</p>
            </div>
          ))}
        </div>

        {missedCount > 0 && (
          <button
            onClick={() => navigate('/lessons')}
            className="w-full flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-xs text-amber-700 dark:text-amber-400">
              최근 2주 내 미제출 일지 {missedCount}건 — 확인하러 가기
            </span>
          </button>
        )}

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : error ? (
          <p className="text-xs text-destructive py-3">{error}</p>
        ) : cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              {selectedDayLabel}에는 배정된 수업이 없습니다.
            </p>
            {recentDate && recentDate !== date && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDate(recentDate)}
                className="text-xs"
              >
                가장 최근 수업일 보기 ({recentDate.replace(/-/g, '.').slice(5)} {formatKoreanDay(recentDate)})
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {cards.map((c) => (
              <ClassCardRow key={c.scheduleId} card={c} date={date} onOpen={() => open(c)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
