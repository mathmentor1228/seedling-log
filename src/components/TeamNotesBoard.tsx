// TEAM-NOTES-DETAIL-MODAL-V1
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth, isAdmin as checkIsAdmin } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  MessageSquare, 
  Plus, 
  Check, 
  Trash2, 
  ChevronDown,
  ChevronRight,
  Paperclip,
  Upload,
  Download,
  X,
  Loader2,
  Filter,
  AlertTriangle,
  Copy,
  Send
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface TeamNote {
  id: string;
  created_at: string;
  created_by: string;
  creator_name?: string;
  target_role: string | null;
  target_user_id: string | null;
  target_user_name?: string;
  scope: string;
  priority: string;
  status: string;
  title: string;
  body: string | null;
  due_date: string | null;
  done_at: string | null;
  done_by: string | null;
  done_by_name?: string;
  attachments?: TeamNoteAttachment[];
}

interface TeamNoteAttachment {
  id: string;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  file_size: number | null;
}

interface UserOption {
  id: string;
  name: string;
  role: string;
}

interface TeamNoteReply {
  id: string;
  note_id: string;
  created_by: string;
  body: string;
  created_at: string;
  author_name?: string;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: '낮음', variant: 'muted' as const },
  { value: 'normal', label: '보통', variant: 'secondary' as const },
  { value: 'high', label: '높음', variant: 'warning' as const },
];

const SCOPE_OPTIONS = [
  { value: 'general', label: '일반' },
  { value: 'ops', label: '운영' },
  { value: 'student', label: '학생 관련' },
  { value: 'class', label: '수업 관련' },
];

