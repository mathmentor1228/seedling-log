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
import { Plus, Settings, Edit2, Trash2 } from 'lucide-react';
import { getRoomLabel, isSpecialRoom } from './constants';
import { UnifiedRecordModal } from './UnifiedRecordModal';
import { RoutineModal } from './RoutineModal';

function formatDuration(mins: number | null) {
  if (!mins) return '-';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}시간 ${m > 0 ? m + '분' : ''}` : `${m}분`;
}

function taskSummary(taskList: any) {
  if (!Array.isArray(taskList) || taskList.length === 0) return '-';
  const done = taskList.filter((t: any) => t.done).length;
  return `${done}/${taskList.length} 완료`;
}

export function SelfStudyTab() {
  const { toast } = useToast();
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
    let query = supabase
      .from('self_study_records')
      .select('*, students:student_id(name)')
      .gte('study_date', startDate)
      .lte('study_date', endDate)
      .order('study_date', { ascending: false })
      .order('start_time', { ascending: true });

    const { data } = await query;
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
    await supabase.from('self_study_records').delete().eq('id', id);
    toast({ title: '삭제되었습니다' });
    fetchRecords();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">자습 관리</h2>
        <div className="flex gap-2">
          <Button onClick={() => { setEditRecord(null); setModalOpen(true); }} className="gap-1">
            <Plus className="w-4 h-4" /> 자습 기록 추가
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
                  <TableHead>학생</TableHead>
                  <TableHead>과목</TableHead>
                  <TableHead>시작</TableHead>
                  <TableHead>종료</TableHead>
                  <TableHead>학습시간</TableHead>
                  <TableHead>강의실</TableHead>
                  <TableHead>할일목록</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead>액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell></TableRow>
                ) : records.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">기록이 없습니다</TableCell></TableRow>
                ) : records.map(r => (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm">{r.study_date}</TableCell>
                    <TableCell className="text-sm font-medium">{r.student_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.subject || '-'}</Badge></TableCell>
                    <TableCell className="text-sm">{r.start_time?.slice(0, 5) || '-'}</TableCell>
                    <TableCell className="text-sm">{r.end_time?.slice(0, 5) || '-'}</TableCell>
                    <TableCell className="text-sm">{formatDuration(r.duration_minutes)}</TableCell>
                    <TableCell>
                      {isSpecialRoom(r.room) ? (
                        <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">{getRoomLabel(r.room)}</Badge>
                      ) : <span className="text-xs text-muted-foreground">{getRoomLabel(r.room)}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{taskSummary(r.task_list)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{r.memo || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditRecord({ type: 'self_study', id: r.id }); setModalOpen(true); }}>
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

      <UnifiedRecordModal open={modalOpen} onOpenChange={setModalOpen} defaultTypes={['self_study']} onSaved={fetchRecords} />
      <RoutineModal open={routineOpen} onOpenChange={setRoutineOpen} type="self_study" />
    </div>
  );
}
