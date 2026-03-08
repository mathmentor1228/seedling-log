import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, MessageSquare, CheckCircle2, Clock, Loader2, Send, Trash2, Calculator, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { TuitionCalculator } from './TuitionCalculator';
import { NewStudentRegistration } from './NewStudentRegistration';

const CATEGORIES = ['신규생 정보', '등록 문자', '시간표', '원비 수납', '미납 확인', '교재비 정리', '기타'];
const STATUSES = ['대기 중', '진행 중', '완료'] as const;

type Status = typeof STATUSES[number];

interface Task {
  id: string;
  category: string;
  title: string;
  description: string | null;
  status: Status;
  created_by: string;
  created_by_name: string;
  assignee_name: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  task_id: string;
  body: string;
  author_id: string;
  author_name: string;
  created_at: string;
}

export function AdminOfficeBoard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('active');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [userName, setUserName] = useState('');

  // New task form
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => setUserName((data as any)?.full_name || user.email || ''));
    }
  }, [user]);

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('admin_office_tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      toast.error('업무 목록을 불러올 수 없습니다');
    } else {
      setTasks((data as any[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleCreate = async () => {
    if (!newTitle.trim()) { toast.error('제목을 입력해주세요'); return; }
    setCreating(true);
    const { error } = await supabase.from('admin_office_tasks').insert({
      category: newCategory,
      title: newTitle.trim(),
      description: newDescription.trim() || null,
      created_by: user!.id,
      created_by_name: userName,
      assignee_name: newAssignee.trim() || null,
    } as any);
    if (error) { toast.error('생성 실패'); console.error(error); }
    else {
      toast.success('업무가 등록되었습니다');
      setShowCreateDialog(false);
      setNewTitle(''); setNewDescription(''); setNewAssignee('');
      fetchTasks();
    }
    setCreating(false);
  };

  const updateStatus = async (task: Task, newStatus: Status) => {
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === '완료') {
      updates.completed_by_name = userName;
      updates.completed_at = new Date().toISOString();
    } else {
      updates.completed_by_name = null;
      updates.completed_at = null;
    }
    const { error } = await supabase.from('admin_office_tasks').update(updates).eq('id', task.id);
    if (error) toast.error('상태 변경 실패');
    else fetchTasks();
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('이 업무를 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('admin_office_tasks').delete().eq('id', taskId);
    if (error) toast.error('삭제 실패');
    else { toast.success('삭제되었습니다'); setSelectedTask(null); fetchTasks(); }
  };

  // Comments
  const fetchComments = async (taskId: string) => {
    setCommentLoading(true);
    const { data } = await supabase
      .from('admin_office_task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    setComments((data as any[]) || []);
    setCommentLoading(false);
  };

  const handleOpenTask = (task: Task) => {
    setSelectedTask(task);
    setCommentText('');
    fetchComments(task.id);
  };

  const handleAddComment = async () => {
    if (!commentText.trim() || !selectedTask) return;
    const { error } = await supabase.from('admin_office_task_comments').insert({
      task_id: selectedTask.id,
      body: commentText.trim(),
      author_id: user!.id,
      author_name: userName,
    } as any);
    if (error) toast.error('댓글 등록 실패');
    else { setCommentText(''); fetchComments(selectedTask.id); }
  };

  const filtered = tasks.filter(t => {
    const statusMatch = activeTab === 'active' ? t.status !== '완료' : t.status === '완료';
    const catMatch = categoryFilter === 'all' || t.category === categoryFilter;
    return statusMatch && catMatch;
  });

  const statusBadge = (status: Status) => {
    const map: Record<Status, { variant: 'warning' | 'default' | 'success'; icon: typeof Clock }> = {
      '대기 중': { variant: 'warning', icon: Clock },
      '진행 중': { variant: 'default', icon: Loader2 },
      '완료': { variant: 'success', icon: CheckCircle2 },
    };
    const cfg = map[status];
    const Icon = cfg.icon;
    return <Badge variant={cfg.variant} className="gap-1"><Icon className="w-3 h-3" />{status}</Badge>;
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">행정 업무 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">원장 · 행정 담당자 전용 업무 보드</p>
        </div>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList className="mb-4">
          <TabsTrigger value="tasks">업무 보드</TabsTrigger>
          <TabsTrigger value="calculator" className="gap-1.5"><Calculator className="w-3.5 h-3.5" />원비 계산기</TabsTrigger>
        </TabsList>

        <TabsContent value="calculator">
          <TuitionCalculator />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-6">
      <div className="flex items-center justify-end">
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" />업무 등록</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>새 행정 업무</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium text-foreground">분류</label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">제목 *</label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="업무 제목" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">상세 내용</label>
                <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="상세 내용 입력" rows={3} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">담당자</label>
                <Input value={newAssignee} onChange={e => setNewAssignee(e.target.value)} placeholder="담당자 이름" />
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}등록
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {STATUSES.map(s => {
          const count = tasks.filter(t => t.status === s).length;
          return (
            <Card key={s} className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{count}</p>
              <p className="text-xs text-muted-foreground mt-1">{s}</p>
            </Card>
          );
        })}
      </div>

      {/* Filters & Tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="active">진행 중</TabsTrigger>
            <TabsTrigger value="completed">완료</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="전체 분류" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 분류</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">등록된 업무가 없습니다</p>
        )}
        {filtered.map(task => (
          <Card
            key={task.id}
            className={cn(
              "p-4 cursor-pointer hover:bg-muted/30 transition-colors",
              task.status === '대기 중' && "border-l-4 border-l-warning bg-warning/5"
            )}
            onClick={() => handleOpenTask(task)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">{task.category}</Badge>
                  {statusBadge(task.status)}
                </div>
                <p className="font-medium text-foreground truncate">{task.title}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span>작성: {task.created_by_name}</span>
                  {task.assignee_name && <span>담당: {task.assignee_name}</span>}
                  <span>{format(new Date(task.created_at), 'MM/dd HH:mm')}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {task.status !== '완료' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); updateStatus(task, task.status === '대기 중' ? '진행 중' : '완료'); }}
                    title={task.status === '대기 중' ? '진행 중으로 변경' : '완료 처리'}
                  >
                    {task.status === '대기 중' ? <Loader2 className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Task detail dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          {selectedTask && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{selectedTask.category}</Badge>
                  {statusBadge(selectedTask.status)}
                </div>
                <DialogTitle className="text-left mt-2">{selectedTask.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 flex-1 overflow-y-auto">
                {selectedTask.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedTask.description}</p>
                )}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>작성자: {selectedTask.created_by_name} · {format(new Date(selectedTask.created_at), 'yyyy-MM-dd HH:mm')}</p>
                  {selectedTask.assignee_name && <p>담당자: {selectedTask.assignee_name}</p>}
                  {selectedTask.completed_by_name && (
                    <p>완료 확인: {selectedTask.completed_by_name} · {selectedTask.completed_at && format(new Date(selectedTask.completed_at), 'yyyy-MM-dd HH:mm')}</p>
                  )}
                </div>

                {/* Status change buttons */}
                <div className="flex gap-2">
                  {STATUSES.filter(s => s !== selectedTask.status).map(s => (
                    <Button key={s} variant="outline" size="sm" onClick={() => { updateStatus(selectedTask, s); setSelectedTask({ ...selectedTask, status: s }); }}>
                      {s}(으)로 변경
                    </Button>
                  ))}
                  <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-destructive" onClick={() => deleteTask(selectedTask.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Comments */}
                <div className="border-t border-border pt-3">
                  <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4" />댓글
                  </p>
                  {commentLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <div className="space-y-2 mb-3">
                      {comments.length === 0 && <p className="text-xs text-muted-foreground">댓글이 없습니다</p>}
                      {comments.map(c => (
                        <div key={c.id} className="bg-muted/50 rounded-md px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground">{c.author_name}</span>
                            <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), 'MM/dd HH:mm')}</span>
                          </div>
                          <p className="text-sm text-foreground mt-1">{c.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="댓글 입력..."
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddComment()}
                      className="flex-1"
                    />
                    <Button size="icon" onClick={handleAddComment} disabled={!commentText.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
