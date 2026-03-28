import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import { Plus, Settings, Edit2, Trash2, CheckCircle2, XCircle, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { ROOMS, TEST_TYPES, getRoomLabel, getTestTypeLabel, isSpecialRoom } from './constants';
import { UnifiedRecordModal } from './UnifiedRecordModal';
import { RoutineModal } from './RoutineModal';

export function TestTab() {
  const { toast } = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(getTodayKST());
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<{ type: string; id: string } | null>(null);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [studentHistory, setStudentHistory] = useState<any[]>([]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('test_records')
      .select('*, students:student_id(name)')
      .gte('test_date', startDate)
      .lte('test_date', endDate)
      .order('test_date', { ascending: false })
      .order('start_time', { ascending: true });

    if (filterSubject !== 'all') query = query.eq('subject', filterSubject);
    if (filterType !== 'all') query = query.eq('test_type', filterType);

    const { data } = await query;
    let results = (data || []).map((r: any) => ({ ...r, student_name: r.students?.name }));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter((r: any) => r.student_name?.toLowerCase().includes(q));
    }
    setRecords(results);
    setLoading(false);
  }, [startDate, endDate, filterSubject, filterType, searchQuery]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    await supabase.from('test_records').delete().eq('id', id);
    toast({ title: '삭제되었습니다' });
    fetchRecords();
  }

  async function loadStudentHistory(studentId: string) {
    if (expandedStudent === studentId) { setExpandedStudent(null); return; }
    const { data } = await supabase
      .from('test_records')
      .select('*')
      .eq('student_id', studentId)
      .order('test_date', { ascending: false })
      .limit(20);
    setStudentHistory(data || []);
    setExpandedStudent(studentId);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">테스트 관리</h2>
        <div className="flex gap-2">
          <Button onClick={() => { setEditRecord(null); setModalOpen(true); }} className="gap-1">
            <Plus className="w-4 h-4" /> 테스트 기록 추가
          </Button>
          <Button variant="outline" onClick={() => setRoutineOpen(true)} className="gap-1">
            <Settings className="w-4 h-4" /> 정기 루틴 설정
          </Button>
        </div>
      </div>

      {/* Filters */}
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
              <label className="text-xs text-muted-foreground">과목</label>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="수학">수학</SelectItem>
                  <SelectItem value="영어">영어</SelectItem>
                  <SelectItem value="국어">국어</SelectItem>
                  <SelectItem value="과학">과학</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">유형</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {TEST_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">학생 검색</label>
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="이름..." className="w-32" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
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
                  <TableHead>유형</TableHead>
                  <TableHead>범위/내용</TableHead>
                  <TableHead>결과</TableHead>
                  <TableHead>통과</TableHead>
                  <TableHead>조교</TableHead>
                  <TableHead>강의실</TableHead>
                  <TableHead>액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell></TableRow>
                ) : records.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">기록이 없습니다</TableCell></TableRow>
                ) : records.map(r => (
                  <>
                    <TableRow key={r.id} className="hover:bg-muted/50">
                      <TableCell className="text-sm">{r.test_date}</TableCell>
                      <TableCell className="text-sm">{r.start_time?.slice(0, 5) || '-'}{r.end_time ? `~${r.end_time.slice(0, 5)}` : ''}</TableCell>
                      <TableCell>
                        <button onClick={() => loadStudentHistory(r.student_id)} className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
                          {r.student_name}
                          {expandedStudent === r.student_id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{r.subject}</Badge></TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{getTestTypeLabel(r.test_type)}</Badge></TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{r.content}</TableCell>
                      <TableCell className="text-sm">{r.score || '-'}</TableCell>
                      <TableCell>
                        {r.passed === true && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {r.passed === false && <XCircle className="w-4 h-4 text-red-500" />}
                        {r.passed === null && <Minus className="w-4 h-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="text-xs">{r.assistant_name || '-'}</TableCell>
                      <TableCell>
                        {isSpecialRoom(r.room) ? (
                          <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">{getRoomLabel(r.room)}</Badge>
                        ) : <span className="text-xs text-muted-foreground">{getRoomLabel(r.room)}</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditRecord({ type: 'test', id: r.id }); setModalOpen(true); }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedStudent === r.student_id && (
                      <TableRow key={`hist-${r.id}`}>
                        <TableCell colSpan={11} className="bg-muted/30 p-3">
                          <StudentTestHistory records={studentHistory} subject={r.subject} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <UnifiedRecordModal open={modalOpen} onOpenChange={setModalOpen} defaultTypes={['test']} editRecord={editRecord} onSaved={fetchRecords} />
      <RoutineModal open={routineOpen} onOpenChange={setRoutineOpen} type="test" />
    </div>
  );
}

function StudentTestHistory({ records, subject }: { records: any[]; subject: string }) {
  const subjectRecords = records.filter(r => r.subject === subject);
  const recent5 = subjectRecords.slice(0, 5);
  const passCount = subjectRecords.filter(r => r.passed === true).length;
  const total = subjectRecords.filter(r => r.passed !== null).length;
  const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-sm">
        <span className="font-medium">{subject} 누적 이력</span>
        <Badge variant="outline">통과율: {passRate}% ({passCount}/{total})</Badge>
      </div>
      <div className="flex gap-2 flex-wrap">
        {recent5.map(r => (
          <div key={r.id} className="text-xs border rounded-md p-2 bg-background">
            <div className="font-medium">{r.test_date}</div>
            <div className="text-muted-foreground">{r.content}</div>
            <div className="mt-1">
              {r.passed === true ? <Badge className="bg-green-500/15 text-green-600 text-[10px]">통과</Badge>
                : r.passed === false ? <Badge className="bg-red-500/15 text-red-600 text-[10px]">불통과</Badge>
                : <Badge variant="secondary" className="text-[10px]">미기록</Badge>}
              {r.score && <span className="ml-1">{r.score}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
