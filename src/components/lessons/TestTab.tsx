import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import { Plus, Settings, CheckCircle2, XCircle, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { ROOMS, TEST_TYPES, getRoomLabel, isSpecialRoom } from './constants';
import { UnifiedRecordModal } from './UnifiedRecordModal';
import { RoutineModal } from './RoutineModal';

interface UnifiedTestRecord {
  id: string;
  source: 'lesson_record';
  student_id: string;
  student_name: string;
  teacher_id: string;
  teacher_name: string;
  test_date: string;
  subject: string;
  test_type: string | null;
  content: string;
  score: string | null;
  passed: boolean | null;
  assistant_name: string | null;
  room: string | null;
}

function derivePassed(english_pass_fail: string | null, test_result: string | null): boolean | null {
  if (english_pass_fail === 'pass') return true;
  if (english_pass_fail === 'fail') return false;
  if (test_result === 'pass') return true;
  if (test_result === 'fail') return false;
  return null;
}

export function TestTab() {
  const { toast } = useToast();
  const [records, setRecords] = useState<UnifiedTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(getTodayKST());
  const [filterSubject, setFilterSubject] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [studentHistory, setStudentHistory] = useState<UnifiedTestRecord[]>([]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('lesson_records')
      .select(`
        id,
        student_id,
        teacher_id,
        lesson_date,
        subject,
        test_content,
        test_title,
        test_result_text,
        test_result,
        english_pass_fail,
        test_assistant,
        students!inner(name)
      `)
      .not('test_content', 'is', null)
      .neq('test_content', '')
      .gte('lesson_date', startDate)
      .lte('lesson_date', endDate)
      .order('lesson_date', { ascending: false });

    if (filterSubject !== 'all') query = query.eq('subject', filterSubject as any);

    const { data } = await query;
    if (!data || data.length === 0) {
      setRecords([]);
      setLoading(false);
      return;
    }

    // Fetch teacher names
    const teacherIds = [...new Set(data.map((r: any) => r.teacher_id).filter(Boolean))];
    let teacherMap: Record<string, string> = {};
    if (teacherIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds);
      teacherMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name || '알 수 없음']));
    }

    let results: UnifiedTestRecord[] = (data as any[]).map(r => ({
      id: r.id,
      source: 'lesson_record' as const,
      student_id: r.student_id,
      student_name: r.students?.name || '',
      teacher_id: r.teacher_id,
      teacher_name: teacherMap[r.teacher_id] || '알 수 없음',
      test_date: r.lesson_date,
      subject: r.subject,
      test_type: null,
      content: r.test_content || r.test_title || '',
      score: r.test_result_text || null,
      passed: derivePassed(r.english_pass_fail, r.test_result),
      assistant_name: r.test_assistant || null,
      room: null,
    }));

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter(r => r.student_name.toLowerCase().includes(q));
    }

    setRecords(results);
    setLoading(false);
  }, [startDate, endDate, filterSubject, searchQuery]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  async function loadStudentHistory(studentId: string) {
    if (expandedStudent === studentId) { setExpandedStudent(null); return; }

    const { data } = await supabase
      .from('lesson_records')
      .select(`
        id, student_id, teacher_id, lesson_date, subject,
        test_content, test_title, test_result_text, test_result,
        english_pass_fail, test_assistant, students!inner(name)
      `)
      .eq('student_id', studentId)
      .not('test_content', 'is', null)
      .neq('test_content', '')
      .order('lesson_date', { ascending: false })
      .limit(20);

    const mapped: UnifiedTestRecord[] = ((data || []) as any[]).map(r => ({
      id: r.id,
      source: 'lesson_record' as const,
      student_id: r.student_id,
      student_name: r.students?.name || '',
      teacher_id: r.teacher_id,
      teacher_name: '',
      test_date: r.lesson_date,
      subject: r.subject,
      test_type: null,
      content: r.test_content || r.test_title || '',
      score: r.test_result_text || null,
      passed: derivePassed(r.english_pass_fail, r.test_result),
      assistant_name: r.test_assistant || null,
      room: null,
    }));

    setStudentHistory(mapped);
    setExpandedStudent(studentId);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">테스트 관리</h2>
        <div className="flex gap-2">
          <Button onClick={() => setModalOpen(true)} className="gap-1">
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
                  <TableHead>학생</TableHead>
                  <TableHead>과목</TableHead>
                  <TableHead>범위/내용</TableHead>
                  <TableHead>결과</TableHead>
                  <TableHead>통과</TableHead>
                  <TableHead>조교</TableHead>
                  <TableHead>담당</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell></TableRow>
                ) : records.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">기록이 없습니다</TableCell></TableRow>
                ) : records.map(r => (
                  <TableRow key={r.id} className="group">
                    <TableCell className="text-sm">{r.test_date}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => loadStudentHistory(r.student_id)}
                        className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        {r.student_name}
                        {expandedStudent === r.student_id
                          ? <ChevronUp className="w-3 h-3" />
                          : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.subject}</Badge></TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{r.content}</TableCell>
                    <TableCell className="text-sm">{r.score || '-'}</TableCell>
                    <TableCell>
                      {r.passed === true && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                      {r.passed === false && <XCircle className="w-4 h-4 text-red-600" />}
                      {r.passed === null && <Minus className="w-4 h-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="text-xs">{r.assistant_name || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.teacher_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Expanded student history */}
          {expandedStudent && studentHistory.length > 0 && (
            <div className="border-t p-4 bg-muted/30">
              <StudentTestHistory records={studentHistory} />
            </div>
          )}
        </CardContent>
      </Card>

      <UnifiedRecordModal open={modalOpen} onOpenChange={setModalOpen} defaultTypes={['test']} onSaved={fetchRecords} />
      <RoutineModal open={routineOpen} onOpenChange={setRoutineOpen} type="test" />
    </div>
  );
}

function StudentTestHistory({ records }: { records: UnifiedTestRecord[] }) {
  // Group by subject
  const subjects = [...new Set(records.map(r => r.subject))];

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">학생별 누적 이력</h4>
      {subjects.map(subj => {
        const subRecords = records.filter(r => r.subject === subj);
        const recent5 = subRecords.slice(0, 5);
        const withResult = subRecords.filter(r => r.passed !== null);
        const passCount = withResult.filter(r => r.passed === true).length;
        const passRate = withResult.length > 0 ? Math.round((passCount / withResult.length) * 100) : 0;

        return (
          <div key={subj} className="space-y-1">
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="outline">{subj}</Badge>
              <span className="text-muted-foreground">통과율: {passRate}% ({passCount}/{withResult.length})</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {recent5.map(r => (
                <div key={r.id} className="text-xs border rounded-md p-2 bg-background">
                  <div className="font-medium">{r.test_date}</div>
                  <div className="text-muted-foreground truncate max-w-[150px]">{r.content}</div>
                  <div className="mt-1 flex items-center gap-1">
                    {r.passed === true && <Badge variant="secondary" className="text-[10px]">통과</Badge>}
                    {r.passed === false && <Badge variant="destructive" className="text-[10px]">불통과</Badge>}
                    {r.passed === null && <Badge variant="outline" className="text-[10px]">미기록</Badge>}
                    {r.score && <span className="ml-1">{r.score}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
