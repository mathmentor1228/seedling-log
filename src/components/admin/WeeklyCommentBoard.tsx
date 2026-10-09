// WEEKLY-COMMENT-V2: 원장 대시보드 — 이번 주 주간 코멘트 현황판 (전 강사, 실시간)
// 초록 = 작성 완료 · 빨강 = 아직 미작성 · 파랑 = 지금 누군가 입력창을 열고 쓰는 중 (Realtime presence)
// lesson_records 가 바뀌면(코멘트 저장 포함) 1.5초 뒤 자동 새로고침. 월~일 내내 보인다.
// 과목(선생님)별로 따로 관리: 완료·작성 중은 (선생님, 학생) 단위. 본인 학생은 눌러서 바로 쓰고, 다른 선생님 학생은 누르면 내용·상태 팝업.
// 명단은 weeklyCommentRoster(일지 ∪ 시간표 ∪ 담당 매핑) — 일지만 보면 아직 수업 안 한 학생이 빠진다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin } from '@/lib/auth';
import { Loader2, MessageSquareText, RefreshCw, ChevronRight } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { getMondayOfWeek, getSundayOfWeek } from '@/lib/weekUtils';
import { WEEKLY_COMMENT_EXCLUDED_TEACHER_IDS } from '@/lib/constants';
import { WEEKLY_COMMENT_PRESENCE_CHANNEL, flattenPresence, presenceKey, type WeeklyCommentEditing } from '@/lib/weeklyCommentPresence';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WeeklySummaryDialog } from '@/components/lessons/WeeklySummaryDialog';
import { fetchWeeklyCommentRoster, sourceLabel } from '@/lib/weeklyCommentRoster';

interface Cell {
  studentId: string;
  name: string;
  school: string | null;
  subject: string;
  /** 이 강사(과목)가 쓴 이번 주 코멘트 — 과목별로 따로 관리한다 */
  ownText: string | null;
  /** 참고용: 다른 과목 선생님들이 쓴 이번 주 코멘트 */
  others: { teacherName: string; text: string }[];
  /** 이번 주 일지가 아직 없고 시간표·매핑으로만 잡힌 학생 */
  noLessonYet: boolean;
  sourceNote: string;
}
interface TeacherGroup { teacherId: string; teacherName: string; cells: Cell[] }

/** 미작성의 긴급도 — 월·화 차분(회색) · 수·목 주의(주황) · 금·토·일 마감 임박(빨강). 일요일 밤에 편지가 만들어진다. */
function urgencyToday(): 'calm' | 'warn' | 'due' {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay(); // 0=일
  if (d === 1 || d === 2) return 'calm';
  if (d === 3 || d === 4) return 'warn';
  return 'due';
}
const MISSING_CHIP = {
  calm: 'bg-background text-foreground border-border',
  warn: 'bg-amber-500/10 text-amber-900 border-amber-500/40',
  due: 'bg-red-500/10 text-red-800 border-red-500/40',
};
const MISSING_TEXT = { calm: 'text-muted-foreground', warn: 'text-amber-700', due: 'text-red-700' };
const MISSING_DOT = { calm: 'bg-muted-foreground/60', warn: 'bg-amber-500', due: 'bg-red-500' };
const MISSING_LABEL = { calm: '미작성', warn: '미작성 · 이번 주 내', due: '미작성 · 일요일 밤까지' };

