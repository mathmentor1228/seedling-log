// TEACHER-ASSISTANT-REQUESTS-V2
// TEACHER-CANCEL-REQUEST-V1
// REQUESTER-AND-RELATEDTEACHER-V1
// REQUEST-CREATE-STABLE-V2
// REQ-ERROR-VISIBLE-V1
// ASSISTANT-REQUEST-DEDUP-CONSTRAINT-V4
// TEACHER-REQUEST-DETAILS-ATTACH-V1
// TEACHER-REQUEST-DETAIL-MODAL-V1
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarIcon, ClipboardCheck, Plus, Loader2, X, Copy, Check, MessageSquare, Send, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getDueBadgeInfo, cn } from '@/lib/utils';
import { useTaskAttachments } from '@/hooks/useTaskAttachments';
import { TaskAttachmentBadge, TaskAttachmentList, TaskNotesPreview } from '@/components/TaskAttachmentList';

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
}

interface TaskReply {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export function TeacherAssistantRequestsView() {
  const { user, role } = useAuth();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('미배정');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Tab filter
  const [statusFilter, setStatusFilter] = useState<string>('active');

  // Expanded notes state (separate from attachment expansion)
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  // Detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AssistantTask | null>(null);
  const [copied, setCopied] = useState(false);
  const clickedRowRef = useRef<HTMLDivElement | null>(null);

  // Replies state
  const [replies, setReplies] = useState<TaskReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  // Attachment handling
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
      const { data, error } = await supabase
        .from('assistant_tasks')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const taskData = data || [];
      setTasks(taskData);

      // Load attachment counts for all tasks in batch
      if (taskData.length > 0) {
        const taskIds = taskData.map(t => t.id);
        loadAttachmentCounts(taskIds);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [user]);

