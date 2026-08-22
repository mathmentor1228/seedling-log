import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Link as LinkIcon, Trash2, Settings2, MessageSquare, Send,
  LayoutGrid, Table as TableIcon, X, Calendar, Filter, ClipboardList,
  HelpCircle, CheckCircle2, Clock, AlertCircle, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArchiveNotice } from '@/components/layout/ArchiveNotice';

const PAIR_EMAILS = ['engmentor0201@gmail.com', 'assistanteng99@gmail.com'];
const TEACHER_EMAIL = 'engmentor0201@gmail.com';

type Kind = 'directive' | 'question' | 'reply';
type Status = 'todo' | 'doing' | 'done';
type Priority = 'low' | 'normal' | 'high' | 'urgent';

interface Msg {
  id: string;
  from_user_id: string;
  to_user_id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  link_urls: string[] | null;
  status: Status;
  done_at: string | null;
  created_at: string;
  kind: Kind;
  priority: Priority;
  due_at: string | null;
  parent_id: string | null;
  category_tags: string[] | null;
  assignee: string | null;
}

interface TagPreset {
  id: string;
  label: string;
  color: string;
  sort_order: number;
}

const COLOR_MAP: Record<string, string> = {
  slate: 'bg-slate-500/20 text-slate-200 border-slate-500/30',
  violet: 'bg-violet-500/20 text-violet-200 border-violet-500/30',
  amber: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  pink: 'bg-pink-500/20 text-pink-200 border-pink-500/30',
  blue: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
  emerald: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30',
  red: 'bg-red-500/20 text-red-200 border-red-500/30',
  stone: 'bg-stone-500/20 text-stone-200 border-stone-500/30',
};
const COLOR_OPTIONS = Object.keys(COLOR_MAP);

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  todo: { label: '시작 전', cls: 'bg-muted text-muted-foreground' },
  doing: { label: '진행 중', cls: 'bg-blue-500/20 text-blue-200 border-blue-500/30' },
  done: { label: '완료', cls: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30' },
};

