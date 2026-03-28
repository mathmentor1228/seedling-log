import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import { Plus, Settings, Edit2, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { getRoomLabel, isSpecialRoom } from './constants';
import { UnifiedRecordModal } from './UnifiedRecordModal';
import { RoutineModal } from './RoutineModal';
import { useTeachersList } from './useTeachersList';

export function ClinicTab() {
  const { toast } = useToast();
  const { teachers } = useTeachersList();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(getTodayKST());
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<{ type: string; id: string } | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('clinic_records')
      .select('*, students:student_id(name)')
      .gte('clinic_date', startDate)
      .lte('clinic_date', endDate)
      .order('clinic_date', { ascending: false })
      .order('start_time', { ascending: true });

    let results = (data || []).map((r: any) => ({ ...r, student_name: r.students?.name }));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter((r: any) => r.student_name?.toLowerCase().includes(q));
    }
    setRecords(results);
    setLoading(false);
  }, [startDate, endDate, searchQuery]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    await supabase.from('clinic_records').delete().eq('id', id);
    toast({ title: '삭제되었습니다' });
    fetchRecords();
  }

  async function handleMarkNoteShown(id: string) {
    await supabase.from('clinic_records').update({ teacher_note_shown: true }).eq('id', id);
    toast({ title: '확인 완료 처리되었습니다' });
    fetchRecords();
  }

  const teacherNameMap = Object.fromEntries(teachers.map(t => [t.id, t.full_name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">클리닉 관리</h2>
        <div className="flex gap-2">
          <Button onClick={() => { setEditRecord(null); setModalOpen(true); }} className="gap-1">
            <Plus className="w-4 h-4" /> 클리닉 기록 추가
          </Button>
          <Button variant="outline" onClick={() => setRoutineOpen(true)} className="gap-1">
            <Settings className="w-4 h-4" /> 정기 루틴 설정
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">시작일</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">종료일</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">학생 검색</label>
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="이름..." className="w-32" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>시간</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>과목</TableHead>
                  <TableHead>담당 선생님</TableHead>
                  <TableHead>클리닉 내용</TableHead>
                  <TableHead>다음예정</TableHead>
                  <TableHead>특이사항</TableHead>
                  <TableHead>강의실</TableHead>
                  <TableHead>확인</TableHead>
                  <TableHead>액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell></TableRow>
                ) : records.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">기록이 없습니다</TableCell></TableRow>
                ) : records.map(r => (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm">{r.clinic_date}</TableCell>
                    <TableCell className="text-sm">{r.start_time?.slice(0, 5) || '-'}{r.end_time ? `~${r.end_time.slice(0, 5)}` : ''}</TableCell>
                    <TableCell className="text-sm font-medium">{r.student_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.subject}</Badge></TableCell>
                    <TableCell className="text-sm">{teacherNameMap[r.teacher_id] || '-'}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{r.content}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{r.next_clinic_memo || '-'}</TableCell>
                    <TableCell>
                      {r.teacher_note ? (
                        r.teacher_note_shown ? (
                          <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs gap-1">
                            <CheckCircle2 className="w-3 h-3" /> 확인완료
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-xs gap-1">
                            <AlertCircle className="w-3 h-3" /> 미확인
                          </Badge>
                        )
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {isSpecialRoom(r.room) ? (
                        <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">{getRoomLabel(r.room)}</Badge>
                      ) : <span className="text-xs text-muted-foreground">{getRoomLabel(r.room)}</span>}
                    </TableCell>
                    <TableCell>
                      {r.teacher_note && !r.teacher_note_shown && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleMarkNoteShown(r.id)}>
                          확인
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditRecord({ type: 'clinic', id: r.id }); setModalOpen(true); }}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <UnifiedRecordModal open={modalOpen} onOpenChange={setModalOpen} defaultTypes={['clinic']} onSaved={fetchRecords} />
      <RoutineModal open={routineOpen} onOpenChange={setRoutineOpen} type="clinic" />
    </div>
  );
}
