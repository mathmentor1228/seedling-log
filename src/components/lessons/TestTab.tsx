import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, addDays } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import { Plus, Settings, Users } from 'lucide-react';
import { UnifiedRecordModal } from './UnifiedRecordModal';
import { RoutineModal } from './RoutineModal';
import { InlineTestRow } from './InlineTestRow';
import { StudentTestHistory } from './StudentTestHistory';
import { BatchTestEntryModal } from './BatchTestEntryModal';
import { useTeachersList } from './useTeachersList';

export interface UnifiedTestRecord {
  id: string;
  source: 'lesson_record' | 'test_schedule';
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
  english_pass_fail: string | null;
  test_result: string | null;
  test_slot: number;
  // Grade info for sorting/filtering
  school_level: string | null;
  grade_year: number | null;
}

export function derivePassed(english_pass_fail: string | null, test_result: string | null): boolean | null {
  if (english_pass_fail === 'pass') return true;
  if (english_pass_fail === 'fail') return false;
  if (test_result === 'pass') return true;
  if (test_result === 'fail') return false;
  return null;
}

const SCHOOL_LEVEL_ORDER: Record<string, number> = { '초': 0, '중': 1, '고': 2 };
const collator = new Intl.Collator('ko');

function sortByGrade(a: UnifiedTestRecord, b: UnifiedTestRecord) {
  const levelA = SCHOOL_LEVEL_ORDER[a.school_level || ''] ?? 99;
  const levelB = SCHOOL_LEVEL_ORDER[b.school_level || ''] ?? 99;
  if (levelA !== levelB) return levelA - levelB;
  const gradeA = a.grade_year ?? 99;
  const gradeB = b.grade_year ?? 99;
  if (gradeA !== gradeB) return gradeA - gradeB;
  return collator.compare(a.student_name, b.student_name);
}

function getGradeGroupLabel(record: UnifiedTestRecord) {
  if (!record.school_level) return '미분류';
  const levelName = record.school_level === '초' ? '초등' : record.school_level === '중' ? '중등' : record.school_level === '고' ? '고등' : record.school_level;
  return `${levelName} ${record.grade_year ?? '?'}학년`;
}

