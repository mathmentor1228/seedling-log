import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { NewStudentRegistration, type NewStudentInitialData } from '@/components/admin/NewStudentRegistration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarCheck, ClipboardCopy, Loader2, RefreshCw, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

type Lead = NewStudentInitialData & {
  id: string; public_token: string; status: string; guardian_name: string | null;
  guardian_phone: string; learning_concern: string | null; preferred_date: string | null;
  preferred_time: string | null; appointment_at: string | null; created_at: string;
};

const STATUS = [
  ['requested', '예약 요청'], ['confirmed', '예약 확정'], ['intake_complete', '사전정보 완료'],
  ['consulted', '상담 완료'], ['enrollment_pending', '등록 대기'], ['converted', '등록 완료'],
  ['on_hold', '보류'], ['closed', '종료'],
] as const;

export default function AdmissionsPipelinePage() {
  return <ProtectedRoute allowedRoles={['admin']}><AdmissionsPipeline /></ProtectedRoute>;
}

function AdmissionsPipeline() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [userName, setUserName] = useState('원장');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from('consultation_leads').select('*').order('created_at', { ascending: false });
    if (error) toast.error('상담 목록을 불러오지 못했습니다');
    setRows((data || []) as Lead[]); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (user) supabase.from('profiles').select('full_name').eq('id', user.id).single().then(({ data }) => setUserName((data as any)?.full_name || '원장')); }, [user]);

  const visible = useMemo(() => rows.filter((r) => filter === 'all' || (filter === 'active' && !['converted','closed'].includes(r.status)) || r.status === filter), [rows, filter]);
  async function update(id: string, changes: Record<string, unknown>) {
    const { error } = await (supabase as any).from('consultation_leads').update(changes).eq('id', id);
    if (error) return toast.error('변경사항을 저장하지 못했습니다');
    setRows((v) => v.map((r) => r.id === id ? { ...r, ...changes } as Lead : r));
  }
  async function copyIntake(lead: Lead) {
    await navigator.clipboard.writeText(`${location.origin}/consultation?token=${lead.public_token}`);
    toast.success('사전정보 입력 링크를 복사했습니다');
  }

  return <div className="space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div><p className="text-xs text-muted-foreground">학생 관리</p><h1 className="text-2xl font-bold">상담·등록 파이프라인</h1><p className="text-sm text-muted-foreground">예약부터 등록·인계까지 멈춘 학생을 한 화면에서 확인합니다.</p></div>
      <div className="flex gap-2"><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">진행 중</SelectItem><SelectItem value="all">전체</SelectItem>{STATUS.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />새로고침</Button></div>
    </div>
    {loading ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin" /></div> : visible.length === 0 ? <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">표시할 상담 예정자가 없습니다.</CardContent></Card> :
      <div className="grid xl:grid-cols-2 gap-3">{visible.map((lead) => <Card key={lead.id} className="border-border/60"><CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><div><CardTitle className="text-base">{lead.student_name} <span className="font-normal text-muted-foreground">{lead.school_level}{lead.grade_year}</span></CardTitle><p className="text-xs text-muted-foreground">{lead.school || '학교 미입력'} · {lead.subjects?.join(', ') || '과목 미정'}</p></div><Badge variant="secondary">{STATUS.find(([v]) => v === lead.status)?.[1] || lead.status}</Badge></div></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded bg-muted/40 p-2"><b>보호자</b><br />{lead.guardian_name || '-'} · {lead.guardian_phone}</div><div className="rounded bg-muted/40 p-2"><b>희망 일정</b><br />{lead.preferred_date || '-'} {lead.preferred_time || ''}</div></div>
        {lead.learning_concern && <p className="text-xs border-l-2 pl-2 line-clamp-3">{lead.learning_concern}</p>}
        <div className="grid sm:grid-cols-[1fr_1fr] gap-2"><Select value={lead.status} onValueChange={(status) => update(lead.id, { status })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{STATUS.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select><Input type="datetime-local" className="h-9" value={lead.appointment_at?.slice(0,16) || ''} onChange={(e) => update(lead.id, { appointment_at: e.target.value ? new Date(e.target.value).toISOString() : null, status: e.target.value ? 'confirmed' : lead.status })} /></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => copyIntake(lead)}><ClipboardCopy className="w-4 h-4 mr-1" />사전정보 링크</Button><Button size="sm" variant="outline" onClick={() => update(lead.id, { status: 'consulted' })}><CalendarCheck className="w-4 h-4 mr-1" />상담 완료</Button>{lead.status !== 'converted' && <Button size="sm" onClick={() => setSelected(lead)}><UserPlus className="w-4 h-4 mr-1" />등록 전환</Button>}</div>
      </CardContent></Card>)}</div>}
    <NewStudentRegistration open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} userName={userName} initialData={selected || undefined} onCreated={async (studentId) => { if (selected && studentId) await update(selected.id, { status: 'converted', converted_student_id: studentId }); setSelected(null); }} />
  </div>;
}
