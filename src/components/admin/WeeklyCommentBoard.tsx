// WEEKLY-COMMENT-V2: 원장 대시보드 — 이번 주 주간 코멘트 현황판 (전 강사, 실시간)
// 초록 = 작성 완료 · 빨강 = 아직 미작성 · 파랑 = 지금 누군가 입력창을 열고 쓰는 중 (Realtime presence)
// lesson_records 가 바뀌면(코멘트 저장 포함) 1.5초 뒤 자동 새로고침. 월~일 내내 보인다.
// 원장 본인 수업 학생은 눌러서 바로 쓸 수 있고, 다른 선생님 학생은 마우스를 올리면 코멘트 본문이 보인다.
// 명단은 weeklyCommentRoster(일지 ∪ 시간표 ∪ 담당 매핑) — 일지만 보면 아직 수업 안 한 학생이 빠진다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin } from '@/lib/auth';
import { Loader2, MessageSquareText, RefreshCw, ChevronRight } from 'lucide-react';
import { getMondayOfWeek, getSundayOfWeek } from '@/lib/weekUtils';
import { WEEKLY_COMMENT_EXCLUDED_TEACHER_IDS } from '@/lib/constants';
import { WEEKLY_COMMENT_PRESENCE_CHANNEL, flattenPresence, type WeeklyCommentEditing } from '@/lib/weeklyCommentPresence';
import { WeeklySummaryDialog } from '@/components/lessons/WeeklySummaryDialog';
import { fetchWeeklyCommentRoster, sourceLabel } from '@/lib/weeklyCommentRoster';

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
  /** 이번 주 일지가 아직 없고 시간표·매핑으로만 잡힌 학생 */
  noLessonYet: boolean;
  sourceNote: string;
}
interface TeacherGroup { teacherId: string; teacherName: string; cells: Cell[] }

export function WeeklyCommentBoard() {
  const { user, role } = useAuth();
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Map<string, WeeklyCommentEditing[]>>(new Map());
  const [picked, setPicked] = useState<Cell | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const weekStart = getMondayOfWeek(new Date());
  const weekEnd = getSundayOfWeek(new Date());
  const excluded = WEEKLY_COMMENT_EXCLUDED_TEACHER_IDS as readonly string[];

  const fetchData = useCallback(async () => {
    try {
      // 이번 주 일지 ∪ 활성 시간표 ∪ 담당 매핑 — 일지만 보면 아직 수업 안 한 학생이 빠진다 (2026-10-09 원장 지적)
      const roster = await fetchWeeklyCommentRoster(weekStart, weekEnd, { excludedTeacherIds: excluded });
      const list: TeacherGroup[] = roster.groups.map(g => ({
        teacherId: g.teacherId,
        teacherName: g.teacherName,
        cells: g.students.map(st => {
          const cs = roster.commentsByStudent.get(st.id) ?? [];
          const own = cs.find(x => x.teacherId === g.teacherId);
          const other = cs.find(x => x.teacherId !== g.teacherId);
          return {
            studentId: st.id, name: st.name, school: st.school, subject: st.subject || '수학',
            ownText: own?.text ?? null, otherText: other?.text ?? null, otherBy: other?.teacherName ?? null,
            noLessonYet: !st.sources.includes('lesson'), sourceNote: sourceLabel(st.sources),
          };
        }),
      }));
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
            <p className="text-xs text-muted-foreground py-1">이번 주 담당 학생이 없습니다 (일지·시간표·담당 매핑 기준).</p>
          ) : (
            <div className="space-y-2">
              {groups.map(g => {
                const mine = g.teacherId === user.id;
                const done = g.cells.filter(c => !!c.ownText).length;
                const busy = g.cells.filter(c => (editing.get(c.studentId) || []).some(e => e.week_start === weekStart)).length;
                const missing = g.cells.length - done;
                const isOpen = mine || expanded.has(g.teacherId);
                const pct = g.cells.length ? Math.round((done / g.cells.length) * 100) : 0;
                return (
                  <div key={g.teacherId} className="rounded-lg border p-2">
                    <button type="button" className="w-full flex items-center gap-2 text-left"
                      onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(g.teacherId)) n.delete(g.teacherId); else n.add(g.teacherId); return n; })}>
                      <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                      <p className="text-xs font-semibold w-[72px] shrink-0 truncate">
                        {g.teacherName}{mine && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(본인)</span>}
                      </p>
                      <div className="flex-1 h-2 rounded-full bg-red-500/15 overflow-hidden" title={`작성 ${done} · 미작성 ${missing}`}>
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[11px] tabular-nums shrink-0 ${missing === 0 ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                        {done}/{g.cells.length}
                        {missing > 0 && <span className="ml-1 text-red-700">미작성 {missing}</span>}
                        {busy > 0 && <span className="ml-1 text-blue-700">작성 중 {busy}</span>}
                      </span>
                    </button>
                    {isOpen && <div className="flex flex-wrap gap-1 mt-2 pl-5">
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
                              : `${g.teacherName} 미작성 (${c.subject})${c.sourceNote ? ` · ${c.sourceNote}` : ''}`;
                        const common = `inline-flex items-center h-6 px-2 rounded-md border text-[11px] ${cls}${c.noLessonYet && !c.ownText && !isBusy ? ' opacity-80' : ''}`;
                        return mine ? (
                          <button key={c.studentId} type="button" className={`${common} hover:brightness-95`} title={title} onClick={() => setPicked(c)}>
                            {c.name}
                          </button>
                        ) : (
                          <span key={c.studentId} className={common} title={title}>{c.name}</span>
                        );
                      })}
                    </div>}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground leading-tight">
            강사 줄을 누르면 학생 이름이 펼쳐집니다(본인은 항상 펼침). 명단 = 이번 주 일지 ∪ 활성 시간표 ∪ 담당 매핑. 점선 초록 = 다른 과목 선생님이 쓴 코멘트만 있음. 이름에 마우스를 올리면 코멘트 본문(미작성이면 출처)이 보입니다. 본인 수업 학생은 눌러서 바로 씁니다. 재진쌤(영어)은 포털 수업 코멘트로 갈음해 제외.
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