export function TestTab() {
  const { toast } = useToast();
  const { teachers } = useTeachersList();
  const [records, setRecords] = useState<UnifiedTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const today = getTodayKST();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterTeacher, setFilterTeacher] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [studentHistory, setStudentHistory] = useState<UnifiedTestRecord[]>([]);
  const [quickDate, setQuickDate] = useState<'yesterday' | 'today' | 'tomorrow'>('today');

  const setQuickDateRange = useCallback((which: 'yesterday' | 'today' | 'tomorrow') => {
    const base = new Date();
    let d: string;
    if (which === 'yesterday') d = format(subDays(base, 1), 'yyyy-MM-dd');
    else if (which === 'tomorrow') d = format(addDays(base, 1), 'yyyy-MM-dd');
    else d = getTodayKST();
    setStartDate(d);
    setEndDate(d);
    setQuickDate(which);
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('lesson_records')
      .select(`
        id, student_id, teacher_id, lesson_date, subject,
        test_content, test_title, test_result_text, test_result,
        english_pass_fail, test_assistant, test_name,
        test_content_2, test_name_2, test_result_text_2, test_result_2,
        english_pass_fail_2, test_assistant_2, test_date_2,
        students!inner(name, school_level, grade_year)
      `)
      .or('and(test_content.not.is.null,test_content.neq.),and(test_content_2.not.is.null,test_content_2.neq.)')
      .gte('lesson_date', startDate)
      .lte('lesson_date', endDate)
      .order('lesson_date', { ascending: false });

    if (filterSubject !== 'all') query = query.eq('subject', filterSubject as any);

    let schedQuery = supabase
      .from('test_schedules')
      .select('*, students!inner(name, school_level, grade_year)')
      .gte('test_date', startDate)
      .lte('test_date', endDate)
      .order('test_date', { ascending: false });

    if (filterSubject !== 'all') schedQuery = schedQuery.eq('subject', filterSubject);

    const [lessonRes, schedRes] = await Promise.all([query, schedQuery]);

    const lessonData = lessonRes.data || [];
    const schedData = schedRes.data || [];

    const allTeacherIds = [
      ...new Set([
        ...lessonData.map((r: any) => r.teacher_id),
        ...schedData.map((r: any) => r.teacher_id),
      ].filter(Boolean))
    ];

    let teacherMap: Record<string, string> = {};
    if (allTeacherIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', allTeacherIds);
      teacherMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name || '알 수 없음']));
    }

    // Map lesson_records - slot 1
    let results: UnifiedTestRecord[] = (lessonData as any[])
      .filter(r => r.test_content && r.test_content !== '')
      .map(r => ({
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
        english_pass_fail: r.english_pass_fail,
        test_result: r.test_result,
        test_slot: 1,
        school_level: r.students?.school_level || null,
        grade_year: r.students?.grade_year ?? null,
      }));

    // Map lesson_records - slot 2
    const slot2Results: UnifiedTestRecord[] = (lessonData as any[])
      .filter(r => r.test_content_2 && r.test_content_2 !== '')
      .map(r => ({
        id: r.id,
        source: 'lesson_record' as const,
        student_id: r.student_id,
        student_name: r.students?.name || '',
        teacher_id: r.teacher_id,
        teacher_name: teacherMap[r.teacher_id] || '알 수 없음',
        test_date: r.test_date_2 || r.lesson_date,
        subject: r.subject,
        test_type: null,
        content: r.test_content_2 || r.test_name_2 || '',
        score: r.test_result_text_2 || null,
        passed: derivePassed(r.english_pass_fail_2, r.test_result_2),
        assistant_name: r.test_assistant_2 || null,
        room: null,
        english_pass_fail: r.english_pass_fail_2,
        test_result: r.test_result_2,
        test_slot: 2,
        school_level: r.students?.school_level || null,
        grade_year: r.students?.grade_year ?? null,
      }));
    results = [...results, ...slot2Results];

    // Map test_schedules
    const schedResults: UnifiedTestRecord[] = (schedData as any[]).map(r => ({
      id: r.id,
      source: 'test_schedule' as const,
      student_id: r.student_id,
      student_name: r.students?.name || '',
      teacher_id: r.teacher_id,
      teacher_name: teacherMap[r.teacher_id] || '알 수 없음',
      test_date: r.test_date,
      subject: r.subject,
      test_type: r.test_type,
      content: r.content || r.title || '',
      score: r.result_score || null,
      passed: r.result_passed,
      assistant_name: null,
      room: null,
      english_pass_fail: null,
      test_result: r.result_passed === true ? 'pass' : r.result_passed === false ? 'fail' : null,
      test_slot: 1,
      school_level: r.students?.school_level || null,
      grade_year: r.students?.grade_year ?? null,
    }));

    // Merge, avoiding duplicates (same student + same date + same subject from both sources)
    const lessonKeys = new Set(results.map(r => `${r.student_id}_${r.test_date}_${r.subject}`));
    const uniqueScheds = schedResults.filter(r => !lessonKeys.has(`${r.student_id}_${r.test_date}_${r.subject}`));
    results = [...results, ...uniqueScheds];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter(r => r.student_name.toLowerCase().includes(q));
    }

    // Sort by grade (school_level → grade_year → name)
    results.sort(sortByGrade);

    setRecords(results);
    setLoading(false);
  }, [startDate, endDate, filterSubject, searchQuery]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  useEffect(() => {
    const channel = supabase
      .channel('test-tab-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_records' }, () => fetchRecords())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_schedules' }, () => fetchRecords())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRecords]);

  // Filtered records by teacher and grade
  const filteredRecords = useMemo(() => {
    let r = records;
    if (filterTeacher !== 'all') {
      r = r.filter(rec => rec.teacher_id === filterTeacher);
    }
    if (filterGrade !== 'all') {
      r = r.filter(rec => rec.school_level === filterGrade);
    }
    return r;
  }, [records, filterTeacher, filterGrade]);

  // Group by grade for display
  const groupedRecords = useMemo(() => {
    const groups = new Map<string, UnifiedTestRecord[]>();
    for (const rec of filteredRecords) {
      const key = getGradeGroupLabel(rec);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(rec);
    }
    return [...groups.entries()];
  }, [filteredRecords]);

  const handleInlineUpdate = useCallback(async (
    recordId: string,
    updates: {
      content?: string;
      score?: string;
      passed?: boolean | null;
      assistant_name?: string | null;
    },
    testSlot: number = 1
  ) => {
    const rec = records.find(r => r.id === recordId && r.test_slot === testSlot);
    if (!rec) return;

    setRecords(prev => prev.map(r => (r.id !== recordId || r.test_slot !== testSlot) ? r : { ...r, ...updates }));

    try {
      if (rec.source === 'test_schedule') {
        const dbUpdates: any = {};
        if (updates.content !== undefined) {
          dbUpdates.content = updates.content;
          dbUpdates.title = updates.content;
        }
        if (updates.score !== undefined) dbUpdates.result_score = updates.score;
        if (updates.passed !== undefined) dbUpdates.result_passed = updates.passed;

        const { error } = await supabase
          .from('test_schedules')
          .update(dbUpdates)
          .eq('id', recordId);
        if (error) throw error;
      } else {
        const subject = rec.subject;
        let testResult = rec.test_result || 'none';
        let englishPassFail = rec.english_pass_fail;

        if (updates.passed !== undefined) {
          if (subject === '영어') {
            englishPassFail = updates.passed === true ? 'pass' : updates.passed === false ? 'fail' : null;
            testResult = 'none';
          } else {
            testResult = updates.passed === true ? 'pass' : updates.passed === false ? 'fail' : 'none';
            englishPassFail = null;
          }
        }

        const rpcParams: any = { _lesson_id: recordId, _test_result: testResult, _test_slot: rec.test_slot };
        if (updates.content !== undefined) {
          rpcParams._test_content = updates.content;
          rpcParams._test_name = updates.content;
        }
        if (updates.score !== undefined) rpcParams._test_result_text = updates.score;
        if (updates.assistant_name !== undefined) rpcParams._test_assistant = updates.assistant_name;

        const { error: rpcError } = await supabase.rpc('update_lesson_test_fields', rpcParams);
        if (rpcError) throw rpcError;

        if (updates.passed !== undefined && subject === '영어' && rec.test_slot === 1) {
          await supabase
            .from('lesson_records')
            .update({ english_pass_fail: englishPassFail })
            .eq('id', recordId);
        }
      }

      toast({ title: '저장됨', description: '테스트 기록이 업데이트되었습니다.' });
    } catch (err: any) {
      fetchRecords();
      toast({ title: '저장 실패', description: err.message || '다시 시도해주세요.', variant: 'destructive' });
    }
  }, [records, fetchRecords, toast]);

  async function loadStudentHistory(studentId: string) {
    if (expandedStudent === studentId) { setExpandedStudent(null); return; }

    const { data } = await supabase
      .from('lesson_records')
      .select(`
        id, student_id, teacher_id, lesson_date, subject,
        test_content, test_title, test_result_text, test_result,
        english_pass_fail, test_assistant, students!inner(name, school_level, grade_year)
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
      english_pass_fail: r.english_pass_fail,
      test_result: r.test_result,
      test_slot: 1,
      school_level: r.students?.school_level || null,
      grade_year: r.students?.grade_year ?? null,
    }));

    setStudentHistory(mapped);
    setExpandedStudent(studentId);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">테스트 관리</h2>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setModalOpen(true)} className="gap-1">
            <Plus className="w-4 h-4" /> 기록 추가
          </Button>
          <Button variant="secondary" onClick={() => setBatchOpen(true)} className="gap-1">
            <Users className="w-4 h-4" /> 일괄 입력
          </Button>
          <Button variant="outline" onClick={() => setRoutineOpen(true)} className="gap-1">
            <Settings className="w-4 h-4" /> 루틴 설정
          </Button>
        </div>
      </div>

      {/* Quick date buttons + Filters */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex gap-1.5">
            {([
              { key: 'yesterday', label: '어제' },
              { key: 'today', label: '오늘' },
              { key: 'tomorrow', label: '내일' },
            ] as const).map(({ key, label }) => (
              <Button
                key={key}
                size="sm"
                variant={quickDate === key ? 'default' : 'outline'}
                onClick={() => setQuickDateRange(key)}
                className="text-xs px-3"
              >
                {label}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground ml-2 self-center">
              {startDate === endDate ? startDate : `${startDate} ~ ${endDate}`}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">시작일</label>
              <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setQuickDate(undefined as any); }} className="w-36" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">종료일</label>
              <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setQuickDate(undefined as any); }} className="w-36" />
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
              <label className="text-xs text-muted-foreground">선생님</label>
              <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {teachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
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

      {/* Grade-level tabs */}
      <Tabs value={filterGrade} onValueChange={setFilterGrade}>
        <TabsList>
          <TabsTrigger value="all">
            전체 <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{records.filter(r => filterTeacher === 'all' || r.teacher_id === filterTeacher).length}</Badge>
          </TabsTrigger>
          {(['초', '중', '고'] as const).map(level => {
            const label = level === '초' ? '초등' : level === '중' ? '중등' : '고등';
            const count = records.filter(r => r.school_level === level && (filterTeacher === 'all' || r.teacher_id === filterTeacher)).length;
            return (
              <TabsTrigger key={level} value={level}>
                {label} <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{count}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">날짜</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>과목</TableHead>
                  <TableHead>범위/내용</TableHead>
                  <TableHead>결과</TableHead>
                  <TableHead className="w-[60px]">통과</TableHead>
                  <TableHead>조교</TableHead>
                  <TableHead>담당</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell></TableRow>
                ) : filteredRecords.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">기록이 없습니다</TableCell></TableRow>
                ) : groupedRecords.map(([groupLabel, groupRecords]) => (
                  <>
                    <TableRow key={`group-${groupLabel}`} className="bg-muted/50">
                      <TableCell colSpan={8} className="py-1.5 px-3">
                        <span className="text-xs font-semibold text-muted-foreground">{groupLabel}</span>
                        <Badge variant="outline" className="ml-2 text-xs px-1.5 py-0">{groupRecords.length}</Badge>
                      </TableCell>
                    </TableRow>
                    {groupRecords.map(r => (
                      <InlineTestRow
                        key={`${r.id}-${r.test_slot}`}
                        record={r}
                        expandedStudent={expandedStudent}
                        onToggleHistory={loadStudentHistory}
                        onUpdate={handleInlineUpdate}
                      />
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>

          {expandedStudent && studentHistory.length > 0 && (
            <div className="border-t p-4 bg-muted/30">
              <StudentTestHistory records={studentHistory} />
            </div>
          )}
        </CardContent>
      </Card>

      <UnifiedRecordModal open={modalOpen} onOpenChange={setModalOpen} defaultTypes={['test']} onSaved={fetchRecords} />
      <BatchTestEntryModal
        open={batchOpen}
        onOpenChange={setBatchOpen}
        defaultSubject={filterSubject !== 'all' ? filterSubject : undefined}
        defaultDate={startDate}
        onSaved={fetchRecords}
      />
      <RoutineModal open={routineOpen} onOpenChange={setRoutineOpen} type="test" />
    </div>
  );
}