  const handleSubmit = async () => {
    // ASSISTANT-REQUEST-DEDUP-CONSTRAINT-V4: Prevent double submit
    if (submitting) {
      console.log('[TEACHER_REQ_DEDUP] Already submitting, ignoring duplicate call');
      return;
    }
    
    setCreateError(null);
    
    if (!title.trim()) {
      toast({
        title: '제목을 입력하세요',
        variant: 'destructive'
      });
      return;
    }

    if (!user?.id) {
      setCreateError('REQUEST_CREATE_ERROR: 로그인이 필요합니다');
      return;
    }

    setSubmitting(true);

    try {
      console.log('[TEACHER_REQ_SUBMIT] Calling RPC create_assistant_task');
      
      // ASSISTANT-REQUEST-DEDUP-CONSTRAINT-V4: Use RPC with manual dedup check
      const { data, error } = await supabase.rpc('create_assistant_task', {
        _title: title.trim(),
        _assignee: assignee || '미배정',
        _due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        _notes: notes.trim() || null,
        _related_teacher_id: user.id,
      });

      if (error) {
        const errMsg = `REQUEST_CREATE_ERROR: code=${error.code || 'unknown'} message=${error.message} details=${error.details || 'none'} hint=${error.hint || 'none'}`;
        console.error('[TEACHER_REQ_FAIL]', error);
        setCreateError(errMsg);
        return;
      }

      // RPC returns jsonb with { task: {...}, is_new: boolean }
      const result = data as { task: { id: string; assignee: string }; is_new: boolean } | null;
      
      if (result && !result.is_new) {
        // Duplicate detected
        console.log('[TEACHER_REQ_DEDUP] Duplicate detected, existing row returned');
        toast({
          title: '이미 동일한 요청이 있어요',
          description: '기존 요청을 표시했어요.',
        });
      } else {
        // Success - new row created
        toast({
          title: '요청이 등록되었습니다.',
          description: assignee !== '미배정' ? `${assignee}에게 배정됨` : undefined
        });
      }

      // Reset form
      setTitle('');
      setAssignee('미배정');
      setDueDate(undefined);
      setNotes('');
      setShowForm(false);
      setCreateError(null);

      fetchTasks();
    } catch (error: any) {
      console.error('[TEACHER_REQ_FAIL]', error);
      const errMsg = `REQUEST_CREATE_ERROR: code=${error?.code || 'unknown'} message=${error?.message || '알 수 없는 오류'} details=${error?.details || 'none'} hint=${error?.hint || 'none'}`;
      setCreateError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (taskId: string) => {
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

  // Fetch replies for a task
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

  const handleRowClick = (task: AssistantTask, rowElement: HTMLDivElement | null) => {
    clickedRowRef.current = rowElement;
    setSelectedTask(task);
    setCopied(false);
    setReplyText('');
    setReplies([]);
    setDetailModalOpen(true);
    fetchReplies(task.id);
  };

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

  const handleSubmitReply = async () => {
    if (!selectedTask || !replyText.trim() || !user) return;
    setReplySubmitting(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      const { error } = await supabase.from('task_replies').insert({
        task_id: selectedTask.id,
        author_id: user.id,
        author_name: profile?.full_name || user.email || '알 수 없음',
        body: replyText.trim(),
      });
      if (error) throw error;
      toast({ title: '답글이 등록되었습니다' });
      setReplyText('');
      fetchReplies(selectedTask.id);
    } catch (err) {
      console.error('Error submitting reply:', err);
      toast({ title: '답글 등록 실패', variant: 'destructive' });
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleModalClose = () => {
    setDetailModalOpen(false);
    setSelectedTask(null);
    setReplies([]);
    setReplyText('');
    setTimeout(() => clickedRowRef.current?.focus(), 50);
  };

  const filteredTasks = tasks.filter(task => {
    if (statusFilter === 'active') return task.status === 'todo' || task.status === 'doing';
    if (statusFilter === 'done') return task.status === 'done';
    if (statusFilter === 'cancelled') return task.status === 'cancelled';
    return true;
  });

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
    switch (status) {
      case 'doing':
        return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-xs">진행중</Badge>;
      case 'done':
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">완료</Badge>;
      case 'cancelled':
        return <Badge className="bg-muted text-muted-foreground border-muted text-xs">취소됨</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">대기</Badge>;
    }
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

  return (
    <div className="space-y-6">
      {/* Marker for deployment confirmation */}
      <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded">
        TEACHER-REQUEST-DETAILS-ATTACH-V1
      </div>

      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">조교 요청</h1>
          <p className="text-muted-foreground">조교에게 업무를 요청하고 진행 상황을 확인합니다</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>내 요청 관리</CardTitle>
            <Button
              variant={showForm ? 'secondary' : 'default'}
              size="sm"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? '취소' : <><Plus className="w-4 h-4 mr-1" /> 새 요청</>}
            </Button>
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
                      <SelectItem value="미배정">미배정</SelectItem>
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
                  닫기
                </Button>
                <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  등록
                </Button>
              </div>
            </div>
          )}

          {/* Tabs for filtering */}
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="active">미완료</TabsTrigger>
              <TabsTrigger value="done">완료</TabsTrigger>
              <TabsTrigger value="cancelled">취소됨</TabsTrigger>
            </TabsList>

            <TabsContent value={statusFilter} className="mt-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {statusFilter === 'active' && '미완료 요청이 없습니다'}
                  {statusFilter === 'done' && '완료된 요청이 없습니다'}
                  {statusFilter === 'cancelled' && '취소된 요청이 없습니다'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTasks.map((task) => {
                    const attachCount = attachmentCounts[task.id] || 0;
                    const attachments = expandedAttachments[task.id];
                    const isNotesExpanded = expandedNotes[task.id] || false;
                    const isAttachExpanded = !!attachments;
                    
                    return (
                      <div
                        key={task.id}
                        ref={(el) => {
                          if (selectedTask?.id === task.id) clickedRowRef.current = el;
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`요청 상세보기: ${task.title}`}
                        className="p-3 bg-secondary/50 rounded-lg hover:bg-secondary/70 transition-colors space-y-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        onClick={(e) => {
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
                        {/* Row 1: Status + Title */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                            {getStatusBadge(task.status)}
                            <span className="font-medium text-foreground truncate">{task.title}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {(task.status === 'todo' || task.status === 'doing') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); handleCancel(task.id); }}
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
                        
                        {/* Row 2: Assignee + Due + Time + Attachments badge */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {getAssigneeBadge(task.assignee)}
                          {getDueBadge(task.due_date)}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(task.created_at), 'MM/dd HH:mm')}
                          </span>
                          <TaskAttachmentBadge
                            count={attachCount}
                            expanded={isAttachExpanded}
                            loading={loadingAttachments[task.id] || false}
                            onToggle={() => toggleTaskAttachments(task.id)}
                          />
                        </div>
                        
                        {/* Row 3: Notes preview (truncated) */}
                        {task.notes && (
                          <div className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                            {task.notes}
                          </div>
                        )}
                        
                        {/* Row 4: Expanded attachments list */}
                        {attachments && attachments.length > 0 && (
                          <TaskAttachmentList attachments={attachments} className="mt-2" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Detail modal for viewing full request content with replies */}
          <Dialog open={detailModalOpen} onOpenChange={(open) => {
            if (!open) handleModalClose();
          }}>
            <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
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
                    
                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-3 text-sm border rounded-lg p-3 bg-muted/30">
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
                    
                    {/* Full content */}
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
                              <><Check className="w-3 h-3 mr-1" />복사됨</>
                            ) : (
                              <><Copy className="w-3 h-3 mr-1" />복사</>
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
                    
                    {/* Replies section */}
                    <div className="space-y-3 pt-2 border-t">
                      <Label className="text-muted-foreground flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        답글 ({replies.length})
                      </Label>
                      
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
    </div>
  );
}