export function TeamNotesBoard() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = checkIsAdmin(role);
  
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'done'>('open');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  
  // Create form state
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    target_type: 'all' as 'all' | 'role' | 'user',
    target_role: '',
    target_user_id: '',
    scope: 'general',
    priority: 'normal',
    due_date: '',
  });
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<TeamNote | null>(null);
  const [copied, setCopied] = useState(false);
  const clickedRowRef = useRef<HTMLDivElement | null>(null);

  // Replies state
  const [replies, setReplies] = useState<TeamNoteReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  useEffect(() => {
    if (user) {
      fetchNotes();
      fetchUsers();
    }
  }, [user, filterStatus, filterPriority]);

  async function fetchNotes() {
    try {
      setLoading(true);
      
      let query = supabase
        .from('team_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }
      
      if (filterPriority !== 'all') {
        query = query.eq('priority', filterPriority);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Fetch creator names and attachments
      const notesWithDetails: TeamNote[] = [];
      
      for (const note of (data || [])) {
        // Get creator name
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', note.created_by)
          .maybeSingle();
        
        // Get target user name if exists
        let targetUserName = '';
        if (note.target_user_id) {
          const { data: targetProfile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', note.target_user_id)
            .maybeSingle();
          targetUserName = targetProfile?.full_name || targetProfile?.email || '';
        }
        
        // Get done_by name if exists
        let doneByName = '';
        if (note.done_by) {
          const { data: doneByProfile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', note.done_by)
            .maybeSingle();
          doneByName = doneByProfile?.full_name || doneByProfile?.email || '';
        }
        
        // Get attachments
        const { data: attachments } = await supabase
          .from('team_note_attachments')
          .select('*')
          .eq('note_id', note.id);
        
        notesWithDetails.push({
          ...note,
          creator_name: creatorProfile?.full_name || creatorProfile?.email || '알 수 없음',
          target_user_name: targetUserName,
          done_by_name: doneByName,
          attachments: attachments || [],
        });
      }
      
      setNotes(notesWithDetails);
    } catch (error) {
      console.error('Error fetching notes:', error);
      toast({
        title: '데이터 로드 오류',
        description: '메모를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      // Fetch users from profiles + user_roles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email');
      
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');
      
      const roleMap: Record<string, string> = {};
      (roles || []).forEach((r: any) => {
        roleMap[r.user_id] = r.role;
      });
      
      const userOptions: UserOption[] = (profiles || []).map((p: any) => ({
        id: p.id,
        name: p.full_name || p.email || '알 수 없음',
        role: roleMap[p.id] || 'unknown',
      }));
      
      setUsers(userOptions);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }

  async function handleCreateNote() {
    if (!formData.title.trim() || !user) return;
    
    setIsSubmitting(true);
    try {
      // Insert note
      const insertData: any = {
        created_by: user.id,
        title: formData.title.trim(),
        body: formData.body.trim() || null,
        scope: formData.scope,
        priority: formData.priority,
        due_date: formData.due_date || null,
      };
      
      if (formData.target_type === 'role' && formData.target_role) {
        insertData.target_role = formData.target_role;
      } else if (formData.target_type === 'user' && formData.target_user_id) {
        insertData.target_user_id = formData.target_user_id;
      }
      
      const { data: newNote, error: insertError } = await supabase
        .from('team_notes')
        .insert(insertData)
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      // Upload attachments
      for (const file of uploadingFiles) {
        const filePath = `team_notes/${newNote.id}/${crypto.randomUUID()}_${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('team_files')
          .upload(filePath, file);
        
        if (!uploadError) {
          await supabase
            .from('team_note_attachments')
            .insert({
              note_id: newNote.id,
              storage_path: filePath,
              original_name: file.name,
              mime_type: file.type,
              file_size: file.size,
              uploaded_by: user.id,
            });
        }
      }
      
      toast({
        title: '메모 생성 완료',
        description: '새 메모가 생성되었습니다.',
      });
      
      // Reset form
      setFormData({
        title: '',
        body: '',
        target_type: 'all',
        target_role: '',
        target_user_id: '',
        scope: 'general',
        priority: 'normal',
        due_date: '',
      });
      setUploadingFiles([]);
      setIsCreateOpen(false);
      fetchNotes();
    } catch (error: any) {
      console.error('Error creating note:', error);
      toast({
        title: '오류',
        description: error.message || '메모 생성에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleStatus(noteId: string, currentStatus: string) {
    if (!user) return;
    
    try {
      const newStatus = currentStatus === 'open' ? 'done' : 'open';
      
      await supabase
        .from('team_notes')
        .update({
          status: newStatus,
          done_at: newStatus === 'done' ? new Date().toISOString() : null,
          done_by: newStatus === 'done' ? user.id : null,
        })
        .eq('id', noteId);
      
      toast({
        title: newStatus === 'done' ? '완료 처리됨' : '미완료로 변경',
      });
      
      fetchNotes();
    } catch (error) {
      console.error('Error toggling status:', error);
      toast({
        title: '오류',
        description: '상태 변경에 실패했습니다.',
        variant: 'destructive',
      });
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await supabase
        .from('team_notes')
        .delete()
        .eq('id', noteId);
      
      toast({
        title: '삭제 완료',
      });
      
      fetchNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast({
        title: '오류',
        description: '삭제에 실패했습니다.',
        variant: 'destructive',
      });
    }
  }

  async function handleDownloadAttachment(storagePath: string, originalName: string) {
    try {
      const { data, error } = await supabase.storage
        .from('team_files')
        .createSignedUrl(storagePath, 60);
      
      if (error) throw error;
      
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Error downloading attachment:', error);
      toast({
        title: '다운로드 오류',
        description: '파일 다운로드에 실패했습니다.',
        variant: 'destructive',
      });
    }
  }

  // Detail modal functions
  async function fetchReplies(noteId: string) {
    setRepliesLoading(true);
    try {
      const { data, error } = await supabase
        .from('team_note_replies')
        .select('*')
        .eq('note_id', noteId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      
      // Fetch author names
      const replyData = data || [];
      const authorIds = [...new Set(replyData.map(r => r.created_by))];
      let profileMap: Record<string, string> = {};
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', authorIds);
        (profiles || []).forEach((p: any) => {
          profileMap[p.id] = p.full_name || p.email || '알 수 없음';
        });
      }
      
      setReplies(replyData.map(r => ({
        ...r,
        author_name: profileMap[r.created_by] || '알 수 없음',
      })));
    } catch (err) {
      console.error('Error fetching replies:', err);
      setReplies([]);
    } finally {
      setRepliesLoading(false);
    }
  }

  function handleNoteClick(note: TeamNote, rowElement: HTMLDivElement | null) {
    clickedRowRef.current = rowElement;
    setSelectedNote(note);
    setCopied(false);
    setReplyText('');
    setReplies([]);
    setDetailModalOpen(true);
    fetchReplies(note.id);
  }

  async function handleCopyBody() {
    if (!selectedNote?.body) return;
    try {
      await navigator.clipboard.writeText(selectedNote.body);
      setCopied(true);
      toast({ title: '복사되었습니다' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: '복사 실패', variant: 'destructive' });
    }
  }

  async function handleSubmitReply() {
    if (!selectedNote || !replyText.trim() || !user) return;
    setReplySubmitting(true);
    try {
      const { error } = await supabase.from('team_note_replies').insert({
        note_id: selectedNote.id,
        created_by: user.id,
        body: replyText.trim(),
      });
      if (error) throw error;
      toast({ title: '답글이 등록되었습니다' });
      setReplyText('');
      fetchReplies(selectedNote.id);
    } catch (err) {
      console.error('Error submitting reply:', err);
      toast({ title: '답글 등록 실패', variant: 'destructive' });
    } finally {
      setReplySubmitting(false);
    }
  }

  function handleDetailModalClose() {
    setDetailModalOpen(false);
    setSelectedNote(null);
    setReplies([]);
    setReplyText('');
    setTimeout(() => clickedRowRef.current?.focus(), 50);
  }

  function getPriorityBadge(priority: string) {
    const option = PRIORITY_OPTIONS.find(o => o.value === priority);
    if (!option) return null;
    return <Badge variant={option.variant}>{option.label}</Badge>;
  }

  function getTargetLabel(note: TeamNote) {
    if (note.target_user_name) {
      return `→ ${note.target_user_name}`;
    }
    if (note.target_role) {
      const roleLabel = note.target_role === 'admin' ? '원장' : 
                        note.target_role === 'teacher' ? '선생님' : '조교';
      return `→ ${roleLabel}`;
    }
    return '→ 전체';
  }

  const openNotes = notes.filter(n => n.status === 'open');
  const doneNotes = notes.filter(n => n.status === 'done');

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <span>코멘트/요청</span>
                {openNotes.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{openNotes.length}</Badge>
                )}
              </div>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={(e) => e.stopPropagation()}>
                    <Plus className="w-4 h-4 mr-1" />
                    새 메모
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
                  <DialogHeader>
                    <DialogTitle>새 메모/요청 작성</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>제목 *</Label>
                      <Input
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="메모 제목..."
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>내용</Label>
                      <Textarea
                        value={formData.body}
                        onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                        placeholder="상세 내용..."
                        rows={3}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>대상</Label>
                        <Select
                          value={formData.target_type}
                          onValueChange={(value: 'all' | 'role' | 'user') => setFormData(prev => ({ 
                            ...prev, 
                            target_type: value,
                            target_role: '',
                            target_user_id: '',
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">전체</SelectItem>
                            <SelectItem value="role">역할별</SelectItem>
                            <SelectItem value="user">특정 사용자</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {formData.target_type === 'role' && (
                        <div className="space-y-2">
                          <Label>역할 선택</Label>
                          <Select
                            value={formData.target_role}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, target_role: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="선택..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">원장</SelectItem>
                              <SelectItem value="teacher">선생님</SelectItem>
                              <SelectItem value="assistant">조교</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      {formData.target_type === 'user' && (
                        <div className="space-y-2">
                          <Label>사용자 선택</Label>
                          <Select
                            value={formData.target_user_id}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, target_user_id: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="선택..." />
                            </SelectTrigger>
                            <SelectContent>
                              {users.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name} ({u.role === 'admin' ? '원장' : u.role === 'teacher' ? '선생님' : u.role === 'assistant' ? '조교' : u.role})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>카테고리</Label>
                        <Select
                          value={formData.scope}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, scope: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SCOPE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>우선순위</Label>
                        <Select
                          value={formData.priority}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>기한</Label>
                        <Input
                          type="date"
                          value={formData.due_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                        />
                      </div>
                    </div>
                    
                    {/* File upload */}
                    <div className="space-y-2">
                      <Label>첨부파일</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            setUploadingFiles(prev => [...prev, ...files]);
                            e.target.value = '';
                          }}
                          className="flex-1"
                        />
                      </div>
                      {uploadingFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {uploadingFiles.map((file, idx) => (
                            <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                              <Paperclip className="w-3 h-3" />
                              {file.name}
                              <button
                                type="button"
                                onClick={() => setUploadingFiles(prev => prev.filter((_, i) => i !== idx))}
                                className="ml-1 hover:text-destructive"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <Button 
                      onClick={handleCreateNote}
                      disabled={!formData.title.trim() || isSubmitting}
                      className="w-full"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      메모 생성
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Filters */}
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filterStatus} onValueChange={(v: 'all' | 'open' | 'done') => setFilterStatus(v)}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="open">미완료</SelectItem>
                  <SelectItem value="done">완료</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 우선순위</SelectItem>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="normal">보통</SelectItem>
                  <SelectItem value="low">낮음</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : notes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>메모가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {notes.map((note) => (
                  <div 
                    key={note.id}
                    ref={(el) => {
                      if (selectedNote?.id === note.id) clickedRowRef.current = el;
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`메모 상세보기: ${note.title}`}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                      note.status === 'done' 
                        ? 'bg-muted/30 border-muted hover:bg-muted/50' 
                        : note.priority === 'high' 
                          ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10' 
                          : 'bg-secondary/50 border-border hover:bg-secondary/70'
                    }`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      handleNoteClick(note, e.currentTarget);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleNoteClick(note, e.currentTarget);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium ${note.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                            {note.title}
                          </span>
                          {getPriorityBadge(note.priority)}
                          <span className="text-xs text-muted-foreground">
                            {getTargetLabel(note)}
                          </span>
                        </div>
                        
                        {note.body && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                            {note.body}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{note.creator_name}</span>
                          <span>{format(new Date(note.created_at), 'M/d HH:mm', { locale: ko })}</span>
                          {note.due_date && (
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              기한: {note.due_date}
                            </span>
                          )}
                          {note.status === 'done' && note.done_by_name && (
                            <span className="text-green-600">완료: {note.done_by_name}</span>
                          )}
                        </div>
                        
                        {/* Attachments */}
                        {note.attachments && note.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {note.attachments.map((att) => (
                              <Button
                                key={att.id}
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => { e.stopPropagation(); handleDownloadAttachment(att.storage_path, att.original_name); }}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                {att.original_name}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNoteClick(note, e.currentTarget.closest('[role="button"]') as HTMLDivElement);
                          }}
                        >
                          자세히
                          <ChevronRight className="w-3 h-3 ml-0.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleToggleStatus(note.id, note.status); }}
                        >
                          <Check className={`w-4 h-4 ${note.status === 'done' ? 'text-green-600' : ''}`} />
                        </Button>
                        {(isAdmin || note.created_by === user?.id) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Detail modal for viewing full note content with replies */}
            <Dialog open={detailModalOpen} onOpenChange={(open) => {
              if (!open) handleDetailModalClose();
            }}>
              <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 pr-8">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    <span className="truncate">{selectedNote?.title}</span>
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    메모 상세 내용
                  </DialogDescription>
                </DialogHeader>
                
                {selectedNote && (
                  <ScrollArea className="flex-1 max-h-[60vh]">
                    <div className="space-y-4 pr-4">
                      {/* Status badges row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {getPriorityBadge(selectedNote.priority)}
                        <Badge variant={selectedNote.status === 'done' ? 'secondary' : 'outline'}>
                          {selectedNote.status === 'done' ? '완료' : '미완료'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {getTargetLabel(selectedNote)}
                        </span>
                      </div>
                      
                      {/* Metadata */}
                      <div className="grid grid-cols-2 gap-3 text-sm border rounded-lg p-3 bg-muted/30">
                        <div>
                          <span className="text-muted-foreground">작성자:</span>
                          <span className="ml-1 font-medium">{selectedNote.creator_name || '알 수 없음'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">작성일시:</span>
                          <span className="ml-1 font-medium">
                            {format(new Date(selectedNote.created_at), 'yyyy년 M월 d일 HH:mm', { locale: ko })}
                          </span>
                        </div>
                        {selectedNote.due_date && (
                          <div>
                            <span className="text-muted-foreground">기한:</span>
                            <span className="ml-1 font-medium">{selectedNote.due_date}</span>
                          </div>
                        )}
                        {selectedNote.status === 'done' && selectedNote.done_by_name && (
                          <div>
                            <span className="text-muted-foreground">완료:</span>
                            <span className="ml-1 font-medium text-green-600">{selectedNote.done_by_name}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Full content */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-muted-foreground">내용</Label>
                          {selectedNote.body && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={handleCopyBody}
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
                          {selectedNote.body ? (
                            <p className="text-sm whitespace-pre-wrap break-words">{selectedNote.body}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">내용 없음</p>
                          )}
                        </div>
                      </div>
                      
                      {/* Attachments in modal */}
                      {selectedNote.attachments && selectedNote.attachments.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">첨부파일</Label>
                          <div className="flex flex-wrap gap-2">
                            {selectedNote.attachments.map((att) => (
                              <Button
                                key={att.id}
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleDownloadAttachment(att.storage_path, att.original_name)}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                {att.original_name}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                      
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
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