export function WeeklyCommentBoard() {
  const urgency = urgencyToday();
  const { user, role } = useAuth();
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Map<string, WeeklyCommentEditing[]>>(new Map());
  const [picked, setPicked] = useState<Cell | null>(null);
  const [peek, setPeek] = useState<{ cell: Cell; teacherId: string; teacherName: string } | null>(null);
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
          return {
            studentId: st.id, name: st.name, school: st.school, subject: st.subject || '수학',
            ownText: own?.text ?? null,
            others: cs.filter(x => x.teacherId !== g.teacherId).map(x => ({ teacherName: x.teacherName, text: x.text })),
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
      const isBusy = (editing.get(presenceKey(g.teacherId, c.studentId)) || []).some(e => e.week_start === weekStart);
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
              <h3 className="text-base font-bold">이번 주 주간 코멘트</h3>
              <Badge variant="outline" className="text-[10px]">{weekStart.slice(5).replace('-', '/')} ~ {weekEnd.slice(5).replace('-', '/')}</Badge>
              <HelpTip>
                과목(선생님)별로 따로 관리합니다. 같은 학생이라도 선생님마다 각자 씁니다. 강사 줄을 누르면 학생 이름이 펼쳐지고(본인은 항상 펼침),
                학생 이름을 누르면 본인 학생은 바로 쓰고 다른 선생님 학생은 내용·작성 중 여부가 팝업으로 보입니다.
                명단 = 이번 주 일지 ∪ 활성 시간표 ∪ 담당 매핑. 미작성 색은 요일에 따라 회색(월·화) → 주황(수·목) → 빨강(금~일)으로 올라갑니다. 재진쌤(영어)은 포털 수업 코멘트로 갈음해 제외.
              </HelpTip>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 px-2 py-0.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />작성 {totals.done}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${urgency === 'due' ? 'bg-red-500/10' : urgency === 'warn' ? 'bg-amber-500/10' : 'bg-muted'} ${MISSING_TEXT[urgency]}`}><span className={`w-2 h-2 rounded-full ${MISSING_DOT[urgency]}`} />{MISSING_LABEL[urgency]} {totals.missing}</span>
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
                const busy = g.cells.filter(c => (editing.get(presenceKey(g.teacherId, c.studentId)) || []).some(e => e.week_start === weekStart)).length;
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
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden" title={`작성 ${done} · 미작성 ${missing}`}>
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[11px] tabular-nums shrink-0 ${missing === 0 ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                        {done}/{g.cells.length}
                        {missing > 0 && <span className={`ml-1 ${MISSING_TEXT[urgency]}`}>미작성 {missing}</span>}
                        {busy > 0 && <span className="ml-1 text-blue-700">작성 중 {busy}</span>}
                      </span>
                    </button>
                    {isOpen && <div className="flex flex-wrap gap-1 mt-2 pl-5">
                      {g.cells.map(c => {
                        const busyBy = (editing.get(presenceKey(g.teacherId, c.studentId)) || []).filter(e => e.week_start === weekStart);
                        const isBusy = busyBy.length > 0;
                        const cls = isBusy
                          ? 'bg-blue-500/15 text-blue-800 border-blue-500/50 animate-pulse'
                          : c.ownText
                            ? 'bg-emerald-500/15 text-emerald-800 border-emerald-500/40'
                            : MISSING_CHIP[urgency];
                        const title = isBusy
                          ? `${busyBy.map(e => e.teacher_name).join(', ')} 작성 중 — 누르면 상태 보기`
                          : c.ownText
                            ? '작성 완료 — 누르면 내용 보기'
                            : `${g.teacherName} 미작성 (${c.subject})${c.sourceNote ? ` · ${c.sourceNote}` : ''}`;
                        const common = `inline-flex items-center h-6 px-2 rounded-md border text-[11px] hover:brightness-95 ${cls}${c.noLessonYet && !c.ownText && !isBusy ? ' opacity-80' : ''}`;
                        // 본인 학생은 바로 쓰기, 다른 선생님 학생은 내용·상태 팝업
                        return (
                          <button key={c.studentId} type="button" className={common} title={title}
                            onClick={() => mine ? setPicked(c) : setPeek({ cell: c, teacherId: g.teacherId, teacherName: g.teacherName })}>
                            {c.name}
                          </button>
                        );
                      })}
                    </div>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {/* 다른 선생님 학생: 작성 내용·상태 열람 (읽기 전용) */}
      <Dialog open={!!peek} onOpenChange={(o) => { if (!o) setPeek(null); }}>
        <DialogContent className="max-w-md">
          {peek && (() => {
            const busyBy = (editing.get(presenceKey(peek.teacherId, peek.cell.studentId)) || []).filter(e => e.week_start === weekStart);
            const status = busyBy.length ? 'busy' : peek.cell.ownText ? 'done' : 'missing';
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base flex-wrap">
                    {peek.cell.name}
                    <Badge variant="outline" className="font-normal">{peek.teacherName} · {peek.cell.subject}</Badge>
                    <Badge className={status === 'busy' ? 'bg-blue-500/15 text-blue-800 border-blue-500/40' : status === 'done' ? 'bg-emerald-500/15 text-emerald-800 border-emerald-500/40' : 'bg-red-500/10 text-red-800 border-red-500/40'}>
                      {status === 'busy' ? `작성 중 · ${busyBy.map(e => e.teacher_name).join(', ')}` : status === 'done' ? '작성 완료' : '미작성'}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  {status === 'busy' && (
                    <p className="text-xs text-muted-foreground">
                      {busyBy[0]?.since ? `${new Date(busyBy[0].since).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}부터 ` : ''}입력창을 열어 두고 있습니다. 저장되면 이 창이 자동으로 바뀝니다.
                    </p>
                  )}
                  {peek.cell.ownText ? (
                    <p className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap leading-relaxed">{peek.cell.ownText}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {peek.teacherName} 선생님이 아직 {peek.cell.subject} 코멘트를 쓰지 않았습니다.{peek.cell.sourceNote ? ` (${peek.cell.sourceNote})` : ''}
                    </p>
                  )}
                  {peek.cell.others.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">참고 — 다른 과목 선생님의 이번 주 코멘트</p>
                      {peek.cell.others.map((o, i) => (
                        <p key={i} className="text-xs rounded-md border border-dashed p-2"><span className="font-medium">{o.teacherName}:</span> {o.text}</p>
                      ))}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
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
