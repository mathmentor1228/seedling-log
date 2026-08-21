// TEACHER-LESSONS-V1: 강사 전용 '수업 기록 조회' 화면.
// 목표 = 빠뜨린 일지를 찾아 마감. 읽기 전용 조회만 하며 저장/삭제는 하지 않는다.
// 상태/버튼 문구는 teacher/cardStatus.ts 순수 매핑 함수를 재사용한다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { getTodayKST } from '@/lib/utils';
import { getCardDisplay, type CardDisplayState } from '@/components/teacher/cardStatus';

interface Row {
  id: string;
  lesson_date: string;
  class_id: string | null;
  class_name: string;
  student_id: string;
  student_name: string;
  subject: string;
  attendance_status: string[] | null;
  has_progress: boolean;
  has_homework: boolean;
  submitted: boolean;
  state: CardDisplayState;
}

function addDaysKST(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  d.setDate(d.getDate() + delta);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function weekdayKo(dateStr: string): string {
  return WEEKDAYS[new Date(`${dateStr}T12:00:00+09:00`).getUTCDay()];
}

const STATE_ORDER: Record<CardDisplayState, number> = {
  not_started: 0,
  in_progress: 1,
  done: 2,
  empty_class: 3,
};

export function TeacherLessonRecords({ teacherId }: { teacherId: string | undefined }) {
  const navigate = useNavigate();
  const today = getTodayKST();
  const [startDate, setStartDate] = useState(addDaysKST(today, -6));
  const [endDate, setEndDate] = useState(today);
  const [classFilter, setClassFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CardDisplayState>('all');
  const [showMore, setShowMore] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!teacherId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('lesson_records')
          .select('id, lesson_date, class_id, student_id, subject, attendance_status, submitted, understanding_score, lesson_range, individual_progress, homework_status, next_homework, students(name), classes(name)')
          .eq('teacher_id', teacherId)
          .gte('lesson_date', startDate)
          .lte('lesson_date', endDate)
          .order('lesson_date', { ascending: false });
        if (err) throw err;
        if (cancelled) return;
        const built: Row[] = (data || []).map((r: any) => {
          const hasProgress = !!(r.lesson_range || r.individual_progress);
          const hasHomework = !!(r.next_homework || (r.homework_status && r.homework_status !== 'none_assigned'));
          const touched =
            hasProgress ||
            hasHomework ||
            r.understanding_score != null ||
            (Array.isArray(r.attendance_status) && r.attendance_status.length > 0);
          const state: CardDisplayState = getCardDisplay({
            studentCount: 1,
            recordedCount: touched ? 1 : 0,
            submittedCount: r.submitted ? 1 : 0,
          }).state;
          return {
            id: r.id,
            lesson_date: r.lesson_date,
            class_id: r.class_id,
            class_name: r.classes?.name || '반 미지정',
            student_id: r.student_id,
            student_name: r.students?.name || '이름 없음',
            subject: r.subject || '',
            attendance_status: r.attendance_status,
            has_progress: hasProgress,
            has_homework: hasHomework,
            submitted: !!r.submitted,
            state,
          };
        });
        setRows(built);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '수업 기록을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teacherId, startDate, endDate, tick]);

  const classOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => { if (r.class_id) m.set(r.class_id, r.class_name); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const studentOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.student_id, r.student_name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (classFilter === 'all' ? true : r.class_id === classFilter))
      .filter((r) => (studentFilter === 'all' ? true : r.student_id === studentFilter))
      .filter((r) => (statusFilter === 'all' ? true : r.state === statusFilter))
      .filter((r) => (subjectFilter === 'all' ? true : r.subject === subjectFilter))
      .sort((a, b) => {
        const s = STATE_ORDER[a.state] - STATE_ORDER[b.state];
        if (s !== 0) return s;
        if (a.lesson_date !== b.lesson_date) return a.lesson_date < b.lesson_date ? 1 : -1;
        return a.class_name.localeCompare(b.class_name) || a.student_name.localeCompare(b.student_name);
      });
  }, [rows, classFilter, studentFilter, statusFilter, subjectFilter]);

  const summary = useMemo(() => {
    const base = { not_started: 0, in_progress: 0, done: 0 };
    filtered.forEach((r) => {
      if (r.state === 'done') base.done += 1;
      else if (r.state === 'in_progress') base.in_progress += 1;
      else base.not_started += 1;
    });
    return base;
  }, [filtered]);

  const openCloseout = (r: Row) => {
    if (!r.class_id) return;
    navigate(`/lessons/close?classId=${r.class_id}&date=${r.lesson_date}`);
  };

  const summaryCard = (label: string, value: number, cls: string, key: 'all' | CardDisplayState) => (
    <button
      type="button"
      onClick={() => setStatusFilter(key as any)}
      className={`flex-1 min-w-0 rounded-lg border px-3 py-2 text-left transition ${cls} ${statusFilter === key ? 'ring-2 ring-primary/60' : ''}`}
    >
      <div className="text-[11px] font-medium opacity-80 truncate">{label}</div>
      <div className="text-xl font-bold leading-tight">{value}</div>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="flex gap-2">
        {summaryCard('미작성', summary.not_started, 'bg-muted text-foreground border-border', 'not_started')}
        {summaryCard('작성 중', summary.in_progress, 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30', 'in_progress')}
        {summaryCard('마감 완료', summary.done, 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30', 'done')}
        {summaryCard('전체', filtered.length, 'bg-card text-foreground border-border', 'all')}
      </div>

      {/* 기본 필터 */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">기간 (기본 최근 7일)</Label>
              <div className="flex items-center gap-1">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm" />
                <span className="text-muted-foreground">~</span>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 min-w-0">
                <Label className="text-xs text-muted-foreground">반</Label>
                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {classOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="text-xs text-muted-foreground">학생</Label>
                <Select value={studentFilter} onValueChange={setStudentFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {studentOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowMore((v) => !v)} className="gap-1 text-xs">
              추가 필터 {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartDate(addDaysKST(today, -6));
                  setEndDate(today);
                  setClassFilter('all');
                  setStudentFilter('all');
                  setStatusFilter('all');
                  setSubjectFilter('all');
                }}
                className="text-xs"
              >
                최근 7일로
              </Button>
              <Button variant="outline" size="sm" onClick={reload} className="gap-1 text-xs">
                <RefreshCw className="w-3.5 h-3.5" />새로고침
              </Button>
            </div>
          </div>

          {showMore && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">과목</Label>
                <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="수학">수학</SelectItem>
                    <SelectItem value="과학">과학</SelectItem>
                    <SelectItem value="영어">영어</SelectItem>
                    <SelectItem value="국어">국어</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={reload}>다시 시도</Button>
          </AlertDescription>
        </Alert>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          조건에 맞는 수업 기록이 없습니다. 기간이나 필터를 바꿔보세요.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const meta = getCardDisplay({
              studentCount: 1,
              recordedCount: r.state === 'not_started' ? 0 : 1,
              submittedCount: r.submitted ? 1 : 0,
            });
            const att = (r.attendance_status || []).join(', ');
            return (
              <div key={r.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold tabular-nums">
                    {r.lesson_date.slice(5)} ({weekdayKo(r.lesson_date)})
                  </span>
                  <span className="text-sm font-medium truncate max-w-[45%]">{r.class_name}</span>
                  <Badge variant="outline" className={`text-[11px] ${meta.chip}`}>{meta.label}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-1">
                  <span className="truncate">{r.student_name}</span>
                  <span>· 출결 {att || '미기록'}</span>
                  <span>· 진도 {r.has_progress ? '있음' : '없음'}</span>
                  <span>· 숙제 {r.has_homework ? '있음' : '없음'}</span>
                </div>
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant={meta.ctaVariant}
                    className="w-full sm:w-auto"
                    disabled={!r.class_id}
                    onClick={() => openCloseout(r)}
                  >
                    {r.class_id ? meta.cta : '반 미지정 — 마감 불가'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TeacherLessonRecords;
