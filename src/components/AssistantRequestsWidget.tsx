// DASHBOARD-ASSISTANT-REQUESTS-WIDGET-V2
// TEACHER-CANCEL-REQUEST-V1
// REQUESTER-AND-RELATEDTEACHER-V1
// REQUEST-CREATE-STABLE-V2
// REQ-ERROR-VISIBLE-V1
// DASHBOARD-REQUEST-WIDGET-SUBMIT-V3
// ASSIGNEE-SELECT-FIX-DASH-V1
// ASSISTANT-REQUEST-DEDUP-CONSTRAINT-V4
// TEACHER-REQUEST-DETAILS-ATTACH-V1
// COMMENT-MODAL-V1
// REQUEST-MODAL-V1
// REQUEST-REPLIES-V1
import { useState, useEffect, Component, ReactNode, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin, isTeacher } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CalendarIcon, ClipboardCheck, Plus, ChevronRight, Loader2, X, Copy, Check, MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getDueBadgeInfo, cn } from '@/lib/utils';
import { useTaskAttachments } from '@/hooks/useTaskAttachments';
import { TaskAttachmentBadge, TaskAttachmentList, TaskNotesPreview } from '@/components/TaskAttachmentList';

// ErrorBoundary for catching runtime crashes in the widget
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class WidgetErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[DASH_REQ_FAIL] Widget runtime error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="animate-slide-up">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              조교요청
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
              DASH_REQ_RUNTIME_ERROR: {this.state.error?.message || 'Unknown error'}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              다시 시도
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

interface AssistantTask {
  id: string;
  title: string;
  assignee: string;
  status: string;
  priority: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  created_by_role: string | null;
  related_teacher_id: string | null;
  // Joined profile data
  requester_profile?: { full_name: string; email: string } | null;
  related_teacher_profile?: { full_name: string; email: string } | null;
}

// REQUEST-REPLIES-V1: Reply interface
interface TaskReply {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

interface Teacher {
  id: string;
  full_name: string;
}

function AssistantRequestsWidgetInner() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  // UI uses 'unassigned' for 미배정, maps to '미배정' on submit
  const [assignee, setAssignee] = useState('unassigned');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [showForm, setShowForm] = useState(false);
  // UI uses 'none' for empty related teacher, maps to null on submit
  const [relatedTeacher, setRelatedTeacher] = useState<string>('none');
  
  // Admin filters
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherFilter, setTeacherFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  // Expanded notes state (for teachers only)
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  // REQUEST-MODAL-V1: Modal state for viewing full request details
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AssistantTask | null>(null);
  const [copied, setCopied] = useState(false);
  const clickedRowRef = useRef<HTMLDivElement | null>(null);
  
  // REQUEST-REPLIES-V1: Replies state
  const [replies, setReplies] = useState<TaskReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  // Attachment handling (for teachers only)
  const {
    attachmentCounts,
    expandedAttachments,
    loadingAttachments,
    loadAttachmentCounts,
    toggleTaskAttachments
  } = useTaskAttachments();

  const fetchTasks = async () => {
    if (!user) return;
    
    try {
      let query = supabase
        .from('assistant_tasks')
        .select('*')
        .in('status', ['todo', 'doing'])
        .order('created_at', { ascending: false })
        .limit(10);
      
      // Teachers only see their own requests
      if (!isAdmin(role)) {
        query = query.eq('created_by', user.id);
      } else {
        // Admin filters
        if (teacherFilter !== 'all') {
          query = query.eq('created_by', teacherFilter);
        }
        if (assigneeFilter !== 'all') {
          query = query.eq('assignee', assigneeFilter);
        }
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const rawTasks = data || [];
      
      // Collect unique user IDs for profile lookup
      const userIds = new Set<string>();
      rawTasks.forEach((t: any) => {
        if (t.created_by) userIds.add(t.created_by);
        if (t.related_teacher_id) userIds.add(t.related_teacher_id);
      });
      
      // Fetch profiles for all users
      let profilesMap: Record<string, { full_name: string; email: string }> = {};
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', Array.from(userIds));
        
        (profiles || []).forEach((p: any) => {
          profilesMap[p.id] = { full_name: p.full_name, email: p.email };
        });
      }
      
      // Merge profile data into tasks
      const tasksData: AssistantTask[] = rawTasks.map((t: any) => ({
        ...t,
        requester_profile: t.created_by ? profilesMap[t.created_by] || null : null,
        related_teacher_profile: t.related_teacher_id ? profilesMap[t.related_teacher_id] || null : null,
      }));
      
      setTasks(tasksData);

      // Load attachment counts for teacher's own tasks (batch query)
      if (isTeacher(role) && tasksData.length > 0) {
        const taskIds = tasksData.map(t => t.id);
        loadAttachmentCounts(taskIds);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    if (!isAdmin(role)) return;
    
    try {
      // Get teacher user_ids
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'teacher');
      
      if (rolesError) throw rolesError;
      
      const teacherIds = (rolesData || []).map(r => r.user_id);
      if (teacherIds.length === 0) {
        setTeachers([]);
        return;
      }
      
      // Fetch profiles for teacher IDs
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds);
      
      if (profilesError) throw profilesError;
      
      const teacherList = (profilesData || []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name
      }));
      
