// AUTONOMOUS-STUDY-SURVEY-V1: 추석 연휴 자습 희망 시간 조사 (학생용 공개 링크)
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Users, CalendarClock, Info } from 'lucide-react';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SURVEY_DATES = ['2026-09-24', '2026-09-25', '2026-09-26'];
const START_HOUR = 9;
const END_HOUR = 19;

interface CountRow {
  survey_date: string;
  start_time: string;
  end_time: string;
  count: number;
}

function formatDate(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DAYS[dt.getDay()]})`;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function timeLabel(h: number) {
  return `${pad(h)}:00~${pad(h + 1)}:00`;
}

function keyFor(date: string, h: number) {
  return `${date}|${pad(h)}:00|${pad(h + 1)}:00`;
}

export default function AutonomousStudySurveyPage() {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [phone, setPhone] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const timeSlots = useMemo(() => {
    const slots: { hour: number; label: string }[] = [];
    for (let h = START_HOUR; h < END_HOUR; h++) {
      slots.push({ hour: h, label: timeLabel(h) });
    }
    return slots;
  }, []);

  async function loadCounts() {
    const { data, error } = await supabase.functions.invoke('autonomous-study-survey', {
      body: { action: 'counts' },
    });
    if (error || data?.error) {
      toast.error('현황을 불러오지 못했습니다.');
      return;
    }
    const map: Record<string, number> = {};
    (data?.counts || []).forEach((row: CountRow) => {
      const k = `${row.survey_date}|${row.start_time.slice(0, 5)}|${row.end_time.slice(0, 5)}`;
      map[k] = row.count;
    });
    setCounts(map);
  }

  useEffect(() => {
    loadCounts().finally(() => setLoading(false));
  }, []);

  function toggle(date: string, hour: number) {
    const k = keyFor(date, hour);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function submit() {
    if (name.trim().length < 2 || grade.trim().length < 1 || selected.size === 0) {
      toast.error('이름, 학년을 입력하고 최소 하나의 시간대를 선택해주세요.');
      return;
    }
    const selections = Array.from(selected).map(k => {
      const [date, start, end] = k.split('|');
      return { survey_date: date, start_time: start, end_time: end };
    });
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('autonomous-study-survey', {
      body: {
        action: 'submit',
        student_name: name.trim(),
        grade: grade.trim(),
        phone: phone.trim(),
        selections,
      },
    });
    setSubmitting(false);
    if (error || data?.error) {
      toast.error(data?.error || '제출에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    setDone(true);
    const map: Record<string, number> = {};
    (data?.counts || []).forEach((row: CountRow) => {
      const k = `${row.survey_date}|${row.start_time.slice(0, 5)}|${row.end_time.slice(0, 5)}`;
      map[k] = row.count;
    });
    setCounts(map);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
            <h2 className="text-xl font-bold">응답이 접수되었습니다</h2>
            <p className="text-sm text-muted-foreground">
              {name} · {grade} · {selected.size}개 시간대
            </p>
            <p className="text-xs text-muted-foreground">
              신청자가 많은 타임을 골라 오픈할 예정입니다.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">추석 연휴 자습 희망 시간 조사</h1>
          <p className="text-sm text-muted-foreground">
            2026년 9월 24일(목) ~ 26일(토) · 아침 9시 ~ 밤 7시
          </p>
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              신청하신 시간에 <strong>무조건 오픈되는 것이 아닙니다.</strong> 전체 신청 현황을 보고
              신청자가 많은 타임을 골라 오픈합니다. 가능한 시간대를 <strong>모두</strong> 선택해주세요.
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="name">학생 이름</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="홍길동"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="grade">학년</Label>
            <Input
              id="grade"
              value={grade}
              onChange={e => setGrade(e.target.value)}
              placeholder="고1"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">연락처 (선택)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="01012345678"
              inputMode="numeric"
            />
          </div>
        </section>

        <section className="space-y-4">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="w-4 h-4" />
            가능한 시간대를 모두 선택해주세요
          </Label>
          {SURVEY_DATES.map(date => (
            <div key={date} className="space-y-2">
              <h3 className="font-semibold text-sm">{formatDate(date)}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {timeSlots.map(({ hour, label }) => {
                  const k = keyFor(date, hour);
                  const active = selected.has(k);
                  const count = counts[k] || 0;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggle(date, hour)}
                      className={cn(
                        'relative text-left p-2.5 rounded-lg border text-sm transition',
                        active
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <div className="font-medium">{label}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Users className="w-3 h-3" />
                        {count}명 신청중
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            총 {selected.size}개 시간대 선택
          </Badge>
          <Button
            disabled={submitting || name.trim().length < 2 || grade.trim().length < 1 || selected.size === 0}
            onClick={submit}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            응답 제출하기
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          신청자 명단은 공개되지 않습니다. 남은 인원 현황만 표시됩니다.
        </p>
      </div>
    </div>
  );
}
