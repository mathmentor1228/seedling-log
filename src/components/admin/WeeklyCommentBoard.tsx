// WEEKLY-COMMENT-V2: 원장 대시보드 — 이번 주 주간 코멘트 현황판 (전 강사, 실시간)
// 초록 = 작성 완료 · 빨강 = 아직 미작성 · 파랑 = 지금 누군가 입력창을 열고 쓰는 중 (Realtime presence)
// lesson_records 가 바뀌면(코멘트 저장 포함) 1.5초 뒤 자동 새로고침. 월~일 내내 보인다.
// 원장 본인 수업 학생은 눌러서 바로 쓸 수 있고, 다른 선생님 학생은 마우스를 올리면 코멘트 본문이 보인다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin } from '@/lib/auth';
import { Loader2, MessageSquareText, RefreshCw } from 'lucide-react';
import { getMondayOfWeek, getSundayOfWeek } from '@/lib/weekUtils';
import { WEEKLY_COMMENT_EXCLUDED_TEACHER_IDS } from '@/lib/constants';
import { WEEKLY_COMMENT_PRESENCE_CHANNEL, flattenPresence, type WeeklyCommentEditing } from '@/lib/weeklyCommentPresence';
import { WeeklySummaryDialog } from '@/components/lessons/WeeklySummaryDialog';

interface Cell {
  studentId: string;
  name: string;
  school: string | null;
  subject: string;
  /** 이 강사가 쓴 이번 주 코멘트 */
  ownText: string | null;
  /** 다른 선생님이 쓴 이번 주 코멘트 (이 강사는 안 씀) */
  otherText: string | null;
  otherBy: string | null;
}
interface TeacherGroup { teacherId: string; teacherName: string; cells: Cell[] }

const ACTIVE = new Set(['재학', '재등원']);

