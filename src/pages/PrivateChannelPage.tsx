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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Link as LinkIcon, Send, Trash2, MessageSquare, AlertCircle, Clock, CheckCircle2, ClipboardList, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAIR_EMAILS = ['engmentor0201@gmail.com', 'assistanteng99@gmail.com'];
const TEACHER_EMAIL = 'engmentor0201@gmail.com';

type Kind = 'directive' | 'question' | 'reply';
type Status = 'todo' | 'done';
type Priority = 'low' | 'normal' | 'high' | 'urgent';

interface Msg {
  id: string;
  from_user_id: string;
  to_user_id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  status: Status;
  done_at: string | null;
  created_at: string;
  kind: Kind;
  priority: Priority;
  due_at: string | null;
  parent_id: string | null;
}

const priorityMeta: Record<Priority, { label: string; cls: string }> = {
  low: { label: '낮음', cls: 'bg-muted text-muted-foreground' },
  normal: { label: '보통', cls: 'bg-secondary text-secondary-foreground' },
  high: { label: '높음', cls: 'bg-orange-500/15 text-orange-500 border-orange-500/30' },
  urgent: { label: '긴급', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
};

function dueChip(due: string | null, done: boolean) {
  if (!due) return null;
  const d = new Date(due);
  const diffMs = d.getTime() - Date.now();
  const overdue = diffMs < 0 && !done;
  const hrs = Math.round(diffMs / 36e5);
  const text = overdue
    ? `마감 ${Math.abs(hrs)}시간 지남`
    : hrs < 24
    ? `D-${hrs}h`
    : `~${d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  return (
    <Badge variant="outline" className={cn('text-[10px] gap-1', overdue && 'border-destructive/40 text-destructive')}>
      <Clock className="w-3 h-3" /> {text}
    </Badge>
  );
}

function ChannelInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [partner, setPartner] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);

  const myEmail = (user?.email ?? '').toLowerCase();
  const isTeacher = myEmail === TEACHER_EMAIL;
  const partnerEmail = useMemo(() => PAIR_EMAILS.find((e) => e !== myEmail) ?? '', [myEmail]);

  // Composer state
  const defaultKind: Kind = isTeacher ? 'directive' : 'question';
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueAt, setDueAt] = useState<string>('');
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'directive' | 'question'>(isTeacher ? 'directive' : 'question');

  useEffect(() => {
    (async () => {
      if (!partnerEmail) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('email', partnerEmail)
        .maybeSingle();
      if (error) console.error('partner lookup failed', error);
      if (data) setPartner(data as any);
    })();
  }, [partnerEmail]);

  const load = async () => {
    if (!user || !partner) return;
    const { data, error } = await supabase
      .from('private_messages')
      .select('*')
      .or(
        `and(from_user_id.eq.${user.id},to_user_id.eq.${partner.id}),and(from_user_id.eq.${partner.id},to_user_id.eq.${user.id})`
      )
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: '불러오기 실패', description: error.message, variant: 'destructive' });
      return;
    }
    setMsgs((data ?? []) as any);
  };

  useEffect(() => {
    void load();
  }, [user?.id, partner?.id]);

  useEffect(() => {
    if (!user || !partner) return;
    const ch = supabase
      .channel(`pm-${user.id}-${partner.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_messages' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, partner?.id]);

  const send = async () => {
    if (!user || !partner || !title.trim()) {
      toast({ title: '전송 불가', description: !partner ? '상대방 계정을 찾지 못했습니다.' : '제목을 입력해주세요.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('private_messages').insert({
      from_user_id: user.id,
      to_user_id: partner.id,
      title: title.trim(),
      body: body.trim() || null,
      link_url: link.trim() || null,
      kind,
      priority,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setLoading(false);
    if (error) {
      toast({ title: '전송 실패', description: error.message, variant: 'destructive' });
      return;
    }
    setTitle('');
    setBody('');
    setLink('');
    setDueAt('');
    setPriority('normal');
    toast({ title: kind === 'directive' ? '업무지시 전송 완료' : '질문 전송 완료' });
  };

  const sendReply = async (parent: Msg) => {
    if (!user || !partner) return;
    const text = (replyText[parent.id] || '').trim();
    if (!text) return;
    const { error } = await supabase.from('private_messages').insert({
      from_user_id: user.id,
      to_user_id: parent.from_user_id === user.id ? parent.to_user_id : parent.from_user_id,
      title: `RE: ${parent.title}`,
      body: text,
      kind: 'reply',
      parent_id: parent.id,
    });
    if (error) {
      toast({ title: '답글 실패', description: error.message, variant: 'destructive' });
      return;
    }
    setReplyText((p) => ({ ...p, [parent.id]: '' }));
  };

  const toggleDone = async (m: Msg, checked: boolean) => {
    await supabase
      .from('private_messages')
      .update({ status: checked ? 'done' : 'todo', done_at: checked ? new Date().toISOString() : null })
      .eq('id', m.id);
  };

  const remove = async (id: string) => {
    if (!confirm('삭제할까요?')) return;
    await supabase.from('private_messages').delete().eq('id', id);
  };

  // Group: top-level by kind; replies are children
  const topByKind = (k: Kind) => msgs.filter((m) => m.kind === k && !m.parent_id);
  const repliesOf = (id: string) => msgs.filter((m) => m.parent_id === id).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

  const renderCard = (m: Msg) => {
    const mine = m.from_user_id === user?.id;
    const replies = repliesOf(m.id);
    const isDirective = m.kind === 'directive';
    return (
      <Card key={m.id} className={cn('overflow-hidden', m.status === 'done' && 'opacity-70')}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            {isDirective && (
              <Checkbox checked={m.status === 'done'} onCheckedChange={(c) => toggleDone(m, !!c)} className="mt-1" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <Badge variant={isDirective ? 'default' : 'secondary'} className="text-[10px] gap-1">
                  {isDirective ? <ClipboardList className="w-3 h-3" /> : <HelpCircle className="w-3 h-3" />}
                  {isDirective ? '업무지시' : '질문'}
                </Badge>
                {m.priority !== 'normal' && (
                  <Badge variant="outline" className={cn('text-[10px]', priorityMeta[m.priority].cls)}>
                    {m.priority === 'urgent' && <AlertCircle className="w-3 h-3 mr-1" />}
                    {priorityMeta[m.priority].label}
                  </Badge>
                )}
                {dueChip(m.due_at, m.status === 'done')}
                {m.status === 'done' && (
                  <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-500">
                    <CheckCircle2 className="w-3 h-3" /> 완료
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {mine ? '내가 보냄' : '받음'}
                </Badge>
              </div>
              <div className={cn('font-semibold text-base leading-snug', m.status === 'done' && 'line-through')}>
                {m.title}
              </div>
              {m.body && <div className="text-sm text-muted-foreground whitespace-pre-wrap mt-1.5">{m.body}</div>}
              {m.link_url && (
                <a
                  href={m.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2 break-all"
                >
                  <LinkIcon className="w-3.5 h-3.5" /> {m.link_url}
                </a>
              )}
              <div className="text-[11px] text-muted-foreground mt-2">
                {new Date(m.created_at).toLocaleString('ko-KR')}
              </div>
            </div>
            {mine && (
              <Button variant="ghost" size="icon" onClick={() => remove(m.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>

          {/* Replies thread */}
          {replies.length > 0 && (
            <div className="ml-6 pl-3 border-l border-border space-y-2">
              {replies.map((r) => {
                const rmine = r.from_user_id === user?.id;
                return (
                  <div key={r.id} className="text-sm">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant={rmine ? 'secondary' : 'outline'} className="text-[10px]">
                        {rmine ? '나' : partner?.full_name ?? '상대'}
                      </Badge>
                      {new Date(r.created_at).toLocaleString('ko-KR')}
                      {rmine && (
                        <button onClick={() => remove(r.id)} className="ml-auto text-destructive hover:underline">
                          삭제
                        </button>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap mt-0.5">{r.body}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reply composer */}
          <div className="flex gap-2 ml-6 pl-3 border-l border-border">
            <Input
              placeholder="실시간 답글…"
              value={replyText[m.id] ?? ''}
              onChange={(e) => setReplyText((p) => ({ ...p, [m.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendReply(m);
                }
              }}
              className="h-8 text-sm"
            />
            <Button size="sm" variant="secondary" onClick={() => sendReply(m)} disabled={!(replyText[m.id] || '').trim()}>
              <MessageSquare className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">영어팀 업무 채널</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {partner ? `${partner.full_name}님과 연결됨 · 실시간 동기화` : '상대 계정 로드 중…'}
          </p>
        </div>
        {!partner && partnerEmail && (
          <Badge variant="destructive" className="text-xs">상대 프로필을 찾을 수 없어요 ({partnerEmail})</Badge>
        )}
      </div>

      {/* Composer */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {isTeacher ? (
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(['directive', 'question'] as Kind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={cn(
                      'px-3 py-1 text-xs rounded-sm transition-colors',
                      kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {k === 'directive' ? '📋 업무지시' : '❓ 질문/공유'}
                  </button>
                ))}
              </div>
            ) : (
              <Badge variant="secondary" className="text-xs gap-1">
                <HelpCircle className="w-3 h-3" /> 선생님께 질문/요청 보내기
              </Badge>
            )}
          </div>

          <Input
            placeholder={kind === 'directive' ? '업무 제목 (예: 단어 시험 출제)' : '질문/요청 제목 (예: 6월 단어시험 범위 확인)'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="상세 내용 (선택)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
          />
          <Input placeholder="자료 링크 (https://...)" value={link} onChange={(e) => setLink(e.target.value)} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(isTeacher && kind === 'directive') && (
              <>
                <div>
                  <label className="text-[11px] text-muted-foreground">마감 기한</label>
                  <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">우선순위</label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">낮음</SelectItem>
                      <SelectItem value="normal">보통</SelectItem>
                      <SelectItem value="high">높음</SelectItem>
                      <SelectItem value="urgent">긴급</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={send} disabled={!title.trim() || loading}>
              <Send className="w-4 h-4 mr-2" />
              {loading ? '전송 중…' : '전송'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: directives vs questions */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="directive" className="gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" /> 업무지시 ({topByKind('directive').length})
          </TabsTrigger>
          <TabsTrigger value="question" className="gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" /> 질문/요청 ({topByKind('question').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="directive" className="space-y-2 mt-3">
          {topByKind('directive').length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-10">업무지시가 없습니다.</div>
          )}
          {topByKind('directive')
            .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
            .map(renderCard)}
        </TabsContent>

        <TabsContent value="question" className="space-y-2 mt-3">
          {topByKind('question').length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-10">질문/요청이 없습니다.</div>
          )}
          {topByKind('question').map(renderCard)}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PrivateChannelPage() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() ?? '';
  const isAllowed = PAIR_EMAILS.includes(email);

  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      {isAllowed ? (
        <ChannelInner />
      ) : (
        <div className="text-center text-muted-foreground py-10">
          이 채널은 지정된 두 분(김민희 ↔ 최수린)만 사용할 수 있습니다.
        </div>
      )}
    </ProtectedRoute>
  );
}
