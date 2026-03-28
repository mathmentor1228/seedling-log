import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatCard } from '@/components/ui/stat-card';
import { useToast } from '@/hooks/use-toast';
import { useAuth, isAdmin as checkIsAdmin, isTeacher as checkIsTeacher } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import { Plus, Trash2, RotateCcw, Stethoscope, AlertCircle, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { ROOMS, SUBJECTS } from './constants';
import { UnifiedRecordModal } from './UnifiedRecordModal';
import { useTeachersList } from './useTeachersList';

const PAGE_SIZE = 50;

type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'unconfirmed_first';

export function ClinicTab() {
  const { toast } = useToast();
  const { user, role } = useAuth();
  const { teachers } = useTeachersList();
  const isAdmin = checkIsAdmin(role);
  const isTeacherRole = checkIsTeacher(role);

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(getTodayKST());
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(0);

  const fetchRecords = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from('clinic_records')
      .select('*, students!inner(name), profiles!teacher_id(full_name)')
      .gte('clinic_date', startDate)
      .lte('clinic_date', endDate)
      .order('clinic_date', { ascending: false })
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

  // Unconfirmed count
  const unconfirmedCount = useMemo(() =>
    records.filter(r => r.teacher_note && !r.teacher_note_shown).length
  , [records]);

  const filtered = useMemo(() => {
    let list = [...records];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => r.student_name?.toLowerCase().includes(q));
    }
    if (subjectFilter !== 'all') {
      list = list.filter(r => r.subject === subjectFilter);
    }
    if (teacherFilter !== 'all') {
      list = list.filter(r => r.teacher_id === teacherFilter);
    }
    if (roomFilter !== 'all') {
      list = list.filter(r => r.room === roomFilter);
    }
    if (unconfirmedOnly) {
      list = list.filter(r => r.teacher_note && !r.teacher_note_shown);
    }
    list.sort((a, b) => {
      switch (sortKey) {
        case 'date_asc': return (a.clinic_date || '').localeCompare(b.clinic_date || '');
        case 'name_asc': return (a.student_name || '').localeCompare(b.student_name || '');
        case 'unconfirmed_first': {
          const aU = a.teacher_note && !a.teacher_note_shown ? 0 : 1;
          const bU = b.teacher_note && !b.teacher_note_shown ? 0 : 1;
          return aU - bU || (b.clinic_date || '').localeCompare(a.clinic_date || '');
        }
        default: return (b.clinic_date || '').localeCompare(a.clinic_date || '');
      }
    });
    return list;
  }, [records, searchQuery, subjectFilter, teacherFilter, roomFilter, unconfirmedOnly, sortKey]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Monthly stats
  const monthStats = useMemo(() => {
    const now = new Date();
    const ms = format(startOfMonth(now), 'yyyy-MM-dd');
    const me = format(endOfMonth(now), 'yyyy-MM-dd');
    const monthRecords = records.filter(r => r.clinic_date >= ms && r.clinic_date <= me);
    const count = monthRecords.length;

    // Most common subject
    const subjCounts: Record<string, number> = {};
    monthRecords.forEach(r => {
      if (r.subject) subjCounts[r.subject] = (subjCounts[r.subject] || 0) + 1;
    });
    const topSubject = Object.entries(subjCounts).sort((a, b) => b[1] - a[1])[0];

    // Top 5 students
    const studentCounts: Record<string, { name: string; count: number; subjects: Record<string, number> }> = {};
    monthRecords.forEach(r => {
      if (!studentCounts[r.student_id]) {
        studentCounts[r.student_id] = { name: r.student_name || '-', count: 0, subjects: {} };
      }
      studentCounts[r.student_id].count++;
      if (r.subject) {
        studentCounts[r.student_id].subjects[r.subject] = (studentCounts[r.student_id].subjects[r.subject] || 0) + 1;
      }
    });
    const top5 = Object.entries(studentCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([id, v], i) => {
        const mainSubject = Object.entries(v.subjects).sort((a, b) => b[1] - a[1])[0];
        return { rank: i + 1, name: v.name, count: v.count, mainSubject: mainSubject?.[0] || '-' };
      });

    return { count, unconfirmed: unconfirmedCount, topSubject: topSubject?.[0] || '-', top5 };
  }, [records, unconfirmedCount]);

  function resetFilters() {
    setStartDate(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    setEndDate(getTodayKST());
    setSearchQuery('');
    setSubjectFilter('all');
    setTeacherFilter('all');
    setRoomFilter('all');
    setUnconfirmedOnly(false);
    setSortKey('date_desc');
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    await supabase.from('clinic_records').delete().eq('id', id);
    toast({ title: '삭제되었습니다' });
    fetchRecords();
  }

  async function handleConfirmNote(id: string) {
    await supabase.from('clinic_records').update({ teacher_note_shown: true }).eq('id', id);
    toast({ title: '확인 완료 처리되었습니다' });
    fetchRecords();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">클리닉 관리</h2>
        <Button onClick={() => setModalOpen(true)} className="gap-1">
          <Plus className="w-4 h-4" /> 클리닉 기록 추가
        </Button>
      </div>

      {/* Unconfirmed alert */}
      {unconfirmedCount > 0 && (
        <Alert className="border-warning/50 bg-warning/5">
          <AlertDescription>
            🏥 확인하지 않은 클리닉 특이사항이 <strong>{unconfirmedCount}건</strong> 있습니다
          </AlertDescription>
        </Alert>
      )}

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
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">담당 선생님</label>
              <Select value={teacherFilter} onValueChange={setTeacherFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
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
                  <SelectItem value="unconfirmed_first">미확인 먼저</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant={unconfirmedOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUnconfirmedOnly(!unconfirmedOnly)}
              className="gap-1"
            >
              <AlertCircle className="w-3.5 h-3.5" /> 미확인만
            </Button>
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
                  <TableHead>시간</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>과목</TableHead>
                  <TableHead>담당선생님</TableHead>
                  <TableHead>클리닉 내용</TableHead>
                  <TableHead>다음예정</TableHead>
                  <TableHead>특이사항</TableHead>
                  <TableHead>강의실</TableHead>
                  <TableHead>액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell></TableRow>
                ) : paged.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">기록이 없습니다</TableCell></TableRow>
                ) : paged.map(r => (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm">{r.clinic_date ? format(new Date(r.clinic_date + 'T00:00:00'), 'MM/dd') : '-'}</TableCell>
                    <TableCell className="text-sm">
                      {r.start_time ? r.start_time.slice(0, 5) : '-'}
                      {r.end_time ? `~${r.end_time.slice(0, 5)}` : ''}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{r.student_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.subject}</Badge></TableCell>
                    <TableCell className="text-sm">{r.teacher_name || '-'}</TableCell>
                    <TableCell className="text-sm max-w-[200px]">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="truncate block max-w-[200px]">{r.content}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs"><p>{r.content}</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{r.next_clinic_memo || '-'}</TableCell>
                    <TableCell>
                      {r.teacher_note ? (
                        r.teacher_note_shown ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-success/10 text-success border-success/30 text-xs">
                                  ✅ 확인완료
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs"><p>{r.teacher_note}</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Badge
                            className="bg-destructive/10 text-destructive border-destructive/30 text-xs cursor-pointer"
                            onClick={() => handleConfirmNote(r.id)}
                            title={r.teacher_note}
                          >
                            🔴 미확인 (클릭시 확인)
                          </Badge>
                        )
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {r.room === 'room10' ? (
                        <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">10강의실</Badge>
                      ) : r.room === 'glass' ? (
                        <Badge className="bg-accent text-accent-foreground border-accent text-xs">유리문강의실</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
          title="이번 달 클리닉 횟수"
          value={`${monthStats.count}회`}
          icon={<Stethoscope className="w-5 h-5" />}
          iconColor="primary"
        />
        <StatCard
          title="미확인 특이사항"
          value={`${monthStats.unconfirmed}건`}
          icon={<AlertCircle className="w-5 h-5" />}
          iconColor="destructive"
        />
        <StatCard
          title="가장 많은 클리닉 과목"
          value={monthStats.topSubject}
          icon={<BarChart3 className="w-5 h-5" />}
          iconColor="warning"
        />
      </div>

      {/* Top 5 students */}
      {monthStats.top5.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">학생별 클리닉 횟수 Top 5 (이번 달)</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">순위</TableHead>
                  <TableHead>학생 이름</TableHead>
                  <TableHead>총 횟수</TableHead>
                  <TableHead>주요 과목</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthStats.top5.map(s => (
                  <TableRow key={s.rank}>
                    <TableCell className="text-sm font-medium">{s.rank}</TableCell>
                    <TableCell className="text-sm">{s.name}</TableCell>
                    <TableCell className="text-sm">{s.count}회</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{s.mainSubject}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <UnifiedRecordModal open={modalOpen} onOpenChange={setModalOpen} defaultTypes={['clinic']} onSaved={fetchRecords} />
    </div>
  );
}