export function WeeklyCommentBoard() {
  const { user, role } = useAuth();
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Map<string, WeeklyCommentEditing[]>>(new Map());
  const [picked, setPicked] = useState<Cell | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const weekStart = getMondayOfWeek(new Date());
  const weekEnd = getSundayOfWeek(new Date());
  const excluded = WEEKLY_COMMENT_EXCLUDED_TEACHER_IDS as readonly string[];

  const fetchData = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('lesson_records')
        .select('student_id, teacher_id, teacher_display_name, subject, weekly_summary, weekly_summary_week, students:student_id(id, name, school, enrollment_status)')
        .gte('lesson_date', weekStart)
        .lte('lesson_date', weekEnd);
      const rows = (data || []) as any[];

      // 학생별 이번 주 코멘트 (누가 썼든)
      const commentBy = new Map<string, { teacherId: string; teacherName: string; text: string }[]>();
      for (const r of rows) {
        const t = (r.weekly_summary || '').trim();
        if (!t) continue;
        if (r.weekly_summary_week && r.weekly_summary_week !== weekStart) continue;
        const arr = commentBy.get(r.student_id) ?? [];
        if (!arr.some(x => x.teacherId === r.teacher_id && x.text === t)) {
          arr.push({ teacherId: r.teacher_id, teacherName: r.teacher_display_name || '선생님', text: t });
        }
        commentBy.set(r.student_id, arr);
      }

      const byTeacher = new Map<string, TeacherGroup>();
      for (const r of rows) {
        const s = r.students;
        if (!s || !r.teacher_id || excluded.includes(r.teacher_id)) continue;
        if (s.enrollment_status && !ACTIVE.has(s.enrollment_status)) continue;
        const g = byTeacher.get(r.teacher_id) ?? { teacherId: r.teacher_id, teacherName: r.teacher_display_name || '(강사?)', cells: [] };
        byTeacher.set(r.teacher_id, g);
        if (g.cells.some(c => c.studentId === s.id)) continue;
        const cs = commentBy.get(s.id) ?? [];
        const own = cs.find(x => x.teacherId === r.teacher_id);
        const other = cs.find(x => x.teacherId !== r.teacher_id);
        g.cells.push({
          studentId: s.id, name: s.name, school: s.school, subject: r.subject,
          ownText: own?.text ?? null, otherText: other?.text ?? null, otherBy: other?.teacherName ?? null,
        });
      }
      const list = [...byTeacher.values()];
      for (const g of list) g.cells.sort((a, b) => Number(!!a.ownText) - Number(!!b.ownText) || a.name.localeCompare(b.name, 'ko'));
      // 본인 그룹 먼저, 그다음 미작성 많은 순
      list.sort((a, b) => Number(b.teacherId === user?.id) - Number(a.teacherId === user?.id)
        || b.cells.filter(c => !c.ownText).length - a.cells.filter(c => !c.ownText).length);
      setGroups(list);
      setUpdatedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, user?.id, excluded]);

  useEffect(() => { if (user && isAdmin(role)) fetchData(); }, [user, role, fetchData]);

  // 실시간: 코멘트 저장(lesson_records 변경) → 새로고침 / presence → 작성 중
  useEffect(() => {
    if (!user || !isAdmin(role)) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const changes = supabase.channel('weekly-comment-board-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_records' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { fetchData(); }, 1500);
      })
      .subscribe();
    const presence = supabase.channel(WEEKLY_COMMENT_PRESENCE_CHANNEL, { config: { presence: { key: `board:${user.id}` } } });
    const sync = () => setEditing(flattenPresence(presence.presenceState() as Record<string, unknown[]>));
    presence.on('presence', { event: 'sync' }, sync).on('presence', { event: 'join' }, sync).on('presence', { event: 'leave' }, sync).subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(changes);
      supabase.removeChannel(presence);
    };
  }, [user, role, fetchData]);

  const totals = useMemo(() => {
    let done = 0, missing = 0, busy = 0;
    for (const g of groups) for (const c of g.cells) {
      const isBusy = (editing.get(c.studentId) || []).some(e => e.week_start === weekStart);
      if (isBusy) busy += 1; else if (c.ownText) done += 1; else missing += 1;
    }
    return { done, missing, busy, all: done + missing + busy };
  }, [groups, editing, weekStart]);

  if (!user || !isAdmin(role)) return null;

  return (
    <>
      <Card className="border-primary/30">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">이번 주 주간 코멘트 현황</h3>
              <Badge variant="outline" className="text-[10px]">{weekStart.slice(5).replace('-', '/')} ~ {weekEnd.slice(5).replace('-', '/')}</Badge>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 px-2 py-0.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />작성 {totals.done}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-700 px-2 py-0.5"><span className="w-2 h-2 rounded-full bg-red-500" />미작성 {totals.missing}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 text-blue-700 px-2 py-0.5"><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />작성 중 {totals.busy}</span>
              <button type="button" onClick={() => fetchData()} className="ml-1 text-muted-foreground hover:text-foreground" title={updatedAt ? `갱신 ${updatedAt.toLocaleTimeString('ko-KR')}` : '새로고침'}>
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-3 text-muted-foreground text-xs"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> 로딩...</div>
          ) : groups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">이번 주 수업 기록이 아직 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {groups.map(g => {
                const mine = g.teacherId === user.id;
                const done = g.cells.filter(c => !!c.ownText).length;
                return (
                  <div key={g.teacherId} className="rounded-lg border p-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold">
                        {g.teacherName}{mine && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(본인)</span>}
                      </p>
                      <span className={`text-[11px] ${done === g.cells.length ? 'text-emerald-700' : 'text-muted-foreground'}`}>{done} / {g.cells.length}명</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {g.cells.map(c => {
                        const busyBy = (editing.get(c.studentId) || []).filter(e => e.week_start === weekStart);
                        const isBusy = busyBy.length > 0;
                        const cls = isBusy
                          ? 'bg-blue-500/15 text-blue-800 border-blue-500/50 animate-pulse'
                          : c.ownText
                            ? 'bg-emerald-500/15 text-emerald-800 border-emerald-500/40'
                            : c.otherText
                              ? 'bg-emerald-500/5 text-emerald-700 border-emerald-500/40 border-dashed'
                              : 'bg-red-500/10 text-red-800 border-red-500/40';
                        const title = isBusy
                          ? `${busyBy.map(e => e.teacher_name).join(', ')} 작성 중`
                          : c.ownText
                            ? c.ownText
                            : c.otherText
                              ? `${c.otherBy} 선생님이 작성: ${c.otherText}`
                              : `${g.teacherName} 미작성 (${c.subject})`;
                        const common = `inline-flex items-center h-6 px-2 rounded-md border text-[11px] ${cls}`;
                        return mine ? (
                          <button key={c.studentId} type="button" className={`${common} hover:brightness-95`} title={title} onClick={() => setPicked(c)}>
                            {c.name}
                          </button>
                        ) : (
                          <span key={c.studentId} className={common} title={title}>{c.name}</span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground leading-tight">
            점선 초록 = 다른 과목 선생님이 쓴 코멘트만 있음. 이름에 마우스를 올리면 코멘트 본문이 보입니다. 본인 수업 학생은 눌러서 바로 씁니다. 재진쌤(영어)은 포털 수업 코멘트로 갈음해 제외.
          </p>
        </CardContent>
      </Card>
      {picked && (
        <WeeklySummaryDialog
          open={!!picked}
          onOpenChange={(o) => { if (!o) setPicked(null); }}
          studentId={picked.studentId}
          studentName={picked.name}
          subject={picked.subject}
          weekStart={weekStart}
          onSaved={fetchData}
        />
      )}
    </>
  );
}
