import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth, isAdmin } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { LogIn, LogOut, Plus, Trash2, Pencil } from 'lucide-react';

interface Log {
  id: string;
  assistant_user_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  total_minutes: number | null;
  notes: string | null;
}

interface Profile { id: string; full_name: string; email: string; }

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string) {
  return new Date(s).toISOString();
}

function fmtMin(min: number | null) {
  if (min == null) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}시간 ${m}분`;
}

function WorkLogsInner() {
  const { user, role } = useAuth();
  const admin = isAdmin(role);
  const { toast } = useToast();
  const [assistants, setAssistants] = useState<Profile[]>([]);
  const [viewUserId, setViewUserId] = useState<string>('');
  const [logs, setLogs] = useState<Log[]>([]);
  const [openLog, setOpenLog] = useState<Log | null>(null);
  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [editing, setEditing] = useState<Log | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ clock_in_at: '', clock_out_at: '', notes: '' });

  // Load assistants list (admin only)
  useEffect(() => {
    if (!admin) { setViewUserId(user?.id ?? ''); return; }
    (async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'assistant');
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length === 0) return;
      const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
      const list = (profs ?? []) as Profile[];
      setAssistants(list);
      setViewUserId((prev) => prev || list[0]?.id || '');
    })();
  }, [admin, user?.id]);

  const targetUserId = admin ? viewUserId : user?.id ?? '';

  const load = async () => {
    if (!targetUserId) return;
    const [y, m] = monthFilter.split('-').map(Number);
    const start = new Date(y, m - 1, 1).toISOString();
    const end = new Date(y, m, 1).toISOString();
    const { data, error } = await supabase
      .from('assistant_work_logs')
      .select('*')
      .eq('assistant_user_id', targetUserId)
      .gte('clock_in_at', start)
      .lt('clock_in_at', end)
      .order('clock_in_at', { ascending: false });
    if (error) { toast({ title: '오류', description: error.message, variant: 'destructive' }); return; }
    setLogs((data ?? []) as any);
    setOpenLog((data ?? []).find((l: any) => !l.clock_out_at) ?? null);
  };

  useEffect(() => { void load(); }, [targetUserId, monthFilter]);

  const clockIn = async () => {
    if (!user) return;
    const { error } = await supabase.from('assistant_work_logs').insert({
      assistant_user_id: user.id, clock_in_at: new Date().toISOString(),
    });
    if (error) toast({ title: '출근 실패', description: error.message, variant: 'destructive' });
    else { toast({ title: '출근 기록됨' }); await load(); }
  };

  const clockOut = async () => {
    if (!openLog) return;
    const { error } = await supabase.from('assistant_work_logs')
      .update({ clock_out_at: new Date().toISOString() })
      .eq('id', openLog.id);
    if (error) toast({ title: '퇴근 실패', description: error.message, variant: 'destructive' });
    else { toast({ title: '퇴근 기록됨' }); await load(); }
  };

  const saveEdit = async () => {
    if (!form.clock_in_at) return;
    const payload: any = {
      clock_in_at: fromLocalInput(form.clock_in_at),
      clock_out_at: form.clock_out_at ? fromLocalInput(form.clock_out_at) : null,
      notes: form.notes || null,
    };
    if (editing) {
      const { error } = await supabase.from('assistant_work_logs').update(payload).eq('id', editing.id);
      if (error) return toast({ title: '저장 실패', description: error.message, variant: 'destructive' });
    } else {
      payload.assistant_user_id = targetUserId;
      const { error } = await supabase.from('assistant_work_logs').insert(payload);
      if (error) return toast({ title: '추가 실패', description: error.message, variant: 'destructive' });
    }
    setEditing(null); setAdding(false); setForm({ clock_in_at: '', clock_out_at: '', notes: '' });
    await load();
  };

  const startEdit = (l: Log) => {
    setEditing(l); setAdding(false);
    setForm({
      clock_in_at: toLocalInput(l.clock_in_at),
      clock_out_at: l.clock_out_at ? toLocalInput(l.clock_out_at) : '',
      notes: l.notes ?? '',
    });
  };

  const startAdd = () => {
    setAdding(true); setEditing(null);
    setForm({ clock_in_at: toLocalInput(new Date().toISOString()), clock_out_at: '', notes: '' });
  };

  const remove = async (id: string) => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    await supabase.from('assistant_work_logs').delete().eq('id', id);
    await load();
  };

  const totalMin = useMemo(() => logs.reduce((s, l) => s + (l.total_minutes ?? 0), 0), [logs]);
  const isOwnView = targetUserId === user?.id;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span>조교 근무시간 기록</span>
            {isOwnView && (
              openLog ? (
                <Button onClick={clockOut} variant="destructive" size="sm">
                  <LogOut className="w-4 h-4 mr-1" /> 퇴근
                </Button>
              ) : (
                <Button onClick={clockIn} size="sm">
                  <LogIn className="w-4 h-4 mr-1" /> 출근
                </Button>
              )
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap items-end">
            {admin && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">조교</div>
                <Select value={viewUserId} onValueChange={setViewUserId}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {assistants.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-1">월</div>
              <Input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="w-40" />
            </div>
            <div className="ml-auto">
              <Badge variant="secondary" className="text-sm">월 합계: {fmtMin(totalMin)}</Badge>
            </div>
          </div>

          {openLog && isOwnView && (
            <div className="p-3 rounded bg-primary/5 border border-primary/20 text-sm">
              현재 근무 중 · 출근 {new Date(openLog.clock_in_at).toLocaleString('ko-KR')}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={startAdd}>
              <Plus className="w-4 h-4 mr-1" /> 수기 추가
            </Button>
          </div>

          {(adding || editing) && (
            <Card>
              <CardContent className="p-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">출근</div>
                  <Input type="datetime-local" value={form.clock_in_at} onChange={(e) => setForm({ ...form, clock_in_at: e.target.value })} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">퇴근 (비우면 진행중)</div>
                  <Input type="datetime-local" value={form.clock_out_at} onChange={(e) => setForm({ ...form, clock_out_at: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground mb-1">메모</div>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div className="sm:col-span-2 flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => { setAdding(false); setEditing(null); }}>취소</Button>
                  <Button onClick={saveEdit}>저장</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>출근</TableHead>
                  <TableHead>퇴근</TableHead>
                  <TableHead>총 근무</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">기록 없음</TableCell></TableRow>
                )}
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{new Date(l.clock_in_at).toLocaleString('ko-KR')}</TableCell>
                    <TableCell>{l.clock_out_at ? new Date(l.clock_out_at).toLocaleString('ko-KR') : <Badge variant="outline">진행중</Badge>}</TableCell>
                    <TableCell>{fmtMin(l.total_minutes)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.notes ?? '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => startEdit(l)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(l.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function WorkLogsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'assistant']}>
      <WorkLogsInner />
    </ProtectedRoute>
  );
}
