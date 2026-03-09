// DAILY-HW-CHECKLIST-V2: Comprehensive daily homework management with views
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck, Trash2, Loader2, ChevronDown, Calendar, Image, Clock, Users, MessageSquare, CheckCircle2, RotateCcw, Send, ArrowRight, Mic } from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import DailyHomeworkManager from '@/components/DailyHomeworkManager';
import SubmissionImageCarousel from '@/components/lessons/SubmissionImageCarousel';
import { isAdmin as checkIsAdmin, isTeacher as checkIsTeacher } from '@/lib/auth';

const SUBJECTS = ['수학', '영어', '국어', '과학'] as const;

interface DailyHomeworkItem {
  id: string;
  student_id: string;
  student_name: string;
  student_grade: string | null;
  subject: string;
  content: string;
  assigned_date: string;
  end_date: string | null;
  required_submissions: number;
  check_status: string;
  result: string | null;
  checked_at: string | null;
  submitted_at: string | null;
  submission_image_url: string | null;
  submission_audio_url: string | null;
  submission_count: number;
  teacher_id: string;
  teacher_name: string;
}

interface SubmissionInfo {
  homework_id: string;
  submitted_at: string;
  image_url: string | null;
}

const CHECK_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  unchecked: { label: '미확인', className: 'bg-muted text-muted-foreground' },
  checked: { label: '확인완료', className: 'bg-green-500/15 text-green-600 border-green-500/30' },
  submitted: { label: '제출됨', className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  resubmit: { label: '재제출', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
};

const DAY_LABELS: Record<number, string> = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' };

export default function DailyHomeworkChecklist() {
  const { user, role } = useAuth();
  const { toast } = useToast();

  const mondayOfWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const sundayOfWeek = format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), 'yyyy-MM-dd');

  const [startDate, setStartDate] = useState(mondayOfWeek);
  const [endDate, setEndDate] = useState(sundayOfWeek);
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DailyHomeworkItem[]>([]);
  const [submissionMap, setSubmissionMap] = useState<Record<string, SubmissionInfo[]>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewMode, setViewMode] = useState<'teacher' | 'calendar' | 'grade'>('teacher');
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [imageViewItem, setImageViewItem] = useState<DailyHomeworkItem | null>(null);
  const [reviewingItem, setReviewingItem] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [carryForwardLoading, setCarryForwardLoading] = useState<string | null>(null);
  const isAdmin = checkIsAdmin(role);
  const isTeacher = checkIsTeacher(role);

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
          id, student_id, subject, content, assigned_date, end_date, required_submissions,
          check_status, result, checked_at, submitted_at, submission_image_url, submission_audio_url,
          created_by,
          students:student_id (name, grade)
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

      // Fetch submission counts from homework_submissions
      const hwIds = (hwData || []).map((h: any) => h.id);
      let submissions: SubmissionInfo[] = [];
      if (hwIds.length > 0) {
        // Batch fetch in chunks of 100
        for (let i = 0; i < hwIds.length; i += 100) {
          const batch = hwIds.slice(i, i + 100);
          const { data: subData } = await supabase
            .from('homework_submissions')
            .select('homework_id, submitted_at, image_url')
            .in('homework_id', batch)
            .order('submitted_at', { ascending: true });
          if (subData) submissions.push(...subData as SubmissionInfo[]);
        }
      }

      // Build submission map
      const subMap: Record<string, SubmissionInfo[]> = {};
      submissions.forEach(s => {
        if (!subMap[s.homework_id]) subMap[s.homework_id] = [];
        subMap[s.homework_id].push(s);
      });
      setSubmissionMap(subMap);

      // Use created_by from homework_assignments for teacher attribution
      const creatorIds = new Set<string>();
      (hwData || []).forEach((h: any) => {
        if (h.created_by) creatorIds.add(h.created_by);
      });

      // Fallback: also fetch student_subject_teachers for items without created_by
      const studentIds = [...new Set((hwData || []).map((h: any) => h.student_id))];
      const stMap: Record<string, string> = {};
      const teacherIds = new Set<string>([...creatorIds]);

      if (studentIds.length > 0) {
        const subjects = filterSubject !== 'all'
          ? [filterSubject]
          : [...new Set((hwData || []).map((h: any) => h.subject))];

        let mappingQuery = supabase
          .from('student_subject_teachers')
          .select('student_id, teacher_id, subject')
          .in('student_id', studentIds)
          .in('subject', subjects);

        if (isTeacher && user?.id) {
          mappingQuery = mappingQuery.eq('teacher_id', user.id);
        }

        const { data: mappings } = await mappingQuery;
        (mappings || []).forEach((m: any) => {
          if (!stMap[m.student_id]) stMap[m.student_id] = m.teacher_id;
          teacherIds.add(m.teacher_id);
        });
      }

      // Fetch teacher names
      const tMap: Record<string, string> = {};
      if (teacherIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', [...teacherIds]);
        (profiles || []).forEach((p: any) => {
          tMap[p.id] = p.full_name || '알 수 없음';
        });
      }

      setTeachers([...teacherIds].map(id => ({ id, name: tMap[id] || '알 수 없음' })).sort((a, b) => a.name.localeCompare(b.name)));

      const formatted: DailyHomeworkItem[] = (hwData || []).map((h: any) => {
        // Prioritize created_by over student_subject_teachers mapping
        const teacherId = h.created_by || stMap[h.student_id] || 'unassigned';
        return {
          id: h.id,
          student_id: h.student_id,
          student_name: h.students?.name || '알 수 없음',
          student_grade: h.students?.grade || null,
          subject: h.subject,
          content: h.content,
          assigned_date: h.assigned_date,
          end_date: h.end_date,
          required_submissions: h.required_submissions || 1,
          check_status: h.check_status,
          result: h.result,
          checked_at: h.checked_at,
          submitted_at: h.submitted_at,
          submission_image_url: h.submission_image_url,
          submission_audio_url: h.submission_audio_url || null,
          submission_count: (subMap[h.id] || []).length + (h.submission_image_url ? 1 : 0),
          teacher_id: teacherId,
          teacher_name: teacherId === 'unassigned' ? '미배정' : (tMap[teacherId] || '알 수 없음'),
        };
      });

      setItems(formatted);
    } catch (error) {
      console.error('Error fetching daily homework:', error);
      toast({ title: '데이터 로드 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  // Filtering
  const filteredItems = useMemo(() => {
    let result = items;
    if (filterTeacher !== 'all') result = result.filter(i => i.teacher_id === filterTeacher);
    if (filterGrade !== 'all') result = result.filter(i => (i.student_grade || '미지정') === filterGrade);
    if (filterStatus === 'submitted') result = result.filter(i => i.submitted_at || i.submission_count > 0);
    if (filterStatus === 'unchecked') result = result.filter(i => i.check_status === 'unchecked' && !i.submitted_at);
    if (filterStatus === 'checked') result = result.filter(i => i.check_status === 'checked');
    if (filterStatus === 'resubmit') result = result.filter(i => i.check_status === 'resubmit');
    return result;
  }, [items, filterTeacher, filterGrade, filterStatus]);

  // Available grades
  const grades = useMemo(() => {
    const gs = new Set(items.map(i => i.student_grade || '미지정'));
    return [...gs].sort();
  }, [items]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredItems.length;
    const checked = filteredItems.filter(i => i.check_status === 'checked').length;
    const submitted = filteredItems.filter(i => i.submitted_at || i.submission_count > 0).length;
    const withPhotos = filteredItems.filter(i => i.submission_count > 0).length;
    return { total, checked, submitted, withPhotos };
  }, [filteredItems]);

  // Unique dates
  const uniqueDates = useMemo(() => [...new Set(filteredItems.map(i => i.assigned_date))].sort(), [filteredItems]);

  // Auto expand
  useEffect(() => {
    if (viewMode === 'teacher') {
      const tIds = new Set(filteredItems.map(i => i.teacher_id));
      setExpandedSections(tIds);
    } else if (viewMode === 'grade') {
      setExpandedSections(new Set(grades));
    } else {
      setExpandedSections(new Set(uniqueDates));
    }
  }, [filteredItems.length, viewMode]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    const allSelected = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => { if (allSelected) next.delete(id); else next.add(id); });
      return next;
    });
  }

  function toggleSection(key: string) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const ids = [...selectedIds];
      let totalDeleted = 0;
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { data, error } = await supabase
          .from('homework_assignments')
          .delete()
          .in('id', batch)
          .select('id');
        if (error) throw error;
        totalDeleted += (data?.length || 0);
      }
      if (totalDeleted === 0) {
        toast({ title: '삭제 실패', description: '권한이 없어 삭제되지 않았습니다. 관리자에게 문의하세요.', variant: 'destructive' });
      } else if (totalDeleted < ids.length) {
        toast({ title: '일부 삭제됨', description: `${ids.length}건 중 ${totalDeleted}건만 삭제됨 (권한 부족)`, variant: 'destructive' });
      } else {
        toast({ title: '삭제 완료', description: `${totalDeleted}건 삭제됨` });
      }
      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: '삭제 실패', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleReview(itemId: string, status: 'checked' | 'resubmit', comment?: string) {
    setReviewLoading(true);
    try {
      const updateData: any = {
        check_status: status,
        checked_by: user?.id,
        checked_at: new Date().toISOString(),
      };
      if (comment) updateData.result = comment;

      const { error } = await supabase
        .from('homework_assignments')
        .update(updateData)
        .eq('id', itemId);

      if (error) throw error;

      toast({
        title: status === 'checked' ? '확인완료 처리됨' : '재제출 요청됨',
        description: comment ? `코멘트: ${comment}` : undefined,
      });

      setReviewingItem(null);
      setReviewComment('');
      fetchData();
    } catch (error: any) {
      toast({ title: '처리 실패', description: error.message, variant: 'destructive' });
    } finally {
      setReviewLoading(false);
    }
  }

  function getStatusBadge(item: DailyHomeworkItem) {
    if (item.check_status === 'checked') {
      return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">확인완료</Badge>;
    }
    if (item.check_status === 'resubmit') {
      return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">재제출</Badge>;
    }
    if (item.submitted_at || item.submission_count > 0) {
      return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs">제출됨</Badge>;
    }
    return <Badge className="bg-muted text-muted-foreground text-xs">미확인</Badge>;
  }

  function renderReviewActions(item: DailyHomeworkItem) {
    if (!isAdmin && !isTeacher) return null;
    const isOpen = reviewingItem === item.id;

    return (
      <Popover open={isOpen} onOpenChange={(open) => {
        if (open) { setReviewingItem(item.id); setReviewComment(''); }
        else { setReviewingItem(null); setReviewComment(''); }
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="end" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-2">
            <p className="text-xs font-medium">{item.student_name} - 평가</p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs flex-1 gap-1 text-green-600 border-green-500/30 hover:bg-green-500/10"
                disabled={reviewLoading}
                onClick={() => handleReview(item.id, 'checked')}
              >
                <CheckCircle2 className="w-3 h-3" />
                확인완료
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs flex-1 gap-1 text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                disabled={reviewLoading}
                onClick={() => handleReview(item.id, 'resubmit')}
              >
                <RotateCcw className="w-3 h-3" />
                재제출
              </Button>
            </div>
            <div className="space-y-1">
              <Textarea
                placeholder="코멘트 입력 (선택)"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={2}
                className="text-xs min-h-[50px]"
              />
              {reviewComment.trim() && (
                <Button
                  size="sm"
                  className="w-full h-7 text-xs gap-1"
                  disabled={reviewLoading}
                  onClick={() => handleReview(item.id, 'checked', reviewComment.trim())}
                >
                  {reviewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  코멘트와 함께 확인완료
                </Button>
              )}
            </div>
            {item.result && (
              <p className="text-[10px] text-muted-foreground border-t pt-1 mt-1">
                이전 코멘트: {item.result}
              </p>
            )}
            {/* HOMEWORK-CARRY-FORWARD-V1 */}
            <div className="border-t pt-2 mt-1">
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                disabled={carryForwardLoading === item.id}
                onClick={async (e) => {
                  e.stopPropagation();
                  setCarryForwardLoading(item.id);
                  try {
                    // Get next class date for this student+subject
                    // For simplicity, use tomorrow's date as assigned_date
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const nextDate = format(tomorrow, 'yyyy-MM-dd');
                    
                    const { error } = await supabase
                      .from('homework_assignments')
                      .insert({
                        student_id: item.student_id,
                        subject: item.subject as any,
                        content: item.content,
                        assigned_date: nextDate,
                        homework_type: 'daily',
                        required_submissions: item.required_submissions,
                        created_by: user?.id,
                      });
                    if (error) throw error;
                    
                    // Mark current as checked with note
                    await supabase
                      .from('homework_assignments')
                      .update({
                        check_status: 'checked',
                        checked_by: user?.id,
                        checked_at: new Date().toISOString(),
                        result: '다음시간 검사예정으로 이월',
                      })
                      .eq('id', item.id);
                    
                    toast({ title: '다음시간으로 이월됨', description: `${item.student_name} - ${item.content}` });
                    setReviewingItem(null);
                    fetchData();
                  } catch (err: any) {
                    toast({ title: '이월 실패', description: err.message, variant: 'destructive' });
                  } finally {
                    setCarryForwardLoading(null);
                  }
                }}
              >
                {carryForwardLoading === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                다음시간 검사예정
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  function renderSubmissionDetail(item: DailyHomeworkItem) {
    const subs = submissionMap[item.id] || [];
    const totalImages = subs.filter(s => s.image_url).length + (item.submission_image_url ? 1 : 0);
    const latestSub = subs.length > 0 ? subs[subs.length - 1] : null;
    const submittedTime = item.submitted_at || latestSub?.submitted_at;

    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {totalImages > 0 && (
          <button
            type="button"
            className="flex items-center gap-0.5 text-blue-600 hover:underline cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setImageViewItem(item); }}
          >
            <Image className="w-3 h-3" />
            {totalImages}장
          </button>
        )}
        {item.submission_audio_url && (
          <button
            type="button"
            className="flex items-center gap-0.5 text-purple-600 hover:underline cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setImageViewItem(item); }}
          >
            <Mic className="w-3 h-3" />
            음성
          </button>
        )}
        {item.required_submissions > 1 && (
          <span className={`${item.submission_count >= item.required_submissions ? 'text-green-600' : 'text-amber-600'}`}>
            인증 {item.submission_count}/{item.required_submissions}
          </span>
        )}
        {submittedTime && (
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {format(new Date(submittedTime), 'M/d HH:mm')}
          </span>
        )}
      </div>
    );
  }

  function renderItemRow(item: DailyHomeworkItem, showDate = false, showTeacher = false, showGrade = false) {
    return (
      <div
        key={item.id}
        className={`flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors text-sm ${
          selectedIds.has(item.id) ? 'bg-destructive/5' : ''
        }`}
      >
        <Checkbox
          checked={selectedIds.has(item.id)}
          onCheckedChange={() => toggleSelect(item.id)}
        />
        {showDate && (
          <span className="text-xs text-muted-foreground w-14 shrink-0">
            {format(new Date(item.assigned_date + 'T00:00:00'), 'M/d')}
          </span>
        )}
        <span className="font-medium w-16 shrink-0 truncate">{item.student_name}</span>
        {showGrade && item.student_grade && (
          <Badge variant="outline" className="text-[10px] shrink-0">{item.student_grade}</Badge>
        )}
        {showTeacher && (
          <span className="text-xs text-muted-foreground w-14 shrink-0 truncate">{item.teacher_name}</span>
        )}
        <Badge variant="outline" className="text-xs shrink-0">{item.subject}</Badge>
        <span className="text-muted-foreground truncate flex-1 text-xs" title={item.content}>
          {item.content}
        </span>
        {item.result && (
          <span className="text-[10px] text-amber-600 shrink-0 max-w-20 truncate" title={item.result}>
            💬 {item.result}
          </span>
        )}
        {item.end_date && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            ~{format(new Date(item.end_date + 'T00:00:00'), 'M/d')}
          </span>
        )}
        <div className="shrink-0">{renderSubmissionDetail(item)}</div>
        <div className="shrink-0">{getStatusBadge(item)}</div>
        <div className="shrink-0">{renderReviewActions(item)}</div>
      </div>
    );
  }

  function renderGroupedView(
    groupKey: (item: DailyHomeworkItem) => string,
    groupLabel: (key: string) => string,
    sortGroups: (keys: string[]) => string[],
    showDate: boolean,
    showTeacher: boolean,
    showGrade: boolean,
  ) {
    const groups: Record<string, DailyHomeworkItem[]> = {};
    filteredItems.forEach(item => {
      const key = groupKey(item);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const sortedKeys = sortGroups(Object.keys(groups));

    return (
      <div className="space-y-2">
        {sortedKeys.map(key => {
          const groupItems = groups[key];
          const isExpanded = expandedSections.has(key);
          const allSelected = groupItems.every(i => selectedIds.has(i.id));
          const checkedCount = groupItems.filter(i => i.check_status === 'checked').length;
          const submittedCount = groupItems.filter(i => i.submitted_at || i.submission_count > 0).length;

          return (
            <div key={key} className="border rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-between p-2.5 bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                onClick={() => toggleSection(key)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                  <span className="font-medium text-sm">{groupLabel(key)}</span>
                  <span className="text-xs text-muted-foreground">
                    {groupItems.length}건
                  </span>
                  {checkedCount > 0 && (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
                      확인 {checkedCount}
                    </Badge>
                  )}
                  {submittedCount > 0 && (
                    <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px]">
                      제출 {submittedCount}
                    </Badge>
                  )}
                </div>
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => toggleSelectAll(groupItems.map(i => i.id))}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {isExpanded && (
                <div className="divide-y divide-border/50">
                  {groupItems.map(item => renderItemRow(item, showDate, showTeacher, showGrade))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            데일리숙제 관리
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">기간별 데일리숙제 현황 · 제출 · 인증 관리</p>
        </div>
        {(isAdmin || isTeacher) && <DailyHomeworkManager />}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">시작일</span>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-32 text-sm" />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">종료일</span>
              <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-32 text-sm" />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">과목</span>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(isAdmin) && teachers.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">선생님</span>
                <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                  <SelectTrigger className="h-8 w-28 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {grades.length > 1 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">학년</span>
                <Select value={filterGrade} onValueChange={setFilterGrade}>
                  <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">상태</span>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="submitted">제출됨</SelectItem>
                  <SelectItem value="unchecked">미제출</SelectItem>
                  <SelectItem value="checked">확인완료</SelectItem>
                  <SelectItem value="resubmit">재제출</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} className="ml-auto h-8">
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {selectedIds.size}건 삭제
              </Button>
            )}
          </div>

          {/* Stats bar */}
          {!loading && stats.total > 0 && (
            <div className="flex gap-4 mt-3 text-xs">
              <span className="text-muted-foreground">총 <strong>{stats.total}</strong>건</span>
              <span className="text-green-600">확인완료 <strong>{stats.checked}</strong></span>
              <span className="text-blue-600">제출 <strong>{stats.submitted}</strong></span>
              <span className="text-amber-600">사진 <strong>{stats.withPhotos}</strong>건</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View tabs + content */}
      <Card>
        <CardHeader className="pb-2 pt-3">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <TabsList className="grid w-full grid-cols-3 max-w-xs">
              <TabsTrigger value="teacher" className="text-xs">선생님별</TabsTrigger>
              <TabsTrigger value="calendar" className="text-xs">날짜별</TabsTrigger>
              <TabsTrigger value="grade" className="text-xs">학년별</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-muted-foreground">로딩 중...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">해당 조건에 맞는 데일리숙제가 없습니다.</p>
            </div>
          ) : viewMode === 'teacher' ? (
            renderGroupedView(
              (item) => item.teacher_id,
              (key) => {
                const t = teachers.find(t => t.id === key);
                return t ? t.name : (key === 'unassigned' ? '미배정' : key);
              },
              (keys) => keys.sort((a, b) => {
                const nameA = teachers.find(t => t.id === a)?.name || '';
                const nameB = teachers.find(t => t.id === b)?.name || '';
                return nameA.localeCompare(nameB);
              }),
              true, false, true,
            )
          ) : viewMode === 'calendar' ? (
            renderGroupedView(
              (item) => item.assigned_date,
              (key) => {
                const d = new Date(key + 'T00:00:00');
                return `${format(d, 'M/d')} (${DAY_LABELS[d.getDay()] || ''})`;
              },
              (keys) => keys.sort(),
              false, true, true,
            )
          ) : (
            renderGroupedView(
              (item) => item.student_grade || '미지정',
              (key) => key,
              (keys) => keys.sort(),
              true, true, false,
            )
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>데일리숙제 일괄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 <strong>{selectedIds.size}건</strong>의 데일리숙제를 삭제하시겠습니까?
              <br />이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />삭제 중...</> : <><Trash2 className="w-4 h-4 mr-1" />{selectedIds.size}건 삭제</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image View Dialog */}
      <Dialog open={!!imageViewItem} onOpenChange={(open) => { if (!open) setImageViewItem(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {imageViewItem?.student_name} - {imageViewItem?.subject} 제출 사진
            </DialogTitle>
          </DialogHeader>
          {imageViewItem && (
            <ImageViewContent item={imageViewItem} submissionMap={submissionMap} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Sub-component to collect and display all images for a homework item */
function ImageViewContent({ item, submissionMap }: { item: DailyHomeworkItem; submissionMap: Record<string, SubmissionInfo[]> }) {
  const subs = submissionMap[item.id] || [];
  const allImages: string[] = [];

  // Collect images from homework_submissions
  subs.forEach(s => {
    if (s.image_url) {
      s.image_url.split(',').forEach(url => {
        const trimmed = url.trim();
        if (trimmed) allImages.push(trimmed);
      });
    }
  });

  // Also check inline submission_image_url from homework_assignments
  if (item.submission_image_url) {
    item.submission_image_url.split(',').forEach(url => {
      const trimmed = url.trim();
      if (trimmed && !allImages.includes(trimmed)) allImages.push(trimmed);
    });
  }

  const hasAudio = !!item.submission_audio_url;
  const hasContent = allImages.length > 0 || hasAudio;

  if (!hasContent) {
    return <p className="text-sm text-muted-foreground text-center py-4">표시할 제출물이 없습니다.</p>;
  }

  const latestSub = subs.length > 0 ? subs[subs.length - 1] : null;

  return (
    <div className="space-y-4">
      {/* Audio player */}
      {hasAudio && (
        <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
          <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-2 flex items-center gap-1">
            🎤 음성 제출
          </p>
          <audio controls className="w-full" src={item.submission_audio_url!}>
            브라우저에서 오디오를 지원하지 않습니다.
          </audio>
        </div>
      )}
      {/* Images */}
      {allImages.length > 0 && (
        <SubmissionImageCarousel
          images={allImages}
          submittedAt={item.submitted_at || latestSub?.submitted_at}
        />
      )}
    </div>
  );
}
