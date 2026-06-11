import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Link as LinkIcon, Send, Trash2 } from 'lucide-react';

// Allowed pair (김민희 ↔ 최수린)
const PAIR_EMAILS = ['engmentor0201@gmail.com', 'assistanteng99@gmail.com'];

interface Msg {
  id: string;
  from_user_id: string;
  to_user_id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  status: 'todo' | 'done';
  done_at: string | null;
  created_at: string;
}

function ChannelInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [partner, setPartner] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'all' | 'todo' | 'done'>('todo');

  const myEmail = user?.email?.toLowerCase() ?? '';
  const partnerEmail = useMemo(
    () => PAIR_EMAILS.find((e) => e !== myEmail) ?? '',
    [myEmail]
  );

  useEffect(() => {
    (async () => {
      if (!partnerEmail) return;
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('email', partnerEmail)
        .single();
      if (data) setPartner(data as any);
    })();
  }, [partnerEmail]);

  const load = async () => {
    if (!user || !partner) return;
    const { data, error } = await supabase
      .from('private_messages')
      .select('*')
      .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${partner.id}),and(from_user_id.eq.${partner.id},to_user_id.eq.${user.id})`)
      .order('created_at', { ascending: false });
    if (error) { toast({ title: '불러오기 실패', description: error.message, variant: 'destructive' }); return; }
    setMsgs((data ?? []) as any);
  };

  useEffect(() => { void load(); }, [user?.id, partner?.id]);

  useEffect(() => {
    if (!user || !partner) return;
    const ch = supabase
      .channel(`pm-${user.id}-${partner.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_messages' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, partner?.id]);

  const send = async () => {
    if (!user || !partner || !title.trim()) return;
    setLoading(true);
    const { error } = await supabase.from('private_messages').insert({
      from_user_id: user.id, to_user_id: partner.id,
      title: title.trim(), body: body.trim() || null, link_url: link.trim() || null,
    });
    setLoading(false);
    if (error) { toast({ title: '전송 실패', description: error.message, variant: 'destructive' }); return; }
    setTitle(''); setBody(''); setLink('');
    toast({ title: '전송 완료' });
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

  const filtered = msgs.filter((m) => tab === 'all' ? true : m.status === tab);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {partner ? `${partner.full_name}님과의 업무 채널` : '대화 상대 로드 중…'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="업무 제목 (예: 단어 시험 출제)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="상세 내용 (선택)" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          <Input placeholder="자료 링크 (https://...)" value={link} onChange={(e) => setLink(e.target.value)} />
          <div className="flex justify-end">
            <Button onClick={send} disabled={!title.trim() || loading || !partner}>
              <Send className="w-4 h-4 mr-2" /> 전송
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {(['todo', 'done', 'all'] as const).map((t) => (
          <Button key={t} variant={tab === t ? 'default' : 'outline'} size="sm" onClick={() => setTab(t)}>
            {t === 'todo' ? '진행중' : t === 'done' ? '완료' : '전체'}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">메시지가 없습니다.</div>}
        {filtered.map((m) => {
          const mine = m.from_user_id === user?.id;
          return (
            <Card key={m.id} className={m.status === 'done' ? 'opacity-60' : ''}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <Checkbox checked={m.status === 'done'} onCheckedChange={(c) => toggleDone(m, !!c)} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={mine ? 'secondary' : 'default'} className="text-xs">
                        {mine ? '내가 보냄' : '받음'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleString('ko-KR')}
                      </span>
                      {m.status === 'done' && <Badge variant="outline" className="text-xs">완료</Badge>}
                    </div>
                    <div className={`font-medium mt-1 ${m.status === 'done' ? 'line-through' : ''}`}>{m.title}</div>
                    {m.body && <div className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{m.body}</div>}
                    {m.link_url && (
                      <a href={m.link_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1">
                        <LinkIcon className="w-3 h-3" /> {m.link_url}
                      </a>
                    )}
                  </div>
                  {mine && (
                    <Button variant="ghost" size="icon" onClick={() => remove(m.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
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
        <div className="text-center text-muted-foreground py-10">이 채널은 지정된 두 분(김민희 ↔ 최수린)만 사용할 수 있습니다.</div>
      )}
    </ProtectedRoute>
  );
}
