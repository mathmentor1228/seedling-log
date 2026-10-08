// WEEKLY-COMMENT-V2: 이번 주 주간 코멘트가 없는 학생을 대시보드에 띄우고 그 자리에서 쓰게 한다.
// - 모든 선생님·원장에게 보인다 (WEEKLY_COMMENT_EXCLUDED_TEACHER_IDS 제외)
// - 수요일부터 일요일까지만 보인다 (WEEKLY_COMMENT_REMINDER_FROM_WEEKDAY)
// - 대상 학생 = 이번 주 내가 수업한 학생. 코멘트는 누가 썼든 이번 주 것이 있으면 완료로 본다.
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin, isTeacher } from '@/lib/auth';
import { Loader2, MessageSquareText, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { getMondayOfWeek, getSundayOfWeek } from '@/lib/weekUtils';
import { WEEKLY_COMMENT_EXCLUDED_TEACHER_IDS, WEEKLY_COMMENT_REMINDER_FROM_WEEKDAY } from '@/lib/constants';
import { WEEKLY_COMMENT_QUESTIONS } from '@/lib/weeklyCommentGuide';
import { WeeklySummaryDialog } from './WeeklySummaryDialog';

interface StudentRow { id: string; name: string; school: string | null; grade_year: number | null; subject: string; hasSummary: boolean; }

function kstWeekday(): number {
  // 0=일 … 6=토 (KST)
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.getUTCDay();
}

export function isReminderPeriod(weekday = kstWeekday()): boolean {
  return weekday === 0 || weekday >= WEEKLY_COMMENT_REMINDER_FROM_WEEKDAY;
}

export function WeeklySummaryWidget({ alwaysShow = false }: { alwaysShow?: boolean } = {}) {
  const { user, role } = useAuth();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<StudentRow | null>(null);
  const [showDone, setShowDone] = useState(false);
  const weekStart = getMondayOfWeek(new Date());
  const weekEnd = getSundayOfWeek(new Date());

  const eligible = !!user && (isAdmin(role) || isTeacher(role))
    && !(WEEKLY_COMMENT_EXCLUDED_TEACHER_IDS as readonly string[]).includes(user.id);
  const visible = eligible && (alwaysShow || isReminderPeriod());

  const fetchData = useCallback(async () => {
    if (!user || !visible) return;
    setLoading(true);
    try {
      // 이번 주 내가 수업한 학생 (마감 여부 무관)
      const { data: lessons } = await supabase
        .from('lesson_records')
        .select('student_id, subject, weekly_summary, weekly_summary_week, students:student_id(id, name, school, grade_year, enrollment_status)')
        .eq('teacher_id', user.id)
        .gte('lesson_date', weekStart)
        .lte('lesson_date', weekEnd);

      const byStudent = new Map<string, StudentRow>();
      for (const l of (lessons || []) as any[]) {
        const s = l.students;
        if (!s) continue;
        if (s.enrollment_status && !['재학', '재등원'].includes(s.enrollment_status)) continue;
        const prev = byStudent.get(s.id);
        const mine = !!l.weekly_summary && (!l.weekly_summary_week || l.weekly_summary_week === weekStart);
        byStudent.set(s.id, {
          id: s.id, name: s.name, school: s.school, grade_year: s.grade_year,
          subject: prev?.subject || l.subject,
          hasSummary: mine || (prev?.hasSummary ?? false),
        });
      }

      // 다른 선생님 레코드에 저장됐거나 weekly_summary_week=이번주로만 기록된 코멘트도 '작성 완료'로 잡는다.
      const ids = Array.from(byStudent.keys());
      if (ids.length > 0) {
        const { data: anySummary } = await supabase
          .from('lesson_records')
          .select('student_id, weekly_summary, weekly_summary_week, lesson_date')
          .in('student_id', ids)
          .not('weekly_summary', 'is', null)
          .or(`weekly_summary_week.eq.${weekStart},and(lesson_date.gte.${weekStart},lesson_date.lte.${weekEnd})`);
        for (const r of (anySummary || []) as any[]) {
          const row = byStudent.get(r.student_id);
          if (row && r.weekly_summary) row.hasSummary = true;
        }
      }

      setRows(Array.from(byStudent.values()).sort((a, b) => Number(a.hasSummary) - Number(b.hasSummary) || a.name.localeCompare(b.name, 'ko')));
    } finally {
      setLoading(false);
    }
  }, [user, visible, weekStart, weekEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!visible) return null;

  const missing = rows.filter(r => !r.hasSummary);
  const done = rows.filter(r => r.hasSummary);
  const allDone = !loading && rows.length > 0 && missing.length === 0;

  return (
    <>
      <Card className={allDone ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent'}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <MessageSquareText className={`w-4 h-4 ${allDone ? 'text-emerald-600' : 'text-amber-600'}`} />
              <h3 className="text-sm font-bold">이번 주 주간 코멘트</h3>
              <Badge variant="outline" className="text-[10px]">{weekStart.slice(5).replace('-', '/')} ~ {weekEnd.slice(5).replace('-', '/')}</Badge>
            </div>
            <Badge className={allDone ? 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30' : 'bg-amber-500/20 text-amber-800 border-amber-500/30'}>
              {loading ? '확인 중' : rows.length === 0 ? '이번 주 수업 없음' : allDone ? '전원 작성 완료' : `미작성 ${missing.length}명`}
            </Badge>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-3 text-muted-foreground text-xs">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> 로딩...
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">이번 주 내가 수업한 학생이 아직 없습니다.</p>
          ) : (
            <>
              {missing.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {missing.map(s => (
                    <Button key={s.id} variant="outline" size="sm" className="h-7 text-xs border-amber-500/50 bg-background hover:bg-amber-500/10"
                      onClick={() => setPicked(s)}>
                      {s.name}
                      {s.school && <span className="ml-1 text-muted-foreground">·{s.school.slice(0, 4)}</span>}
                    </Button>
                  ))}
                </div>
              )}
              {done.length > 0 && (
                <div>
                  <button type="button" onClick={() => setShowDone(v => !v)}
                    className="flex items-center gap-1 text-[11px] text-emerald-700 hover:underline">
                    {showDone ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    작성 완료 {done.length}명 {showDone ? '접기' : '보기'}
                  </button>
                  {showDone && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {done.map(s => (
                        <Button key={s.id} variant="ghost" size="sm" className="h-6 text-[11px] text-emerald-700" onClick={() => setPicked(s)}>
                          <CheckCircle2 className="w-3 h-3 mr-1" />{s.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <p className="text-[10px] text-muted-foreground leading-snug">
            학생 이름을 누르면 바로 씁니다. {WEEKLY_COMMENT_QUESTIONS.map(q => q.label).join(' · ')} 중 <b>하나만</b> 써도 됩니다.
            일요일 밤에 주간 편지가 만들어지니 그 전까지 부탁드립니다. 코멘트가 없는 학생은 기록만 정리된 약식으로 나갑니다.
          </p>
        </CardContent>
      </Card>
      {picked && (
        <WeeklySummaryDialog
          open={!!picked}
          onOpenChange={(o) => { if (!o) setPicked(null); }}
          studentId={picked.id}
          studentName={picked.name}
          subject={picked.subject}
          weekStart={weekStart}
          onSaved={fetchData}
        />
      )}
    </>
  );
}
