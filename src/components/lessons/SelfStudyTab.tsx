import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatCard } from '@/components/ui/stat-card';
import { useToast } from '@/hooks/use-toast';
import { useAuth, isAdmin as checkIsAdmin, isTeacher as checkIsTeacher } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import { Plus, Trash2, RotateCcw, BookOpen, Clock, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { getRoomLabel, isSpecialRoom, ROOMS } from './constants';
import { UnifiedRecordModal } from './UnifiedRecordModal';

const PAGE_SIZE = 50;

type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'duration_desc';

function calcDuration(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function formatDuration(mins: number | null) {
  if (!mins || mins <= 0) return '-';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}시간${m > 0 ? ` ${m}분` : ''}` : `${m}분`;
}

function formatTotalDuration(mins: number) {
  if (mins <= 0) return '0분';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}시간${m > 0 ? ` ${m}분` : ''}` : `${m}분`;
}

function parseTasks(taskList: any): { id: string; task: string; done: boolean }[] {
  if (!Array.isArray(taskList)) return [];
  return taskList;
}

function taskSummary(taskList: any) {
  const tasks = parseTasks(taskList);
  if (tasks.length === 0) return '-';
  const done = tasks.filter(t => t.done).length;
  if (done === tasks.length) return '✅ 전체완료';
  return `${done}/${tasks.length} 완료`;
}

export function SelfStudyTab() {
  const { toast } = useToast();
  const { user, role } = useAuth();
  const isAdmin = checkIsAdmin(role);
  const isTeacherRole = checkIsTeacher(role);

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(getTodayKST());
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(0);

  const fetchRecords = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from('self_study_records')
      .select('*, students!inner(name), profiles!teacher_id(full_name)')
      .gte('study_date', startDate)
      .lte('study_date', endDate)
      .order('study_date', { ascending: false })
      .order('start_time', { ascending: true });

    if (isTeacherRole && !isAdmin) {
      query = query.eq('teacher_id', user.id);
    }

    const { data } = await query;
    const results = (data || []).map((r: any) => ({
      ...r,
      student_name: r.students?.name,
      teacher_name: r.profiles?.full_name,
    }));
    setRecords(results);
    setLoading(false);
    setPage(0);
  }, [startDate, endDate, user, isTeacherRole, isAdmin]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const filtered = useMemo(() => {
    let list = [...records];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => r.student_name?.toLowerCase().includes(q));
    }
    if (subjectFilter) {
      const q = subjectFilter.toLowerCase();
      list = list.filter(r => r.subject?.toLowerCase().includes(q));
    }
    if (roomFilter !== 'all') {
      list = list.filter(r => r.room === roomFilter);
    }
    // sort
    list.sort((a, b) => {
      switch (sortKey) {
        case 'date_asc': return (a.study_date || '').localeCompare(b.study_date || '');
        case 'name_asc': return (a.student_name || '').localeCompare(b.student_name || '');
        case 'duration_desc': {
          const da = a.duration_minutes ?? calcDuration(a.start_time, a.end_time) ?? 0;
          const db = b.duration_minutes ?? calcDuration(b.start_time, b.end_time) ?? 0;
          return db - da;
        }
        default: return (b.study_date || '').localeCompare(a.study_date || '');
      }
    });
    return list;
  }, [records, searchQuery, subjectFilter, roomFilter, sortKey]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Monthly stats
  const monthStats = useMemo(() => {
    const now = new Date();
    const ms = format(startOfMonth(now), 'yyyy-MM-dd');
    const me = format(endOfMonth(now), 'yyyy-MM-dd');
    const monthRecords = records.filter(r => r.study_date >= ms && r.study_date <= me);
    const count = monthRecords.length;
    let totalMins = 0;
    const roomCounts: Record<string, number> = { general: 0, room10: 0, glass: 0 };
    monthRecords.forEach(r => {
      const dur = r.duration_minutes ?? calcDuration(r.start_time, r.end_time) ?? 0;
      totalMins += dur;
      if (roomCounts[r.room] !== undefined) roomCounts[r.room]++;
    });
    const avgMins = count > 0 ? Math.round(totalMins / count) : 0;
    return { count, totalMins, avgMins, roomCounts };
  }, [records]);

  function resetFilters() {
    setStartDate(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    setEndDate(getTodayKST());
    setSearchQuery('');
    setSubjectFilter('');
    setRoomFilter('all');
    setSortKey('date_desc');
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    await supabase.from('self_study_records').delete().eq('id', id);
    toast({ title: '삭제되었습니다' });
    fetchRecords();
  }

  function getEffectiveDuration(r: any) {
    return r.duration_minutes ?? calcDuration(r.start_time, r.end_time);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">자습 관리</h2>
        <Button onClick={() => setModalOpen(true)} className="gap-1">
          <Plus className="w-4 h-4" /> 자습 기록 추가
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">시작일</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">종료일</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">과목</label>
              <Input value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} placeholder="과목..." className="w-24" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">강의실</label>
              <Select value={roomFilter} onValueChange={setRoomFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {ROOMS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">학생 검색</label>
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="이름..." className="w-28" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">정렬</label>
              <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_desc">날짜 최신순</SelectItem>
                  <SelectItem value="date_asc">날짜 오래된순</SelectItem>
                  <SelectItem value="name_asc">학생 이름순</SelectItem>
                  <SelectItem value="duration_desc">학습시간 긴순</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> 초기화
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground">총 {filtered.length}건</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>과목</TableHead>
                  <TableHead>시작</TableHead>
                  <TableHead>종료</TableHead>
                  <TableHead>학습시간</TableHead>
                  <TableHead>강의실</TableHead>
                  <TableHead>할일목록</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead>액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell></TableRow>
                ) : paged.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">기록이 없습니다</TableCell></TableRow>
                ) : paged.map(r => {
                  const dur = getEffectiveDuration(r);
                  return (
                    <TableRow key={r.id} className="hover:bg-muted/50">
                      <TableCell className="text-sm">{r.study_date ? format(new Date(r.study_date + 'T00:00:00'), 'MM/dd') : '-'}</TableCell>
                      <TableCell className="text-sm font-medium">{r.student_name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{r.subject || '-'}</Badge></TableCell>
                      <TableCell className="text-sm">{r.start_time?.slice(0, 5) || '-'}</TableCell>
                      <TableCell className="text-sm">{r.end_time?.slice(0, 5) || '-'}</TableCell>
                      <TableCell className="text-sm">{formatDuration(dur)}</TableCell>
                      <TableCell>
                        {r.room === 'room10' ? (
                          <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">10강의실</Badge>
                        ) : r.room === 'glass' ? (
                          <Badge className="bg-accent text-accent-foreground border-accent text-xs">유리문강의실</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{taskSummary(r.task_list)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px]">
                        {r.memo ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block max-w-[150px]">{r.memo}</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs"><p>{r.memo}</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3 border-t border-border">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          title="이번 달 자습 횟수"
          value={`${monthStats.count}회`}
          icon={<BookOpen className="w-5 h-5" />}
          iconColor="primary"
        />
        <StatCard
          title="이번 달 총 자습 시간"
          value={formatTotalDuration(monthStats.totalMins)}
          icon={<Clock className="w-5 h-5" />}
          iconColor="success"
        />
        <StatCard
          title="이번 달 평균 자습 시간"
          value={formatTotalDuration(monthStats.avgMins)}
          icon={<BarChart3 className="w-5 h-5" />}
          iconColor="warning"
        />
      </div>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">강의실별 이용 현황 (이번 달)</p>
          <div className="flex gap-4 text-sm">
            <span>일반강의실: <strong>{monthStats.roomCounts.general}회</strong></span>
            <span>10강의실: <strong>{monthStats.roomCounts.room10}회</strong></span>
            <span>유리문강의실: <strong>{monthStats.roomCounts.glass}회</strong></span>
          </div>
        </CardContent>
      </Card>

      <UnifiedRecordModal open={modalOpen} onOpenChange={setModalOpen} defaultTypes={['self_study']} onSaved={fetchRecords} />
    </div>
  );
}
