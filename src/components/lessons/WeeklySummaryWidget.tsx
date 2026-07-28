// WEEKLY-SUMMARY-WIDGET-V1: Surface students missing this week's mandatory comment.
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Loader2, MessageSquareText, CheckCircle2 } from 'lucide-react';
import { getMondayOfWeek, getSundayOfWeek } from '@/lib/weekUtils';
import { VERBATIM_WEEKLY_COMMENT_TEACHER_IDS } from '@/lib/constants';
import { WeeklySummaryDialog } from './WeeklySummaryDialog';

interface StudentRow { id: string; name: string; school: string | null; grade_year: number | null; hasSummary: boolean; }

export function WeeklySummaryWidget() {
  const { user } = useAuth();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<StudentRow | null>(null);
  const weekStart = getMondayOfWeek(new Date());
  const weekEnd = getSundayOfWeek(new Date());

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // All distinct students the teacher had a lesson with this week.
      const { data: lessons } = await supabase
        .from('lesson_records')
        .select('student_id, weekly_summary, students:student_id(id, name, school, grade_year)')
        .eq('teacher_id', user.id)
        .gte('lesson_date', weekStart)
        .lte('lesson_date', weekEnd);

      const byStudent = new Map<string, StudentRow>();
      for (const l of (lessons || []) as any[]) {
        const s = l.students;
        if (!s) continue;
        const prev = byStudent.get(s.id);
        const has = !!l.weekly_summary || (prev?.hasSummary ?? false);
        byStudent.set(s.id, {
          id: s.id, name: s.name, school: s.school, grade_year: s.grade_year, hasSummary: has,
        });
      }

      // WEEKLY-SUMMARY-WIDGET-V2: 코멘트가 다른 선생님 소유의 레코드에 저장됐거나
      // weekly_summary_week=이번주로만 기록된 케이스도 '작성 완료'로 잡아준다.
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

      setRows(Array.from(byStudent.values()).sort((a, b) => Number(a.hasSummary) - Number(b.hasSummary)));
    } finally {
      setLoading(false);
    }
  }, [user, weekStart, weekEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const missing = rows.filter(r => !r.hasSummary);
  const done = rows.filter(r => r.hasSummary);

  // 원문 노출 대상 선생님에게만 표시 — 창이 보인다면 쓴 그대로 리포트에 나간다는 뜻.
  if (!user || !VERBATIM_WEEKLY_COMMENT_TEACHER_IDS.includes(user.id as any)) return null;

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">이번 주 핵심 코멘트</h3>
              <Badge variant="outline" className="text-[10px]">{weekStart} ~ {weekEnd}</Badge>
            </div>
            <Badge className={missing.length === 0 ? 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30' : 'bg-amber-500/20 text-amber-700 border-amber-500/30'}>
              {missing.length === 0 ? '전원 작성 완료' : `미작성 ${missing.length}명`}
            </Badge>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-3 text-muted-foreground text-xs">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> 로딩...
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">이번 주 수업 기록이 없습니다.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {missing.map(s => (
                <Button key={s.id} variant="outline" size="sm" className="h-7 text-xs border-amber-500/40 hover:bg-amber-500/10"
                  onClick={() => setPicked(s)}>
                  {s.name}
                  {s.school && <span className="ml-1 text-muted-foreground">·{s.school.slice(0, 4)}</span>}
                </Button>
              ))}
              {done.map(s => (
                <Button key={s.id} variant="ghost" size="sm" className="h-7 text-xs text-emerald-700"
                  onClick={() => setPicked(s)}>
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {s.name}
                </Button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground leading-tight">
            * 주간 코멘트가 있어야 학부모 주간 리포트가 충실히 생성됩니다. 일요일 23:59까지 작성하세요.
          </p>
        </CardContent>
      </Card>
      {picked && (
        <WeeklySummaryDialog
          open={!!picked}
          onOpenChange={(o) => { if (!o) setPicked(null); }}
          studentId={picked.id}
          studentName={picked.name}
          weekStart={weekStart}
          onSaved={fetchData}
        />
      )}
    </>
  );
}
