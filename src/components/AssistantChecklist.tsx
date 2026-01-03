import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { getTodayKST } from '@/lib/utils';
import { format, differenceInHours, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  ClipboardList,
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
  ClipboardCheck,
  FileEdit,
  AlertCircle,
  Phone,
  Calendar,
  Paperclip,
  Clock,
  AlertTriangle,
  Upload,
  X,
  Download,
  Image,
  File,
} from 'lucide-react';

// ASSISTANT-CHECKLIST-V1
// ASSISTANT-REQUESTS-FILES-DUE-V1

interface TaskAttachment {
  id: string;
  task_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface AssistantTask {
  id: string;
  task_date: string;
  task_type: string;
  title: string;
  assignee: string;
  status: string;
  notes: string | null;
  related_student_id: string | null;
  related_teacher_id: string | null;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  priority: string;
}

interface TaskCounts {
  homework_pending: number;
  tests_today: number;
  draft_lessons: number;
}

const TASK_TYPES = [
  { value: 'homework_verify', label: '숙제 확인' },
  { value: 'test_entry', label: '테스트 입력' },
  { value: 'attendance_check', label: '출결 확인' },
  { value: 'teacher_remind', label: '미제출 리마인드' },
  { value: 'makeup_check', label: '보강 확인' },
  { value: 'etc', label: '기타' },
];

const TEMPLATES = [
  { type: 'homework_verify', label: '숙제 확인대기 처리', title: '숙제 확인대기 처리' },
  { type: 'test_entry', label: '테스트 입력', title: '오늘 테스트 결과 입력' },
  { type: 'attendance_check', label: '출결 특이사항 확인', title: '출결 특이사항 확인' },
  { type: 'teacher_remind', label: '미제출 일지 리마인드', title: '미제출 일지 선생님 리마인드' },
  { type: 'makeup_check', label: '보강 확인', title: '보강 수업 확인' },
];

const ASSIGNEES = ['유빈조교', '다인조교'];

const PRIORITIES = [
  { value: 'low', label: '낮음', className: 'bg-muted text-muted-foreground' },
  { value: 'normal', label: '보통', className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  { value: 'high', label: '높음', className: 'bg-red-500/15 text-red-600 border-red-500/30' },
];

export default function AssistantChecklist() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [taskAttachments, setTaskAttachments] = useState<Record<string, TaskAttachment[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [counts, setCounts] = useState<TaskCounts>({ homework_pending: 0, tests_today: 0, draft_lessons: 0 });
  
  // Add task dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    task_type: 'etc',
    title: '',
    assignee: '유빈조교',
    notes: '',
    due_date: '',
    priority: 'normal',
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // Task detail dialog for viewing attachments
  const [detailTask, setDetailTask] = useState<AssistantTask | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);

  const todayStr = getTodayKST();

  useEffect(() => {
    fetchTasks();
    fetchCounts();
  }, []);

  async function fetchTasks() {
    try {
      const { data, error } = await supabase
        .from('assistant_tasks')
        .select('*')
        .eq('task_date', todayStr)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching tasks:', error);
        return;
      }
      const tasksData = (data || []) as AssistantTask[];
      setTasks(tasksData);
      
      // Fetch attachments for all tasks
      if (tasksData.length > 0) {
        const { data: attachments } = await supabase
          .from('task_attachments')
          .select('*')
          .in('task_id', tasksData.map(t => t.id));
        
        const attachmentMap: Record<string, TaskAttachment[]> = {};
        (attachments || []).forEach((att: TaskAttachment) => {
          if (!attachmentMap[att.task_id]) attachmentMap[att.task_id] = [];
          attachmentMap[att.task_id].push(att);
        });
        setTaskAttachments(attachmentMap);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCounts() {
    try {
      const { data: lessonRecords } = await supabase
        .from('lesson_records')
        .select('id, homework_status, test_result_text, submitted')
        .eq('lesson_date', todayStr);

      const records = lessonRecords || [];
      const homework_pending = records.filter(r => 
        r.homework_status && ['not_done', 'partial'].includes(r.homework_status)
      ).length;
      const tests_today = records.filter(r => 
        r.test_result_text && r.test_result_text.trim() !== ''
      ).length;
      const draft_lessons = records.filter(r => !r.submitted).length;

      setCounts({ homework_pending, tests_today, draft_lessons });
    } catch (err) {
      console.error('Error fetching counts:', err);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchTasks();
    await fetchCounts();
    setRefreshing(false);
  }

  async function uploadFilesToTask(taskId: string, files: File[]) {
    if (!user || files.length === 0) return;
    
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const storagePath = `tasks/${taskId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(storagePath, file);
      
      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast({ title: '파일 업로드 실패', description: file.name, variant: 'destructive' });
        continue;
      }
      
      const { error: insertError } = await supabase
        .from('task_attachments')
        .insert({
          task_id: taskId,
          storage_path: storagePath,
          original_name: file.name,
          mime_type: file.type || null,
          file_size: file.size,
          uploaded_by: user.id,
        });
      
      if (insertError) {
        console.error('Insert error:', insertError);
      }
    }
  }

  async function createTask(taskData: { task_type: string; title: string; assignee: string; notes?: string; due_date?: string; priority?: string }) {
    try {
      setUploading(true);
      
      const { data, error } = await supabase
        .from('assistant_tasks')
        .insert({
          task_date: todayStr,
          task_type: taskData.task_type,
          title: taskData.title,
          assignee: taskData.assignee,
          notes: taskData.notes || null,
          status: 'todo',
          due_date: taskData.due_date || null,
          priority: taskData.priority || 'normal',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({ title: '중복 업무', description: '이미 동일한 업무가 존재합니다.', variant: 'destructive' });
        } else {
          toast({ title: '오류', description: error.message, variant: 'destructive' });
        }
        return;
      }

      // Upload files if any
      if (data && selectedFiles.length > 0) {
        await uploadFilesToTask(data.id, selectedFiles);
      }

      toast({ title: '업무 추가됨', description: taskData.title });
      setSelectedFiles([]);
      fetchTasks();
    } catch (err: any) {
      toast({ title: '오류', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  async function updateTaskStatus(taskId: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('assistant_tasks')
        .update({ status: newStatus })
        .eq('id', taskId);

      if (error) {
        toast({ title: '오류', description: error.message, variant: 'destructive' });
        return;
      }
      
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    } catch (err: any) {
      toast({ title: '오류', description: err.message, variant: 'destructive' });
    }
  }

  async function updateTaskAssignee(taskId: string, newAssignee: string) {
    try {
      const { error } = await supabase
        .from('assistant_tasks')
        .update({ assignee: newAssignee })
        .eq('id', taskId);

      if (error) {
        toast({ title: '오류', description: error.message, variant: 'destructive' });
        return;
      }
      
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assignee: newAssignee } : t));
    } catch (err: any) {
      toast({ title: '오류', description: err.message, variant: 'destructive' });
    }
  }

  async function updateTaskNotes(taskId: string, newNotes: string) {
    try {
      const { error } = await supabase
        .from('assistant_tasks')
        .update({ notes: newNotes || null })
        .eq('id', taskId);

      if (error) {
        toast({ title: '오류', description: error.message, variant: 'destructive' });
        return;
      }
      
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, notes: newNotes || null } : t));
    } catch (err: any) {
      toast({ title: '오류', description: err.message, variant: 'destructive' });
    }
  }

  async function updateTaskPriority(taskId: string, newPriority: string) {
    try {
      const { error } = await supabase
        .from('assistant_tasks')
        .update({ priority: newPriority })
        .eq('id', taskId);

      if (error) {
        toast({ title: '오류', description: error.message, variant: 'destructive' });
        return;
      }
      
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority: newPriority } : t));
    } catch (err: any) {
      toast({ title: '오류', description: err.message, variant: 'destructive' });
    }
  }

  async function updateTaskDueDate(taskId: string, newDueDate: string) {
    try {
      const { error } = await supabase
        .from('assistant_tasks')
        .update({ due_date: newDueDate || null })
        .eq('id', taskId);

      if (error) {
        toast({ title: '오류', description: error.message, variant: 'destructive' });
        return;
      }
      
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, due_date: newDueDate || null } : t));
    } catch (err: any) {
      toast({ title: '오류', description: err.message, variant: 'destructive' });
    }
  }

  async function deleteTask(taskId: string) {
    try {
      const { error } = await supabase
        .from('assistant_tasks')
        .delete()
        .eq('id', taskId);

      if (error) {
        toast({ title: '오류', description: error.message, variant: 'destructive' });
        return;
      }
      
      setTasks(prev => prev.filter(t => t.id !== taskId));
      toast({ title: '삭제됨' });
    } catch (err: any) {
      toast({ title: '오류', description: err.message, variant: 'destructive' });
    }
  }

  async function deleteAttachment(attachmentId: string, storagePath: string) {
    try {
      await supabase.storage.from('attachments').remove([storagePath]);
      await supabase.from('task_attachments').delete().eq('id', attachmentId);
      
      // Refresh attachments
      setTaskAttachments(prev => {
        const updated = { ...prev };
        for (const taskId in updated) {
          updated[taskId] = updated[taskId].filter(a => a.id !== attachmentId);
        }
        return updated;
      });
      
      toast({ title: '첨부파일 삭제됨' });
    } catch (err: any) {
      toast({ title: '삭제 오류', variant: 'destructive' });
    }
  }

  async function handleAddFilesToTask(taskId: string, files: File[]) {
    if (files.length === 0) return;
    
    setUploading(true);
    await uploadFilesToTask(taskId, files);
    await fetchTasks();
    setAdditionalFiles([]);
    setUploading(false);
    toast({ title: '파일 추가됨' });
  }

  async function getSignedUrl(storagePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(storagePath, 60 * 5); // 5 min
    
    if (error || !data) return null;
    return data.signedUrl;
  }

  async function handleDownload(attachment: TaskAttachment) {
    const url = await getSignedUrl(attachment.storage_path);
    if (url) {
      window.open(url, '_blank');
    } else {
      toast({ title: '다운로드 실패', variant: 'destructive' });
    }
  }

  function handleTemplateClick(template: typeof TEMPLATES[0]) {
    createTask({
      task_type: template.type,
      title: template.title,
      assignee: '유빈조교',
    });
  }

  function handleAddTask() {
    if (!newTask.title.trim()) {
      toast({ title: '제목 필요', description: '업무 제목을 입력해주세요.', variant: 'destructive' });
      return;
    }
    createTask(newTask);
    setNewTask({ task_type: 'etc', title: '', assignee: '유빈조교', notes: '', due_date: '', priority: 'normal' });
    setDialogOpen(false);
  }

  function getDueBadge(task: AssistantTask) {
    if (!task.due_date) return null;
    
    const now = new Date();
    const dueDate = parseISO(task.due_date + 'T23:59:59');
    const hoursUntilDue = differenceInHours(dueDate, now);
    
    if (hoursUntilDue < 0) {
      return (
        <Badge variant="destructive" className="text-xs gap-1">
          <AlertTriangle className="w-3 h-3" />
          마감 지남
        </Badge>
      );
    } else if (hoursUntilDue <= 24) {
      return (
        <Badge className="text-xs gap-1 bg-amber-500/15 text-amber-600 border-amber-500/30">
          <Clock className="w-3 h-3" />
          오늘 마감
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs gap-1">
        <Calendar className="w-3 h-3" />
        {format(dueDate, 'M/d', { locale: ko })}
      </Badge>
    );
  }

  function getPriorityBadge(priority: string) {
    const p = PRIORITIES.find(x => x.value === priority);
    if (!p || priority === 'normal') return null;
    return <Badge className={`text-xs ${p.className}`}>{p.label}</Badge>;
  }

  const filteredTasks = tasks.filter(t => statusFilter === 'all' || t.status === statusFilter);
  const todoCount = tasks.filter(t => t.status === 'todo').length;
  const doingCount = tasks.filter(t => t.status === 'doing').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  function getStatusBadgeClass(status: string) {
    switch (status) {
      case 'todo': return 'bg-muted text-muted-foreground';
      case 'doing': return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
      case 'done': return 'bg-green-500/15 text-green-600 border-green-500/30';
      default: return 'bg-muted';
    }
  }

  function getTaskTypeIcon(type: string) {
    switch (type) {
      case 'homework_verify': return <ClipboardCheck className="w-4 h-4" />;
      case 'test_entry': return <FileEdit className="w-4 h-4" />;
      case 'attendance_check': return <Calendar className="w-4 h-4" />;
      case 'teacher_remind': return <AlertCircle className="w-4 h-4" />;
      case 'makeup_check': return <Phone className="w-4 h-4" />;
      default: return <ClipboardList className="w-4 h-4" />;
    }
  }

  function isImageType(mimeType: string | null): boolean {
    return mimeType?.startsWith('image/') || false;
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            오늘 조교 체크리스트
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-muted rounded" />
            <div className="h-8 bg-muted rounded" />
            <div className="h-8 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <div className="bg-muted/30 text-muted-foreground text-xs text-center py-1 rounded-t">
        ASSISTANT-CHECKLIST-V1
      </div>
      
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            오늘 조교 체크리스트
            <span className="text-sm font-normal text-muted-foreground">
              ({format(new Date(todayStr), 'M/d', { locale: ko })})
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Counters */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            <ClipboardCheck className="w-3 h-3" />
            숙제확인대기 {counts.homework_pending}건
          </Badge>
          <Badge variant="outline" className="gap-1">
            <FileEdit className="w-3 h-3" />
            오늘 테스트 입력 필요 {counts.tests_today}건
          </Badge>
          <Badge variant="outline" className="gap-1">
            <AlertCircle className="w-3 h-3" />
            미제출 일지 {counts.draft_lessons}건
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" />
                업무 추가
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>새 업무 추가</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>업무 유형</Label>
                    <Select value={newTask.task_type} onValueChange={v => setNewTask(p => ({ ...p, task_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>우선순위</Label>
                    <Select value={newTask.priority} onValueChange={v => setNewTask(p => ({ ...p, priority: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>제목</Label>
                  <Input
                    value={newTask.title}
                    onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
                    placeholder="업무 제목..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>담당자</Label>
                    <Select value={newTask.assignee} onValueChange={v => setNewTask(p => ({ ...p, assignee: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ASSIGNEES.map(a => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>마감일 (선택)</Label>
                    <Input
                      type="date"
                      value={newTask.due_date}
                      onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>메모 (선택)</Label>
                  <Textarea
                    value={newTask.notes}
                    onChange={e => setNewTask(p => ({ ...p, notes: e.target.value }))}
                    placeholder="메모..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>첨부파일 (선택)</Label>
                  <div className="border rounded-md p-3 space-y-2">
                    <input
                      type="file"
                      multiple
                      onChange={e => setSelectedFiles(Array.from(e.target.files || []))}
                      className="text-sm"
                    />
                    {selectedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedFiles.map((f, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {f.name}
                            <button onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <Button onClick={handleAddTask} className="w-full" disabled={uploading}>
                  {uploading ? '업로드 중...' : '추가'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                템플릿 추가
                <ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {TEMPLATES.map(t => (
                <DropdownMenuItem key={t.type} onClick={() => handleTemplateClick(t)}>
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 border-b pb-2">
          <Button
            variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('all')}
          >
            전체 ({tasks.length})
          </Button>
          <Button
            variant={statusFilter === 'todo' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('todo')}
          >
            TODO ({todoCount})
          </Button>
          <Button
            variant={statusFilter === 'doing' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('doing')}
          >
            진행중 ({doingCount})
          </Button>
          <Button
            variant={statusFilter === 'done' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('done')}
          >
            완료 ({doneCount})
          </Button>
        </div>

        {/* Task List */}
        {filteredTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>업무가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map(task => {
              const attachments = taskAttachments[task.id] || [];
              
              return (
                <div
                  key={task.id}
                  className={`p-3 rounded-lg border ${
                    task.status === 'done' ? 'bg-muted/30 opacity-70' : 'bg-secondary/30'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Done Checkbox */}
                    <Checkbox
                      checked={task.status === 'done'}
                      onCheckedChange={(checked) => {
                        updateTaskStatus(task.id, checked ? 'done' : 'todo');
                      }}
                    />

                    {/* Status Chip */}
                    <Badge className={`text-xs ${getStatusBadgeClass(task.status)}`}>
                      {task.status === 'todo' ? 'TODO' : task.status === 'doing' ? '진행중' : '완료'}
                    </Badge>

                    {/* Priority Badge */}
                    {getPriorityBadge(task.priority)}

                    {/* Due Badge */}
                    {getDueBadge(task)}

                    {/* Task Type Icon */}
                    <span className="text-muted-foreground">
                      {getTaskTypeIcon(task.task_type)}
                    </span>

                    {/* Title */}
                    <span 
                      className={`flex-1 cursor-pointer hover:underline ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}
                      onClick={() => { setDetailTask(task); setDetailDialogOpen(true); }}
                    >
                      {task.title}
                    </span>

                    {/* Attachment indicator */}
                    {attachments.length > 0 && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Paperclip className="w-3 h-3" />
                        {attachments.length}
                      </Badge>
                    )}

                    {/* Assignee Dropdown */}
                    <Select value={task.assignee} onValueChange={v => updateTaskAssignee(task.id, v)}>
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNEES.map(a => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Status Toggle */}
                    {task.status !== 'done' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateTaskStatus(task.id, task.status === 'todo' ? 'doing' : 'todo')}
                        className="h-8 px-2 text-xs"
                      >
                        {task.status === 'todo' ? '시작' : '대기'}
                      </Button>
                    )}

                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTask(task.id)}
                      className="h-8 px-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  {/* Notes inline */}
                  {task.notes && (
                    <p className="text-xs text-muted-foreground mt-2 pl-8">{task.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Task Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailTask && getTaskTypeIcon(detailTask.task_type)}
              {detailTask?.title}
            </DialogTitle>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-4 pt-2">
              {/* ASSISTANT-REQUESTS-FILES-DUE-V1 marker */}
              <div className="bg-muted/30 text-muted-foreground text-xs text-center py-1 rounded">
                ASSISTANT-REQUESTS-FILES-DUE-V1
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>우선순위</Label>
                  <Select value={detailTask.priority} onValueChange={v => { updateTaskPriority(detailTask.id, v); setDetailTask(prev => prev ? {...prev, priority: v} : null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>마감일</Label>
                  <Input
                    type="date"
                    value={detailTask.due_date || ''}
                    onChange={e => { updateTaskDueDate(detailTask.id, e.target.value); setDetailTask(prev => prev ? {...prev, due_date: e.target.value || null} : null); }}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>메모</Label>
                <Textarea
                  value={detailTask.notes || ''}
                  onChange={e => { updateTaskNotes(detailTask.id, e.target.value); setDetailTask(prev => prev ? {...prev, notes: e.target.value || null} : null); }}
                  placeholder="메모..."
                  rows={2}
                />
              </div>
              
              {/* Attachments */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  첨부파일 ({(taskAttachments[detailTask.id] || []).length})
                </Label>
                <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                  {(taskAttachments[detailTask.id] || []).map(att => (
                    <div key={att.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                      {isImageType(att.mime_type) ? (
                        <Image className="w-4 h-4 text-blue-500" />
                      ) : (
                        <File className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="flex-1 text-sm truncate">{att.original_name}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDownload(att)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteAttachment(att.id, att.storage_path)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {(taskAttachments[detailTask.id] || []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">첨부파일 없음</p>
                  )}
                </div>
                
                {/* Add more files */}
                <div className="flex gap-2 items-center">
                  <input
                    type="file"
                    multiple
                    onChange={e => setAdditionalFiles(Array.from(e.target.files || []))}
                    className="text-sm flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={additionalFiles.length === 0 || uploading}
                    onClick={() => handleAddFilesToTask(detailTask.id, additionalFiles)}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    {uploading ? '업로드 중...' : '추가'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
