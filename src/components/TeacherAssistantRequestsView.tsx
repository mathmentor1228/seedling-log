// TEACHER-ASSISTANT-REQUESTS-V2
// TEACHER-CANCEL-REQUEST-V1
// REQUESTER-AND-RELATEDTEACHER-V1
// REQUEST-CREATE-STABLE-V2
// REQ-ERROR-VISIBLE-V1
import { useState, useEffect } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarIcon, ClipboardCheck, Plus, Loader2, X } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getTodayKST, getDueBadgeInfo, cn } from '@/lib/utils';

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

  const fetchTasks = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('assistant_tasks')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
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
      const todayKST = getTodayKST();

      // Teachers set related_teacher_id to themselves
      const { error } = await supabase
        .from('assistant_tasks')
        .insert({
          title: title.trim(),
          assignee: assignee || '미배정',
          due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
          notes: notes.trim() || null,
          status: 'todo',
          priority: 'normal',
          task_date: todayKST,
          task_type: 'teacher_request',
          created_by: user.id,
          created_by_role: role || 'teacher',
          related_teacher_id: user.id,
        });

      if (error) {
        const errMsg = `REQUEST_CREATE_ERROR: code=${error.code || 'unknown'} message=${error.message} details=${error.details || 'none'} hint=${error.hint || 'none'}`;
        console.error('[REQ_CREATE_FAIL]', error);
        setCreateError(errMsg);
        return;
      }

      toast({
        title: '요청이 등록되었습니다.',
        description: assignee !== '미배정' ? `${assignee}에게 배정됨` : undefined
      });

      // Reset form
      setTitle('');
      setAssignee('미배정');
      setDueDate(undefined);
      setNotes('');
      setShowForm(false);
      setCreateError(null);

      fetchTasks();
    } catch (error: any) {
      console.error('[REQ_CREATE_FAIL]', error);
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
        TEACHER-ASSISTANT-REQUESTS-V2
      </div>
      <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded">
        TEACHER-CANCEL-REQUEST-V1
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
                <div className="space-y-2">
                  {filteredTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusBadge(task.status)}
                          <span className="font-medium text-foreground">{task.title}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {getAssigneeBadge(task.assignee)}
                          {getDueBadge(task.due_date)}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(task.created_at), 'MM/dd HH:mm')}
                          </span>
                        </div>
                        {task.notes && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {task.notes}
                          </p>
                        )}
                      </div>
                      {/* Cancel button for active tasks */}
                      {(task.status === 'todo' || task.status === 'doing') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive shrink-0 ml-2"
                          onClick={() => handleCancel(task.id)}
                          disabled={cancellingId === task.id}
                        >
                          {cancellingId === task.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <X className="w-4 h-4 mr-1" />
                              취소
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