      setTeachers(teacherList);
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchTeachers();
  }, [user, role]);

  useEffect(() => {
    if (isAdmin(role)) {
      fetchTasks();
    }
  }, [teacherFilter, assigneeFilter]);

  const handleCreateRequest = async () => {
    // ASSISTANT-REQUEST-DEDUP-CONSTRAINT-V4: Prevent double submit
    if (submitting) {
      console.log('[DASH_REQ_DEDUP] Already submitting, ignoring duplicate call');
      return;
    }
    
    // Clear previous error
    setCreateError(null);
    
    // Validate title
    if (!title.trim()) {
      toast({
        title: '제목을 입력해주세요',
        variant: 'destructive'
      });
      return;
    }
    
    // Validate user exists
    if (!user?.id) {
      const errMsg = 'REQUEST_CREATE_ERROR: code=NO_AUTH message=로그인이 필요합니다 details=user.id is missing hint=Please login';
      console.error('[DASH_REQ_FAIL]', { user });
      setCreateError(errMsg);
      return;
    }
    
    // Validate role exists
    if (!role) {
      const errMsg = 'REQUEST_CREATE_ERROR: code=NO_ROLE message=역할 정보가 없습니다 details=role is missing hint=Please re-login';
      console.error('[DASH_REQ_FAIL]', { role });
      setCreateError(errMsg);
      return;
    }
    
    setSubmitting(true);
    
    try {
      // Teachers set related_teacher_id to themselves
      // Admins can optionally select a related teacher (map 'none' to null)
      const relatedTeacherId = isTeacher(role) ? user.id : (relatedTeacher === 'none' ? null : relatedTeacher || null);
      
      // Map UI assignee value to DB value: 'unassigned' => '미배정'
      const dbAssignee = assignee === 'unassigned' ? '미배정' : assignee;
      
      console.log('[DASH_REQ_SUBMIT] Calling RPC create_assistant_task');
      
      // ASSISTANT-REQUEST-DEDUP-CONSTRAINT-V4: Use RPC with manual dedup check
      const { data, error } = await supabase.rpc('create_assistant_task', {
        _title: title.trim(),
        _assignee: dbAssignee || '미배정',
        _due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        _notes: notes.trim() || null,
        _related_teacher_id: relatedTeacherId,
      });
      
      if (error) {
        const errMsg = `REQUEST_CREATE_ERROR: code=${error.code || 'unknown'} message=${error.message} details=${error.details || 'none'} hint=${error.hint || 'none'}`;
        console.error('[DASH_REQ_FAIL]', error);
        setCreateError(errMsg);
        return;
      }
      
      // RPC returns jsonb with { task: {...}, is_new: boolean }
      const result = data as { task: { id: string; assignee: string }; is_new: boolean } | null;
      
      if (result && !result.is_new) {
        // Duplicate detected
        console.log('[DASH_REQ_DEDUP] Duplicate detected, existing row returned');
        toast({
          title: '이미 동일한 요청이 있어요',
          description: '기존 요청을 표시했어요.',
        });
      } else {
        // Success - new row created
        toast({
          title: '요청이 등록되었습니다.',
          description: dbAssignee !== '미배정' ? `${dbAssignee}에게 배정됨` : undefined
        });
      }
      
      // Reset form (stay on dashboard)
      setTitle('');
      setAssignee('unassigned');
      setDueDate(undefined);
      setNotes('');
      setRelatedTeacher('none');
      setShowForm(false);
      setCreateError(null);
      
      // Refresh list
      fetchTasks();
    } catch (error: any) {
      console.error('[DASH_REQ_FAIL]', error);
      const errMsg = `REQUEST_CREATE_ERROR: code=${error?.code || 'runtime_error'} message=${error?.message || '알 수 없는 오류'} details=${error?.details || 'none'} hint=${error?.hint || 'none'}`;
      setCreateError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancellingId(taskId);

    try {
      const { error } = await supabase
        .from('assistant_tasks')
        .update({ status: 'cancelled' })
        .eq('id', taskId)
        .eq('created_by', user?.id);

      if (error) throw error;

      toast({ title: '요청이 취소되었습니다.' });
      fetchTasks();
    } catch (error) {
      console.error('Error cancelling task:', error);
      toast({
        title: '취소 실패',
        description: '다시 시도해주세요.',
        variant: 'destructive'
      });
    } finally {
      setCancellingId(null);
    }
  };

  // DUE-TODAY-END-OF-DAY-KST-V1
  const getDueBadge = (dueDateStr: string | null) => {
    if (!dueDateStr) return null;
    
    const info = getDueBadgeInfo(dueDateStr);
    
    if (info.type === 'overdue') {
      return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-xs">{info.label}</Badge>;
    } else if (info.type === 'today') {
      return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">{info.label}</Badge>;
    } else {
      return <Badge variant="outline" className="text-xs">{info.label}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'doing') {
      return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs">진행중</Badge>;
    }
    return <Badge variant="outline" className="text-xs">대기</Badge>;
  };

  const getAssigneeBadge = (assignee: string) => {
    const colorMap: Record<string, string> = {
      '유빈조교': 'bg-purple-500/15 text-purple-600 border-purple-500/30',
      '다인조교': 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
      '미배정': 'bg-muted text-muted-foreground border-muted'
    };
    return (
      <Badge className={cn(colorMap[assignee] || 'bg-muted text-muted-foreground', 'text-xs')}>
        {assignee}
      </Badge>
    );
  };

  // Check if current user is the owner (can cancel)
  const canCancelTask = (task: AssistantTask) => {
    return isTeacher(role) && task.created_by === user?.id && (task.status === 'todo' || task.status === 'doing');
  };

  // REQUEST-REPLIES-V1: Fetch replies for a task
  const fetchReplies = async (taskId: string) => {
    setRepliesLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_replies')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setReplies(data || []);
    } catch (err) {
      console.error('Error fetching replies:', err);
      setReplies([]);
    } finally {
      setRepliesLoading(false);
    }
  };

  // REQUEST-MODAL-V1: Open detail modal and track clicked row for focus restoration
  const handleRowClick = (task: AssistantTask, rowElement: HTMLDivElement | null) => {
    clickedRowRef.current = rowElement;
    setSelectedTask(task);
    setCopied(false);
    setReplyText('');
    setReplies([]);
    setDetailModalOpen(true);
    // Fetch replies when modal opens
    fetchReplies(task.id);
  };

  // REQUEST-MODAL-V1: Copy full notes text to clipboard
  const handleCopyNotes = async () => {
    if (!selectedTask?.notes) return;
    try {
      await navigator.clipboard.writeText(selectedTask.notes);
      setCopied(true);
      toast({ title: '복사되었습니다' });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: '복사 실패', variant: 'destructive' });
    }
  };

  // REQUEST-REPLIES-V1: Submit a reply
  const handleSubmitReply = async () => {
    if (!selectedTask || !replyText.trim() || !user) return;
    
    setReplySubmitting(true);
    try {
      // Get current user's profile for author_name snapshot
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      
      const { error } = await supabase
        .from('task_replies')
        .insert({
          task_id: selectedTask.id,
          author_id: user.id,
          author_name: profileData?.full_name || user.email || '알 수 없음',
          body: replyText.trim()
        });
      
      if (error) throw error;
      
      toast({ title: '답글이 등록되었습니다.' });
      setReplyText('');
      // Refetch replies
      fetchReplies(selectedTask.id);
    } catch (err: any) {
      console.error('Error submitting reply:', err);
      toast({ 
        title: '답글 등록 실패', 
        description: err?.message || '다시 시도해주세요.',
        variant: 'destructive' 
      });
    } finally {
      setReplySubmitting(false);
    }
  };

  // REQUEST-MODAL-V1: Handle modal close with focus restoration
  const handleModalClose = () => {
    setDetailModalOpen(false);
    setReplies([]);
    setReplyText('');
    // Restore focus to clicked row after modal closes
    setTimeout(() => {
      clickedRowRef.current?.focus();
    }, 0);
  };

  return (
    <Card className="animate-slide-up">
      <CardHeader className="pb-3">
        {/* Marker for deployment confirmation */}
        <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded mb-2">
          TEACHER-REQUEST-DETAILS-ATTACH-V1
        </div>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            조교요청
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(!showForm)}
            >
              <Plus className="w-4 h-4 mr-1" />
              요청 생성
            </Button>
            <a
              href="/assistant-requests"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 px-3"
            >
              전체 보기
              <ChevronRight className="w-4 h-4 ml-1" />
            </a>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Create Form */}
        {showForm && (
          <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
            {/* REQUEST-CREATE-FIX-V1 Error Banner */}
            {createError && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                {createError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">제목 *</Label>
              <Input
                id="title"
                placeholder="요청 제목"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>담당자</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">미배정</SelectItem>
                    <SelectItem value="유빈조교">유빈조교</SelectItem>
                    <SelectItem value="다인조교">다인조교</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>마감일</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dueDate ? format(dueDate, 'MM/dd (EEE)', { locale: ko }) : '선택'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      locale={ko}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            {/* Admin: Related Teacher Dropdown */}
            {isAdmin(role) && (
              <div className="space-y-2">
                <Label>관련 선생님 (선택)</Label>
                <Select value={relatedTeacher} onValueChange={setRelatedTeacher}>
                  <SelectTrigger>
                    <SelectValue placeholder="선택 안함" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    {teachers.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="notes">메모</Label>
              <Textarea
                id="notes"
                placeholder="추가 메모 (선택)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                취소
              </Button>
              <Button size="sm" onClick={handleCreateRequest} disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                등록
              </Button>
            </div>
          </div>
        )}

        {/* Admin Filters */}
        {isAdmin(role) && (
          <div className="flex gap-2 flex-wrap">
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="선생님" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 선생님</SelectItem>
                {teachers.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="담당자" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="유빈조교">유빈조교</SelectItem>
                <SelectItem value="다인조교">다인조교</SelectItem>
                <SelectItem value="미배정">미배정</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Task List */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">
            {isAdmin(role) ? '미완료 요청 (전체)' : '내 미완료 요청'}
          </div>
          
          {loading ? (
            <div className="text-center py-4 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              미완료 요청이 없습니다
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => {
                const isTeacherView = isTeacher(role) && task.created_by === user?.id;
                const attachCount = isTeacherView ? (attachmentCounts[task.id] || 0) : 0;
                const attachments = expandedAttachments[task.id];
                const isNotesExpanded = expandedNotes[task.id] || false;
                const isAttachExpanded = !!attachments;

                return (
                  <div
                    key={task.id}
                    ref={(el) => {
                      // Store ref for focus restoration when this task is selected
                      if (selectedTask?.id === task.id) clickedRowRef.current = el;
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`요청 상세보기: ${task.title}`}
                    className="p-3 bg-secondary/50 rounded-lg hover:bg-secondary/70 transition-colors space-y-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    onClick={(e) => {
                      // Don't open modal if clicking on cancel button or attachment toggles
                      if ((e.target as HTMLElement).closest('button')) return;
                      handleRowClick(task, e.currentTarget);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleRowClick(task, e.currentTarget);
                      }
                    }}
                  >
                    {/* Row 1: Status + Title + "자세히" indicator */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                        {getStatusBadge(task.status)}
                        <span className="font-medium text-foreground truncate">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {/* Cancel button for teachers on their own tasks */}
                        {canCancelTask(task) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleCancel(task.id, e)}
                            disabled={cancellingId === task.id}
                          >
                            {cancellingId === task.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(task, e.currentTarget.closest('[role="button"]') as HTMLDivElement);
                          }}
                        >
                          자세히
                          <ChevronRight className="w-3 h-3 ml-0.5" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Row 2: Assignee + Due + Time + Attachments badge (for teacher) */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {getAssigneeBadge(task.assignee)}
                      {getDueBadge(task.due_date)}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(task.created_at), 'MM/dd HH:mm')}
                      </span>
                      {isTeacherView && (
                        <TaskAttachmentBadge
                          count={attachCount}
                          expanded={isAttachExpanded}
                          loading={loadingAttachments[task.id] || false}
                          onToggle={() => toggleTaskAttachments(task.id)}
                        />
                      )}
                    </div>
                    
                    {/* Row 3: Notes preview (truncated 2-3 lines) */}
                    {task.notes && (
                      <div className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                        {task.notes}
                      </div>
                    )}
                    
                    {/* Row 4: Requester and Related Teacher Info (Admin view) */}
                    {isAdmin(role) && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="font-medium">
                          요청자: {task.requester_profile?.full_name || task.created_by_role || '알 수 없음'}
                          {task.created_by_role && <span className="text-muted-foreground"> ({task.created_by_role})</span>}
                        </span>
                        <span className="text-muted-foreground">
                          관련 선생님: {task.related_teacher_profile?.full_name || '미지정'}
                        </span>
                      </div>
                    )}
                    
                    {/* Row 5: Expanded attachments list (for teacher) */}
                    {isTeacherView && attachments && attachments.length > 0 && (
                      <TaskAttachmentList attachments={attachments} className="mt-2" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* REQUEST-MODAL-V1: Detail modal for viewing full request content with replies */}
        <Dialog open={detailModalOpen} onOpenChange={(open) => {
          if (!open) handleModalClose();
        }}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            {/* REQUEST-MODAL-V1 marker */}
            <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded mb-2">
              REQUEST-MODAL-V1
            </div>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8">
                <MessageSquare className="w-5 h-5 text-primary" />
                <span className="truncate">{selectedTask?.title}</span>
              </DialogTitle>
              <DialogDescription className="sr-only">
                요청 상세 내용
              </DialogDescription>
            </DialogHeader>
            
            {selectedTask && (
              <ScrollArea className="flex-1 max-h-[60vh]">
                <div className="space-y-4 pr-4">
                  {/* Status badges row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(selectedTask.status)}
                    {getAssigneeBadge(selectedTask.assignee)}
                    {getDueBadge(selectedTask.due_date)}
                  </div>
                  
                  {/* Metadata section */}
                  <div className="grid grid-cols-2 gap-3 text-sm border rounded-lg p-3 bg-muted/30">
                    <div>
                      <span className="text-muted-foreground">작성자:</span>
                      <span className="ml-1 font-medium">
                        {selectedTask.requester_profile?.full_name || selectedTask.created_by_role || '알 수 없음'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">수신자:</span>
                      <span className="ml-1 font-medium">
                        {selectedTask.related_teacher_profile?.full_name || selectedTask.assignee || '미지정'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">작성일시:</span>
                      <span className="ml-1 font-medium">
                        {format(new Date(selectedTask.created_at), 'yyyy년 M월 d일 HH:mm', { locale: ko })}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">상태:</span>
                      <span className="ml-1 font-medium">
                        {selectedTask.status === 'doing' ? '진행중' : selectedTask.status === 'done' ? '완료' : selectedTask.status === 'cancelled' ? '취소됨' : '대기'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Full content section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-muted-foreground">내용</Label>
                      {selectedTask.notes && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={handleCopyNotes}
                        >
                          {copied ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              복사됨
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 mr-1" />
                              복사
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="p-3 border rounded-lg bg-background min-h-[80px]">
                      {selectedTask.notes ? (
                        <p className="text-sm whitespace-pre-wrap break-words">{selectedTask.notes}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">내용 없음</p>
                      )}
                    </div>
                  </div>
                  
                  {/* REQUEST-REPLIES-V1: Replies section */}
                  <div className="space-y-3 pt-2 border-t">
                    <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded">
                      REQUEST-REPLIES-V1
                    </div>
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      답글 ({replies.length})
                    </Label>
                    
                    {/* Replies list */}
                    {repliesLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : replies.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic py-2">아직 답글이 없습니다.</p>
                    ) : (
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                        {replies.map((reply) => (
                          <div key={reply.id} className="p-2 border rounded-lg bg-secondary/30">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                              <span className="font-medium text-foreground">{reply.author_name || '알 수 없음'}</span>
                              <span>{format(new Date(reply.created_at), 'MM/dd HH:mm')}</span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap break-words">{reply.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Reply input */}
                    <div className="space-y-2">
                      <Textarea
                        placeholder="답글을 입력하세요..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="min-h-[60px] text-sm"
                        disabled={replySubmitting}
                      />
                      <div className="flex justify-end">
                        <Button 
                          size="sm" 
                          onClick={handleSubmitReply}
                          disabled={!replyText.trim() || replySubmitting}
                        >
                          {replySubmitting ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4 mr-1" />
                          )}
                          답글 등록
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}
            
            <div className="flex justify-end pt-2 border-t">
              <DialogClose asChild>
                <Button variant="outline" size="sm">
                  닫기
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Export wrapped in ErrorBoundary to prevent white screen
export function AssistantRequestsWidget() {
  return (
    <WidgetErrorBoundary>
      <AssistantRequestsWidgetInner />
    </WidgetErrorBoundary>
  );
}