const PRIORITY_META: Record<Priority, { label: string; cls: string }> = {
  low: { label: '낮음', cls: 'bg-muted text-muted-foreground' },
  normal: { label: '보통', cls: 'bg-secondary text-secondary-foreground' },
  high: { label: '높음', cls: 'bg-orange-500/20 text-orange-200 border-orange-500/30' },
  urgent: { label: '🔥 긴급', cls: 'bg-destructive/20 text-destructive border-destructive/30' },
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일`;
}

function dueChip(due: string | null, done: boolean) {
  if (!due) return null;
  const dt = new Date(due);
  const diffMs = dt.getTime() - Date.now();
  const overdue = diffMs < 0 && !done;
  const hrs = Math.round(diffMs / 36e5);
  const text = overdue ? `D+${Math.abs(Math.ceil(hrs / 24))}` : hrs < 24 ? `D-${Math.max(0, hrs)}h` : `D-${Math.ceil(hrs / 24)}`;
  return (
    <Badge variant="outline" className={cn('gap-1 text-[10px]', overdue && 'border-destructive/50 text-destructive')}>
      <Clock className="h-3 w-3" /> {text}
    </Badge>
  );
}

function ChannelInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [partner, setPartner] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [tagPresets, setTagPresets] = useState<TagPreset[]>([]);
  const [view, setView] = useState<'table' | 'card'>('table');
  const [tab, setTab] = useState<'todo' | 'doing' | 'week' | 'all'>('todo');
  const [composerOpen, setComposerOpen] = useState(false);
  const [tagMgrOpen, setTagMgrOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<Msg | null>(null);
  const [filterTag, setFilterTag] = useState<string>('all');

  const myEmail = (user?.email ?? '').toLowerCase();
  const isPairMember = PAIR_EMAILS.includes(myEmail);
  const isAdminViewer = !isPairMember; // 원장 등 관찰자
  const isTeacher = myEmail === TEACHER_EMAIL;
  const partnerEmail = useMemo(() => {
    if (isAdminViewer) return PAIR_EMAILS.find((e) => e !== TEACHER_EMAIL) ?? '';
    return PAIR_EMAILS.find((e) => e !== myEmail) ?? '';
  }, [myEmail, isAdminViewer]);
  const myName = isAdminViewer ? '원장(읽기 전용)' : isTeacher ? '김민희 선생님' : '최수린 조교';
  const partnerName = isTeacher ? '최수린 조교' : '김민희 선생님';
  const [teacherUser, setTeacherUser] = useState<{ id: string } | null>(null);

  useEffect(() => {
    (async () => {
      if (!partnerEmail) return;
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('email', partnerEmail)
        .maybeSingle();
      if (data) setPartner(data as any);
    })();
  }, [partnerEmail]);

  useEffect(() => {
    (async () => {
      if (!isAdminViewer) return;
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', TEACHER_EMAIL)
        .maybeSingle();
      if (data) setTeacherUser(data as any);
    })();
  }, [isAdminViewer]);

  const loadTags = async () => {
    const { data } = await supabase
      .from('private_channel_tags')
      .select('*')
      .order('sort_order', { ascending: true });
    setTagPresets((data ?? []) as any);
  };

  const loadMsgs = async () => {
    if (!partner) return;
    let query = supabase.from('private_messages').select('*');
    if (isAdminViewer) {
      if (!teacherUser) return;
      const a = teacherUser.id, b = partner.id;
      query = query.or(
        `and(from_user_id.eq.${a},to_user_id.eq.${b}),and(from_user_id.eq.${b},to_user_id.eq.${a})`,
      );
    } else {
      if (!user) return;
      query = query.or(
        `and(from_user_id.eq.${user.id},to_user_id.eq.${partner.id}),and(from_user_id.eq.${partner.id},to_user_id.eq.${user.id})`,
      );
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return toast({ title: '불러오기 실패', description: error.message, variant: 'destructive' });
    setMsgs((data ?? []) as any);
  };

  useEffect(() => { void loadTags(); }, []);
  useEffect(() => { void loadMsgs(); }, [user?.id, partner?.id, teacherUser?.id]);


  useEffect(() => {
    if (!user || !partner) return;
    const ch = supabase
      .channel(`pm-${user.id}-${partner.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_messages' }, () => void loadMsgs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_channel_tags' }, () => void loadTags())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, partner?.id]);

  const tagColor = (label: string) => {
    const p = tagPresets.find((t) => t.label === label);
    return COLOR_MAP[p?.color ?? 'slate'] ?? COLOR_MAP.slate;
  };

  const tops = msgs.filter((m) => !m.parent_id && m.kind !== 'reply');
  const repliesOf = (id: string) => msgs.filter((m) => m.parent_id === id).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

  const filtered = useMemo(() => {
    let arr = tops;
    if (tab === 'todo') arr = arr.filter((m) => m.status === 'todo');
    else if (tab === 'doing') arr = arr.filter((m) => m.status === 'doing');
    else if (tab === 'week') {
      const now = Date.now();
      const weekMs = 7 * 24 * 36e5;
      arr = arr.filter((m) => {
        if (m.status === 'done') return false;
        if (!m.due_at) return false;
        const d = new Date(m.due_at).getTime();
        return d - now <= weekMs;
      });
    }
    if (filterTag !== 'all') arr = arr.filter((m) => (m.category_tags ?? []).includes(filterTag));
    return arr;
  }, [tops, tab, filterTag]);

  const removeMsg = async (id: string) => {
    if (!confirm('삭제할까요?')) return;
    await supabase.from('private_messages').delete().eq('id', id);
  };

  const updateStatus = async (id: string, status: Status) => {
    await supabase.from('private_messages').update({
      status,
      done_at: status === 'done' ? new Date().toISOString() : null,
    }).eq('id', id);
  };

  const counts = {
    todo: tops.filter((m) => m.status === 'todo').length,
    doing: tops.filter((m) => m.status === 'doing').length,
    week: tops.filter((m) => m.status !== 'done' && m.due_at && new Date(m.due_at).getTime() - Date.now() <= 7 * 24 * 36e5).length,
    all: tops.length,
  };

  return (
    <div className="space-y-4 pb-10 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">📋 조교업무 리스트</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {partner ? `${myName} ↔ ${partnerName} · 실시간 동기화` : '상대 계정 로드 중…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button onClick={() => setView('table')} className={cn('px-2.5 py-1.5 rounded-sm text-xs flex items-center gap-1', view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              <TableIcon className="h-3.5 w-3.5" /> 표
            </button>
            <button onClick={() => setView('card')} className={cn('px-2.5 py-1.5 rounded-sm text-xs flex items-center gap-1', view === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              <LayoutGrid className="h-3.5 w-3.5" /> 카드
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setTagMgrOpen(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" /> 태그 관리
          </Button>
          <Button size="sm" onClick={() => setComposerOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> 새로 만들기
          </Button>
        </div>
      </div>

      {/* Tabs + Filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="todo">📝 해야하는 일 ({counts.todo})</TabsTrigger>
            <TabsTrigger value="doing">⏳ ing ({counts.doing})</TabsTrigger>
            <TabsTrigger value="week">📅 이번주업무 ({counts.week})</TabsTrigger>
            <TabsTrigger value="all">📊 전체 ({counts.all})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={filterTag} onValueChange={setFilterTag}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="태그로 필터" /></SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="all">전체 태그</SelectItem>
              {tagPresets.map((t) => <SelectItem key={t.id} value={t.label}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* TABLE VIEW */}
      {view === 'table' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs">👤 업무요청자</TableHead>
                  <TableHead className="text-xs">📅 요청일자</TableHead>
                  <TableHead className="text-xs">⏰ 마감일자</TableHead>
                  <TableHead className="text-xs">🙋 담당자</TableHead>
                  <TableHead className="text-xs">🔥 우선순위</TableHead>
                  <TableHead className="text-xs min-w-[200px]">🏷 업무내용</TableHead>
                  <TableHead className="text-xs min-w-[220px]">📄 상세설명</TableHead>
                  <TableHead className="text-xs">⚙ 상태</TableHead>
                  <TableHead className="text-xs min-w-[180px]">💬 특이사항/답글</TableHead>
                  <TableHead className="text-xs">🔗 링크</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-12 text-sm">업무가 없습니다. 우측 상단 "새로 만들기"로 추가하세요.</TableCell></TableRow>
                )}
                {filtered.map((m) => {
                  const requester = m.from_user_id === user?.id ? myName : partnerName;
                  const replies = repliesOf(m.id);
                  return (
                    <TableRow key={m.id} className="cursor-pointer hover:bg-muted/20" onClick={() => setDetailOpen(m)}>
                      <TableCell className="text-xs">{requester}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(m.created_at)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{fmtDate(m.due_at)}</span>
                          {dueChip(m.due_at, m.status === 'done')}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{m.assignee || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px]', PRIORITY_META[m.priority].cls)}>
                          {PRIORITY_META[m.priority].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(m.category_tags ?? []).map((t) => (
                            <span key={t} className={cn('text-[10px] px-1.5 py-0.5 rounded border', tagColor(t))}>{t}</span>
                          ))}
                          {(!m.category_tags || m.category_tags.length === 0) && <span className="text-[10px] text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium line-clamp-1">{m.title}</div>
                        {m.body && <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{m.body}</div>}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select value={m.status} onValueChange={(v) => updateStatus(m.id, v as Status)}>
                          <SelectTrigger className={cn('h-7 text-[11px] gap-1 border w-[88px]', STATUS_META[m.status].cls)}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todo">시작 전</SelectItem>
                            <SelectItem value="doing">진행 중</SelectItem>
                            <SelectItem value="done">완료</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-[11px]">
                        {replies.length > 0 ? (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MessageSquare className="h-3 w-3" /> {replies.length}개 답글
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-0.5">
                          {(m.link_urls ?? []).slice(0, 2).map((u, i) => (
                            <a key={i} href={u} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 max-w-[140px] truncate">
                              <LinkIcon className="h-3 w-3 shrink-0" /> 링크{i + 1}
                            </a>
                          ))}
                          {(m.link_urls?.length ?? 0) > 2 && <span className="text-[10px] text-muted-foreground">+{(m.link_urls?.length ?? 0) - 2}</span>}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {m.from_user_id === user?.id && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMsg(m.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* CARD VIEW */}
      {view === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.length === 0 && <div className="col-span-full text-center text-sm text-muted-foreground py-12">업무가 없습니다.</div>}
          {filtered.map((m) => {
            const replies = repliesOf(m.id);
            return (
              <Card key={m.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setDetailOpen(m)}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={cn('text-[10px]', STATUS_META[m.status].cls)}>{STATUS_META[m.status].label}</Badge>
                    {m.priority !== 'normal' && <Badge variant="outline" className={cn('text-[10px]', PRIORITY_META[m.priority].cls)}>{PRIORITY_META[m.priority].label}</Badge>}
                    {dueChip(m.due_at, m.status === 'done')}
                  </div>
                  <div className="font-semibold text-sm line-clamp-2">{m.title}</div>
                  {m.body && <div className="text-xs text-muted-foreground line-clamp-2">{m.body}</div>}
                  <div className="flex flex-wrap gap-1">
                    {(m.category_tags ?? []).map((t) => (
                      <span key={t} className={cn('text-[10px] px-1.5 py-0.5 rounded border', tagColor(t))}>{t}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border">
                    <span>{m.assignee || '미지정'}</span>
                    {replies.length > 0 && <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{replies.length}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Composer Dialog */}
      <ComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        user={user}
        partner={partner}
        tagPresets={tagPresets}
        isTeacher={isTeacher}
        onSaved={() => setComposerOpen(false)}
        myName={myName}
        partnerName={partnerName}
      />

      {/* Detail Dialog */}
      {detailOpen && (
        <DetailDialog
          msg={detailOpen}
          onClose={() => setDetailOpen(null)}
          replies={repliesOf(detailOpen.id)}
          user={user}
          partner={partner}
          tagPresets={tagPresets}
          myName={myName}
          partnerName={partnerName}
        />
      )}

      {/* Tag Manager */}
      <TagManagerDialog open={tagMgrOpen} onOpenChange={setTagMgrOpen} presets={tagPresets} onChanged={loadTags} />
    </div>
  );
}

/* ---------- Composer ---------- */
function ComposerDialog({
  open, onOpenChange, user, partner, tagPresets, isTeacher, onSaved, myName, partnerName,
}: any) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [links, setLinks] = useState<string[]>(['']);
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueAt, setDueAt] = useState('');
  const [assignee, setAssignee] = useState<string>(isTeacher ? partnerName : myName);
  const [kind, setKind] = useState<Kind>(isTeacher ? 'directive' : 'question');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle(''); setBody(''); setTags([]); setLinks(['']);
      setPriority('normal'); setDueAt(''); setAssignee(isTeacher ? partnerName : myName);
      setKind(isTeacher ? 'directive' : 'question');
    }
  }, [open, isTeacher, partnerName, myName]);

  const send = async () => {
    if (!user || !partner || !title.trim()) {
      return toast({ title: '입력 필요', description: '제목을 입력해주세요.', variant: 'destructive' });
    }
    setLoading(true);
    const cleanLinks = links.map((l) => l.trim()).filter(Boolean);
    const { error } = await supabase.from('private_messages').insert({
      from_user_id: user.id,
      to_user_id: partner.id,
      title: title.trim(),
      body: body.trim() || null,
      link_url: cleanLinks[0] ?? null,
      link_urls: cleanLinks,
      kind,
      priority,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      category_tags: tags,
      assignee,
    });
    setLoading(false);
    if (error) return toast({ title: '저장 실패', description: error.message, variant: 'destructive' });
    toast({ title: '저장 완료' });
    onSaved();
  };

  const toggleTag = (t: string) => setTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> 새 업무 만들기
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isTeacher && (
            <div className="inline-flex rounded-md border border-border p-0.5">
              {(['directive', 'question'] as Kind[]).map((k) => (
                <button key={k} onClick={() => setKind(k)} className={cn('px-3 py-1 text-xs rounded-sm', kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                  {k === 'directive' ? '📋 업무지시' : '❓ 질문/공유'}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">업무 제목 *</label>
            <Input placeholder="예: 고2 수학미적분테스트지 인쇄" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">마감일자</label>
              <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">담당자</label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={myName}>{myName}</SelectItem>
                  <SelectItem value={partnerName}>{partnerName}</SelectItem>
                  <SelectItem value="공동">공동</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">우선순위</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">낮음</SelectItem>
                  <SelectItem value="normal">보통</SelectItem>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="urgent">🔥 긴급</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">업무내용 태그 (여러 개 선택)</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between mt-1 h-auto min-h-9 py-1.5">
                  <div className="flex flex-wrap gap-1 items-center">
                    {tags.length === 0 ? <span className="text-muted-foreground text-xs">태그 선택…</span> : tags.map((t) => {
                      const p = tagPresets.find((x: TagPreset) => x.label === t);
                      return <span key={t} className={cn('text-[10px] px-1.5 py-0.5 rounded border', COLOR_MAP[p?.color ?? 'slate'])}>{t}</span>;
                    })}
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 max-h-80 overflow-y-auto p-2">
                <div className="flex flex-wrap gap-1.5">
                  {tagPresets.map((t: TagPreset) => {
                    const active = tags.includes(t.label);
                    return (
                      <button key={t.id} onClick={() => toggleTag(t.label)} className={cn('text-[11px] px-2 py-1 rounded border transition-opacity', COLOR_MAP[t.color], !active && 'opacity-40 hover:opacity-100')}>
                        {active && '✓ '}{t.label}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">업무 상세내용 설명</label>
            <Textarea placeholder="상세 내용 입력…" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1"><LinkIcon className="h-3 w-3" /> 자료 링크 (여러 개)</label>
            <div className="space-y-1.5 mt-1">
              {links.map((l, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input placeholder="https://..." value={l} onChange={(e) => setLinks((p) => p.map((x, idx) => idx === i ? e.target.value : x))} />
                  <Button variant="ghost" size="icon" onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLinks((p) => [...p, ''])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> 링크 추가
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button onClick={send} disabled={loading || !title.trim()}>
              <Send className="h-4 w-4 mr-1" /> {loading ? '저장 중…' : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Detail (with realtime replies) ---------- */
function DetailDialog({ msg, onClose, replies, user, partner, tagPresets, myName, partnerName }: any) {
  const [reply, setReply] = useState('');
  const [note, setNote] = useState(msg.body ?? '');
  const { toast } = useToast();

  const sendReply = async () => {
    if (!reply.trim() || !user || !partner) return;
    const { error } = await supabase.from('private_messages').insert({
      from_user_id: user.id,
      to_user_id: msg.from_user_id === user.id ? msg.to_user_id : msg.from_user_id,
      title: `RE: ${msg.title}`,
      body: reply.trim(),
      kind: 'reply',
      parent_id: msg.id,
    });
    if (error) return toast({ title: '답글 실패', description: error.message, variant: 'destructive' });
    setReply('');
  };

  const saveNote = async () => {
    await supabase.from('private_messages').update({ body: note }).eq('id', msg.id);
    toast({ title: '저장됨' });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{msg.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">요청자:</span> {msg.from_user_id === user?.id ? myName : partnerName}</div>
            <div><span className="text-muted-foreground">담당자:</span> {msg.assignee || '—'}</div>
            <div><span className="text-muted-foreground">요청일:</span> {fmtDate(msg.created_at)}</div>
            <div><span className="text-muted-foreground">마감일:</span> {fmtDate(msg.due_at)}</div>
          </div>

          {(msg.category_tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {msg.category_tags.map((t: string) => {
                const p = tagPresets.find((x: TagPreset) => x.label === t);
                return <span key={t} className={cn('text-[10px] px-1.5 py-0.5 rounded border', COLOR_MAP[p?.color ?? 'slate'])}>{t}</span>;
              })}
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground">상세 설명 / 특이사항</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
            <Button variant="outline" size="sm" className="mt-1.5" onClick={saveNote}>저장</Button>
          </div>

          {(msg.link_urls ?? []).length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground">링크</label>
              <div className="space-y-1 mt-1">
                {msg.link_urls.map((u: string, i: number) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:underline break-all">
                    <LinkIcon className="h-3 w-3 inline mr-1" />{u}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border pt-3">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> 실시간 답글 ({replies.length})
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {replies.map((r: Msg) => {
                const mine = r.from_user_id === user?.id;
                return (
                  <div key={r.id} className={cn('text-xs p-2 rounded', mine ? 'bg-primary/10 ml-6' : 'bg-muted mr-6')}>
                    <div className="text-[10px] text-muted-foreground mb-0.5">
                      {mine ? '나' : partnerName} · {new Date(r.created_at).toLocaleString('ko-KR')}
                    </div>
                    <div className="whitespace-pre-wrap">{r.body}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-2">
              <Input placeholder="답글…" value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void sendReply(); } }} />
              <Button size="sm" onClick={sendReply} disabled={!reply.trim()}><Send className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Tag Manager ---------- */
function TagManagerDialog({ open, onOpenChange, presets, onChanged }: { open: boolean; onOpenChange: (v: boolean) => void; presets: TagPreset[]; onChanged: () => void }) {
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('slate');
  const { toast } = useToast();

  const add = async () => {
    if (!newLabel.trim()) return;
    const { error } = await supabase.from('private_channel_tags').insert({
      label: newLabel.trim(),
      color: newColor,
      sort_order: (presets[presets.length - 1]?.sort_order ?? 0) + 10,
    });
    if (error) return toast({ title: '추가 실패', description: error.message, variant: 'destructive' });
    setNewLabel('');
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm('삭제할까요?')) return;
    await supabase.from('private_channel_tags').delete().eq('id', id);
    onChanged();
  };

  const updateColor = async (id: string, color: string) => {
    await supabase.from('private_channel_tags').update({ color }).eq('id', id);
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> 업무내용 태그 관리</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="새 태그 이름…" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <Select value={newColor} onValueChange={setNewColor}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className={cn('inline-block w-3 h-3 rounded-full mr-2', COLOR_MAP[c])} />{c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={add}><Plus className="h-4 w-4" /></Button>
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {presets.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border">
                <span className={cn('text-xs px-2 py-0.5 rounded border', COLOR_MAP[t.color])}>{t.label}</span>
                <div className="flex items-center gap-1">
                  <Select value={t.color} onValueChange={(v) => updateColor(t.id, v)}>
                    <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLOR_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          <span className={cn('inline-block w-2.5 h-2.5 rounded-full mr-2', COLOR_MAP[c])} />{c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => remove(t.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PrivateChannelPage() {
  const { user, role } = useAuth();
  const email = user?.email?.toLowerCase() ?? '';
  const isAllowed = PAIR_EMAILS.includes(email) || role === 'admin';

  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <div className="space-y-3">
        <ArchiveNotice to="/admin/office" label="행정 업무" />
      {isAllowed ? (
        <ChannelInner />
      ) : (
        <div className="text-center text-muted-foreground py-10">
          이 채널은 지정된 두 분(김민희 ↔ 최수린)만 사용할 수 있습니다.
        </div>
      )}
    </div>
    </ProtectedRoute>
  );
}
