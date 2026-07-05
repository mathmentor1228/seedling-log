// 공동지도 선생님 등록 모달 — 기간 한정 합류 + 세션별 담당자 지정
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { Loader2, Users, Trash2 } from 'lucide-react';
import {
  fetchTeachers, createCoTeacher, fetchCoTeachers, deleteCoTeacher,
  fetchSessionsInRange, assignSessionTeacher, PlanCoTeacher, PlanSessionRow,
} from './planApi';

type Props = { open: boolean; onClose: () => void; designId: string; defaultTeacherId: string | null; onDone: () => void };

export function CoTeacherModal({ open, onClose, designId, defaultTeacherId, onDone }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<{ id: string; full_name: string }[]>([]);
  const [teacherId, setTeacherId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<PlanCoTeacher[]>([]);
  const [selectedCoTeacher, setSelectedCoTeacher] = useState<PlanCoTeacher | null>(null);
  const [sessions, setSessions] = useState<PlanSessionRow[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setTeachers(await fetchTeachers());
      setExisting(await fetchCoTeachers(designId));
    })();
  }, [open, designId]);

  useEffect(() => {
    if (!selectedCoTeacher) { setSessions([]); return; }
    (async () => {
      setSessions(await fetchSessionsInRange(designId, selectedCoTeacher.start_date, selectedCoTeacher.end_date));
    })();
  }, [selectedCoTeacher, designId]);

  async function handleAdd() {
    if (!teacherId || !startDate || !endDate) {
      toast({ title: '입력 확인', description: '선생님과 기간은 필수입니다', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      await createCoTeacher({
        design_id: designId, teacher_id: teacherId,
        start_date: startDate, end_date: endDate,
        role_note: note.trim() || undefined, created_by: user?.id,
      });
      toast({ title: '공동지도 등록', description: '해당 기간에 합류합니다' });
      setTeacherId(''); setStartDate(''); setEndDate(''); setNote('');
      setExisting(await fetchCoTeachers(designId));
      onDone();
    } catch (e: any) {
      toast({ title: '오류', description: e.message || '저장 실패', variant: 'destructive' });
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 합류를 삭제할까요? (세션별 담당 지정은 유지됩니다)')) return;
    await deleteCoTeacher(id);
    setExisting(await fetchCoTeachers(designId));
    if (selectedCoTeacher?.id === id) setSelectedCoTeacher(null);
    onDone();
  }

  async function handleAssign(sessionId: string, tid: string) {
    await assignSessionTeacher(sessionId, tid === '__default' ? null : tid);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, assigned_teacher_id: tid === '__default' ? null : tid } : s));
  }

  const teacherName = (tid: string | null | undefined) =>
    tid ? (teachers.find(t => t.id === tid)?.full_name || '—') : '기본 담당';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="w-4 h-4" />공동지도 (투트랙)</DialogTitle>
          <DialogDescription>특정 기간 동안 합류 선생님을 등록하고, 그 기간의 세션별 담당자를 지정합니다.</DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4 mt-2">
          <div className="space-y-3 border rounded-md p-3">
            <div className="text-sm font-semibold">새 합류 등록</div>
            <div className="space-y-1"><Label>합류 선생님</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                <SelectContent>
                  {teachers.filter(t => t.id !== defaultTeacherId).map(t =>
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>시작일</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
              <div className="space-y-1"><Label>종료일</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>역할 메모</Label><Input value={note} onChange={e => setNote(e.target.value)} placeholder="예: 심화 개념 담당" /></div>
            <Button onClick={handleAdd} disabled={saving} className="w-full">
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}합류 등록
            </Button>
          </div>

          <div className="space-y-3 border rounded-md p-3">
            <div className="text-sm font-semibold">등록된 합류</div>
            {existing.length === 0 && <p className="text-xs text-muted-foreground">없음</p>}
            <div className="space-y-1.5">
              {existing.map(c => (
                <div key={c.id}
                  className={`flex items-center justify-between p-2 rounded border cursor-pointer text-sm ${selectedCoTeacher?.id === c.id ? 'border-primary bg-primary/5' : ''}`}
                  onClick={() => setSelectedCoTeacher(c)}>
                  <div>
                    <div className="font-medium">{c.teacher_name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{c.start_date} ~ {c.end_date}{c.role_note ? ` · ${c.role_note}` : ''}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {selectedCoTeacher && (
          <div className="mt-4 border rounded-md p-3 space-y-2">
            <div className="text-sm font-semibold">
              {selectedCoTeacher.teacher_name} 합류 기간 세션별 담당자
            </div>
            {sessions.length === 0 && <p className="text-xs text-muted-foreground">해당 기간에 세션이 없습니다. 특강 추가 또는 리듬 세션 저장 후 다시 열어주세요.</p>}
            <div className="max-h-60 overflow-y-auto space-y-1">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="w-24 text-xs text-muted-foreground">{s.session_date}</span>
                  <span className="w-28 text-xs">{s.role}</span>
                  <Select value={s.assigned_teacher_id || '__default'} onValueChange={(v) => handleAssign(s.id, v)}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default">기본 담당 ({teacherName(defaultTeacherId)})</SelectItem>
                      {defaultTeacherId && <SelectItem value={defaultTeacherId}>{teacherName(defaultTeacherId)} (기본)</SelectItem>}
                      <SelectItem value={selectedCoTeacher.teacher_id}>{selectedCoTeacher.teacher_name}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={onClose}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
