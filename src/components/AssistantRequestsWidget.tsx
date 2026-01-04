// DASHBOARD-ASSISTANT-REQUESTS-WIDGET-V2
// TEACHER-CANCEL-REQUEST-V1
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { CalendarIcon, ClipboardCheck, Plus, ChevronRight, Loader2, X } from 'lucide-react';
import { format, differenceInHours, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getTodayKST, cn } from '@/lib/utils';

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
}

interface Teacher {
  id: string;
  full_name: string;
}

export function AssistantRequestsWidget() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('미배정');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [showForm, setShowForm] = useState(false);
  
  // Admin filters
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherFilter, setTeacherFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

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
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    if (!isAdmin(role)) return;
    
    try {
      // Get teachers from profiles joined with user_roles
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, profiles!inner(id, full_name)')
        .eq('role', 'teacher');
      
      if (error) throw error;
      
      const teacherList = (data || []).map((item: any) => ({
        id: item.user_id,
        full_name: item.profiles.full_name
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

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({
        title: '제목을 입력하세요',
        variant: 'destructive'
      });
      return;
    }
    
    setSubmitting(true);
    
    try {
      const todayKST = getTodayKST();
      
      const { error } = await supabase
        .from('assistant_tasks')
        .insert({
          title: title.trim(),
          assignee,
          due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
          notes: notes.trim() || null,
          status: 'todo',
          priority: 'normal',
          task_date: todayKST,
          task_type: 'teacher_request',
          created_by: user?.id,
          created_by_role: role
        });
      
      if (error) throw error;
      
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
      
      // Refresh list
      fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      toast({
        title: '요청 등록 실패',
        description: '다시 시도해주세요.',
        variant: 'destructive'
      });
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

  const getDueBadge = (dueDateStr: string | null) => {
    if (!dueDateStr) return null;
    
    const dueDate = parseISO(dueDateStr);
    const now = new Date();
    const hoursUntilDue = differenceInHours(dueDate, now);
    
    if (hoursUntilDue < 0) {
      return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-xs">기한 초과</Badge>;
    } else if (hoursUntilDue < 24) {
      return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">오늘 마감</Badge>;
    } else {
      return <Badge variant="outline" className="text-xs">{format(dueDate, 'MM/dd')}</Badge>;
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

  return (
    <Card className="animate-slide-up">
      <CardHeader className="pb-3">
        {/* Marker for deployment confirmation */}
        <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded mb-2">
          DASHBOARD-ASSISTANT-REQUESTS-WIDGET-V2
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/assistant-requests')}
            >
              전체 보기
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Create Form */}
        {showForm && (
          <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
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
                취소
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
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
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg hover:bg-secondary/70 transition-colors cursor-pointer"
                  onClick={() => navigate('/assistant-requests')}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(task.status)}
                      <span className="font-medium text-foreground truncate">{task.title}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {getAssigneeBadge(task.assignee)}
                      {getDueBadge(task.due_date)}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(task.created_at), 'MM/dd HH:mm')}
                      </span>
                    </div>
                  </div>
                  {/* Cancel button for teachers on their own tasks */}
                  {canCancelTask(task) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive shrink-0 ml-2"
                      onClick={(e) => handleCancel(task.id, e)}
                      disabled={cancellingId === task.id}
                    >
                      {cancellingId === task.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </Button>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
