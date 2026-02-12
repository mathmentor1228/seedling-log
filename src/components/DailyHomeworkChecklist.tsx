// DAILY-HW-CHECKLIST-V1: Per-teacher daily homework checklist with bulk delete
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ClipboardCheck, Trash2, Loader2, ChevronDown, Calendar, Filter } from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import { getTodayKST } from '@/lib/utils';

const SUBJECTS = ['수학', '영어', '국어', '과학'] as const;

interface DailyHomeworkItem {
  id: string;
  student_id: string;
  student_name: string;
  subject: string;
  content: string;
  assigned_date: string;
  check_status: string;
  result: string | null;
  checked_at: string | null;
  submitted_at: string | null;
  submission_image_url: string | null;
}

interface TeacherGroup {
  teacher_id: string;
  teacher_name: string;
  items: DailyHomeworkItem[];
}

const CHECK_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  unchecked: { label: '미확인', className: 'bg-muted text-muted-foreground' },
  checked: { label: '확인완료', className: 'bg-green-500/15 text-green-600 border-green-500/30' },
  submitted: { label: '제출됨', className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
};

export default function DailyHomeworkChecklist() {
  const { user, role } = useAuth();
  const { toast } = useToast();

  const today = getTodayKST();
  const mondayOfWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const fridayOfWeek = format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 4), 'yyyy-MM-dd');

  const [startDate, setStartDate] = useState(mondayOfWeek);
  const [endDate, setEndDate] = useState(fridayOfWeek);
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DailyHomeworkItem[]>([]);
  const [teacherMap, setTeacherMap] = useState<Record<string, string>>({});
  const [studentTeacherMap, setStudentTeacherMap] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, filterSubject]);

  async function fetchData() {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      // Fetch daily homework assignments
      let query = supabase
        .from('homework_assignments')
        .select(`
          id, student_id, subject, content, assigned_date,
          check_status, result, checked_at, submitted_at, submission_image_url,
          students:student_id (name)
        `)
        .eq('homework_type', 'daily')
        .gte('assigned_date', startDate)
        .lte('assigned_date', endDate)
        .order('assigned_date', { ascending: true });

      if (filterSubject !== 'all') {
        query = query.eq('subject', filterSubject as any);
      }

      const { data: hwData, error } = await query;
      if (error) throw error;

      const formatted: DailyHomeworkItem[] = (hwData || []).map((h: any) => ({
        id: h.id,
        student_id: h.student_id,
        student_name: h.students?.name || '알 수 없음',
        subject: h.subject,
        content: h.content,
        assigned_date: h.assigned_date,
        check_status: h.check_status,
        result: h.result,
        checked_at: h.checked_at,
        submitted_at: h.submitted_at,
        submission_image_url: h.submission_image_url,
      }));

      setItems(formatted);

      // Fetch student-teacher mappings for grouping
      const studentIds = [...new Set(formatted.map(i => i.student_id))];
      if (studentIds.length > 0) {
        const subjects = filterSubject !== 'all' 
          ? [filterSubject] 
          : [...new Set(formatted.map(i => i.subject))];

        let mappingQuery = supabase
          .from('student_subject_teachers')
          .select('student_id, teacher_id, subject')
          .in('student_id', studentIds)
          .in('subject', subjects);

        if (role === 'teacher' && user?.id) {
          mappingQuery = mappingQuery.eq('teacher_id', user.id);
        }

        const { data: mappings } = await mappingQuery;

        // Build student -> teacher map (use first match per student)
        const stMap: Record<string, string> = {};
        const teacherIds = new Set<string>();
        (mappings || []).forEach((m: any) => {
          if (!stMap[m.student_id]) {
            stMap[m.student_id] = m.teacher_id;
          }
          teacherIds.add(m.teacher_id);
        });
        setStudentTeacherMap(stMap);

        // Fetch teacher names
        if (teacherIds.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', [...teacherIds]);
          
          const tMap: Record<string, string> = {};
          (profiles || []).forEach((p: any) => {
            tMap[p.id] = p.full_name || '알 수 없음';
          });
          setTeacherMap(tMap);
        }
      }
    } catch (error) {
      console.error('Error fetching daily homework:', error);
      toast({ title: '데이터 로드 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  // Group items by teacher
  const teacherGroups: TeacherGroup[] = useMemo(() => {
    const groups: Record<string, TeacherGroup> = {};
    
    items.forEach(item => {
      const teacherId = studentTeacherMap[item.student_id] || 'unassigned';
      if (!groups[teacherId]) {
        groups[teacherId] = {
          teacher_id: teacherId,
          teacher_name: teacherId === 'unassigned' ? '미배정' : (teacherMap[teacherId] || '알 수 없음'),
          items: [],
        };
      }
      groups[teacherId].items.push(item);
    });

    // Sort items within each group by date then student name
    Object.values(groups).forEach(g => {
      g.items.sort((a, b) => {
        if (a.assigned_date !== b.assigned_date) return a.assigned_date.localeCompare(b.assigned_date);
        return a.student_name.localeCompare(b.student_name);
      });
    });

    return Object.values(groups).sort((a, b) => a.teacher_name.localeCompare(b.teacher_name));
  }, [items, studentTeacherMap, teacherMap]);

  // Auto-expand all teachers on load
  useEffect(() => {
    setExpandedTeachers(new Set(teacherGroups.map(g => g.teacher_id)));
  }, [teacherGroups.length]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectGroup(teacherId: string) {
    const group = teacherGroups.find(g => g.teacher_id === teacherId);
    if (!group) return;
    const allSelected = group.items.every(i => selectedIds.has(i.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      group.items.forEach(i => {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      });
      return next;
    });
  }

  function selectAllByDate(date: string) {
    const dateItems = items.filter(i => i.assigned_date === date);
    const allSelected = dateItems.every(i => selectedIds.has(i.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      dateItems.forEach(i => {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      });
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const ids = [...selectedIds];
      // Delete in batches of 50
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { error } = await supabase
          .from('homework_assignments')
          .delete()
          .in('id', batch);
        if (error) throw error;
      }

      toast({
        title: '삭제 완료',
        description: `${selectedIds.size}건의 데일리숙제가 삭제되었습니다.`,
      });

      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error deleting homework:', error);
      toast({
        title: '삭제 실패',
        description: error.message || '삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  }

  // Unique dates in items
  const uniqueDates = useMemo(() => {
    return [...new Set(items.map(i => i.assigned_date))].sort();
  }, [items]);

  const DAY_LABELS: Record<number, string> = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };

  function getStatusBadge(status: string, submittedAt: string | null) {
    if (submittedAt && status === 'unchecked') {
      return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs">제출됨</Badge>;
    }
    const info = CHECK_STATUS_LABELS[status] || CHECK_STATUS_LABELS.unchecked;
    return <Badge className={`${info.className} text-xs`}>{info.label}</Badge>;
  }

  const totalChecked = items.filter(i => i.check_status === 'checked').length;
  const totalSubmitted = items.filter(i => i.submitted_at).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          데일리숙제 체크리스트
        </CardTitle>
        
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">시작일</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-36"
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">종료일</span>
            <Input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-36"
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">과목</span>
            <Select value={filterSubject} onValueChange={setFilterSubject}>
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {SUBJECTS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              className="ml-auto"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              선택 삭제 ({selectedIds.size}건)
            </Button>
          )}
        </div>

        {/* Summary stats */}
        {!loading && items.length > 0 && (
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            <span>총 {items.length}건</span>
            <span>·</span>
            <span className="text-green-600">확인완료 {totalChecked}건</span>
            <span>·</span>
            <span className="text-blue-600">제출 {totalSubmitted}건</span>
            <span>·</span>
            <span>미확인 {items.length - totalChecked}건</span>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-muted-foreground">로딩 중...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">해당 기간에 데일리숙제가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {teacherGroups.map(group => {
              const isExpanded = expandedTeachers.has(group.teacher_id);
              const allSelected = group.items.every(i => selectedIds.has(i.id));
              const someSelected = group.items.some(i => selectedIds.has(i.id));
              const groupChecked = group.items.filter(i => i.check_status === 'checked').length;

              return (
                <div key={group.teacher_id} className="border rounded-lg overflow-hidden">
                  {/* Teacher Header */}
                  <div
                    className="flex items-center justify-between p-3 bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => {
                      setExpandedTeachers(prev => {
                        const next = new Set(prev);
                        if (next.has(group.teacher_id)) next.delete(group.teacher_id);
                        else next.add(group.teacher_id);
                        return next;
                      });
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                      <span className="font-medium">{group.teacher_name}</span>
                      <Badge variant="outline" className="text-xs">
                        {groupChecked}/{group.items.length}건 확인
                      </Badge>
                    </div>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => toggleSelectGroup(group.teacher_id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Items grouped by date */}
                  {isExpanded && (
                    <div className="divide-y">
                      {uniqueDates
                        .filter(date => group.items.some(i => i.assigned_date === date))
                        .map(date => {
                          const dateItems = group.items.filter(i => i.assigned_date === date);
                          const d = new Date(date + 'T00:00:00');
                          const dayLabel = DAY_LABELS[d.getDay()] || '';

                          return (
                            <div key={date}>
                              {/* Date sub-header */}
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 text-xs text-muted-foreground">
                                <span className="font-medium">{format(d, 'M/d')} ({dayLabel})</span>
                                <span>· {dateItems.length}명</span>
                              </div>
                              {/* Student rows */}
                              {dateItems.map(item => (
                                <div
                                  key={item.id}
                                  className={`flex items-center gap-3 px-3 py-2 hover:bg-accent/50 transition-colors ${
                                    selectedIds.has(item.id) ? 'bg-destructive/5' : ''
                                  }`}
                                >
                                  <Checkbox
                                    checked={selectedIds.has(item.id)}
                                    onCheckedChange={() => toggleSelect(item.id)}
                                  />
                                  <span className="text-sm font-medium w-20 shrink-0">{item.student_name}</span>
                                  <Badge variant="outline" className="text-xs shrink-0">{item.subject}</Badge>
                                  <span className="text-sm text-muted-foreground truncate flex-1" title={item.content}>
                                    {item.content}
                                  </span>
                                  {getStatusBadge(item.check_status, item.submitted_at)}
                                  {item.submission_image_url && (
                                    <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">📷</Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>데일리숙제 일괄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 <strong>{selectedIds.size}건</strong>의 데일리숙제를 삭제하시겠습니까?
              <br />
              이 작업은 되돌릴 수 없습니다. 학생에게 이미 제출된 숙제도 함께 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  삭제 중...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1" />
                  {selectedIds.size}건 삭제
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
