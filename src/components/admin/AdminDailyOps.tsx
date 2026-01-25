import { useState, useEffect, useMemo } from 'react';
import { format, subDays, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { LessonModal } from '@/components/lessons/LessonModal';
import { 
  CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Eye,
  MessageSquare,
  AlertTriangle,
  ClipboardCheck,
  FileWarning,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTodayKST } from '@/lib/utils';
import type { LessonFormContext } from '@/components/lessons/LessonRecordForm';

// ADMIN-DAILY-OPS-V1: Admin Daily Operations page

interface LessonRecord {
  id: string;
  lesson_date: string;
  student_id: string;
  class_id: string;
  subject: string;
  teacher_id: string;
  submitted: boolean;
  homework_status: string;
  homework_check_note: string | null;
  learning_issues_note: string | null;
  test_content: string | null;
  test_title: string | null;
  test_result_text: string | null;
  english_pass_fail: string | null;
  attendance_status: string[] | null;
  student_name?: string;
  teacher_name?: string;
}

interface Teacher {
  id: string;
  full_name: string;
}

const ATTENDANCE_ISSUES = ['지각', '조퇴', '인정결석', '무단결석', '보충불가'];
const SUBJECTS = ['수학', '과학', '영어', '국어'];

export function AdminDailyOps() {
  const { toast } = useToast();
  
  // Date
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = getTodayKST();
    return new Date(today);
  });
  
  // Filters
  const [teacherFilter, setTeacherFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  
  // Toggle filters
  const [showCommentsOnly, setShowCommentsOnly] = useState(false);
  const [showAttendanceOnly, setShowAttendanceOnly] = useState(false);
  const [showTestsOnly, setShowTestsOnly] = useState(false);
  const [showHomeworkIssuesOnly, setShowHomeworkIssuesOnly] = useState(false);
  
  // Data
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<LessonRecord[]>([]);
  
  // Modal - ADMIN_REPORT_VIEW_MODAL_V1
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<LessonFormContext | null>(null);
  const [modalRecordId, setModalRecordId] = useState<string | null>(null);

  useEffect(() => {
    fetchTeachers();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  async function fetchTeachers() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      setTeachers(data || []);
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      // Fetch all records for the date
      const { data, error } = await supabase
        .from('lesson_records')
        .select(`
          id,
          lesson_date,
          student_id,
          class_id,
          subject,
          teacher_id,
          submitted,
          homework_status,
          homework_check_note,
          learning_issues_note,
          test_content,
          test_title,
          test_result_text,
          english_pass_fail,
          attendance_status
        `)
        .eq('lesson_date', dateStr)
        .order('lesson_date', { ascending: false });

      if (error) throw error;

      // Enrich with student and teacher names
      const studentIds = [...new Set((data || []).map(r => r.student_id))];
      const teacherIds = [...new Set((data || []).map(r => r.teacher_id))];

      const [studentsRes, teachersRes] = await Promise.all([
        supabase.from('students').select('id, name').in('id', studentIds),
        supabase.from('profiles').select('id, full_name').in('id', teacherIds),
      ]);

      const studentMap = new Map((studentsRes.data || []).map(s => [s.id, s.name]));
      const teacherMap = new Map((teachersRes.data || []).map(t => [t.id, t.full_name]));

      const enrichedRecords: LessonRecord[] = (data || []).map(r => ({
        ...r,
        student_name: studentMap.get(r.student_id) || '알 수 없음',
        teacher_name: teacherMap.get(r.teacher_id) || '알 수 없음',
      }));

      setRecords(enrichedRecords);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: '데이터 로딩 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function openViewModal(record: LessonRecord) {
    const ctx: LessonFormContext = {
      student_id: record.student_id,
      class_id: record.class_id,
      subject: record.subject,
      lesson_date: record.lesson_date,
    };
    setModalContext(ctx);
    setModalRecordId(record.id);
    setModalOpen(true);
  }

  // Apply filters
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (teacherFilter !== 'all' && r.teacher_id !== teacherFilter) return false;
      if (subjectFilter !== 'all' && r.subject !== subjectFilter) return false;
      return true;
    });
  }, [records, teacherFilter, subjectFilter]);

  // Comment records (조교 or 교사 코멘트)
  const commentRecords = useMemo(() => {
    return filteredRecords.filter(r => 
      (r.homework_check_note && r.homework_check_note.trim()) ||
      (r.learning_issues_note && r.learning_issues_note.trim())
    );
  }, [filteredRecords]);

  // Attendance issue records
  const attendanceIssueRecords = useMemo(() => {
    return filteredRecords.filter(r => 
      r.attendance_status?.some(s => ATTENDANCE_ISSUES.includes(s))
    );
  }, [filteredRecords]);

  // Test records
  const testRecords = useMemo(() => {
    return filteredRecords.filter(r => 
      r.test_content || r.test_title || r.test_result_text
    );
  }, [filteredRecords]);

  // Test records missing content
  const testMissingContentRecords = useMemo(() => {
    return testRecords.filter(r => 
      !r.test_content && !r.test_title && r.test_result_text
    );
  }, [testRecords]);

  // Homework issue records
  const homeworkIssueRecords = useMemo(() => {
    return filteredRecords.filter(r => 
      ['not_done', 'partial'].includes(r.homework_status)
    );
  }, [filteredRecords]);

  // KPI calculations
  const kpis = useMemo(() => ({
    comments: commentRecords.length,
    attendance: attendanceIssueRecords.length,
    homework: homeworkIssueRecords.length,
    tests: testRecords.length,
    testsMissingContent: testMissingContentRecords.length,
  }), [commentRecords, attendanceIssueRecords, homeworkIssueRecords, testRecords, testMissingContentRecords]);

  // Helper to get test display content
  function getTestDisplayContent(record: LessonRecord): string {
    // TEST-CONTENT-REQUIRED-V1: Prefer test_content, fallback to test_title
    if (record.test_content && record.test_content.trim()) {
      return record.test_content;
    }
    if (record.test_title && record.test_title.trim()) {
      return record.test_title;
    }
    return '';
  }

  // Helper to check if test has no content
  function hasNoTestContent(record: LessonRecord): boolean {
    return !record.test_content && !record.test_title && !!record.test_result_text;
  }

  function getCommentType(record: LessonRecord): string[] {
    const types: string[] = [];
    if (record.homework_check_note && record.homework_check_note.trim()) {
      types.push('조교');
    }
    if (record.learning_issues_note && record.learning_issues_note.trim()) {
      types.push('교사');
    }
    return types;
  }

  function getCommentPreview(record: LessonRecord): string {
    const parts: string[] = [];
    if (record.homework_check_note && record.homework_check_note.trim()) {
      parts.push(record.homework_check_note.slice(0, 30));
    }
    if (record.learning_issues_note && record.learning_issues_note.trim()) {
      parts.push(record.learning_issues_note.slice(0, 30));
    }
    return parts.join(' / ') + (parts.some(p => p.length >= 30) ? '...' : '');
  }

  const dateStr = format(selectedDate, 'yyyy년 M월 d일 (EEE)', { locale: ko });

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* ADMIN-DAILY-OPS-V1 marker */}
      <div className="text-xs text-center py-1 rounded bg-primary/20 text-primary">
        ADMIN-DAILY-OPS-V1 | TEST-CONTENT-REQUIRED-V1
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">일일 운영 현황</h1>
        
        {/* Date Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedDate(d => subDays(d, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[200px] justify-start">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {dateStr}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                locale={ko}
              />
            </PopoverContent>
          </Popover>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedDate(d => addDays(d, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">선생님:</Label>
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {teachers.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">과목:</Label>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {SUBJECTS.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Toggle filters */}
        <div className="flex flex-wrap items-center gap-4 ml-auto">
          <div className="flex items-center gap-2">
            <Switch checked={showCommentsOnly} onCheckedChange={setShowCommentsOnly} id="comments" />
            <Label htmlFor="comments" className="text-xs">코멘트만</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={showAttendanceOnly} onCheckedChange={setShowAttendanceOnly} id="attendance" />
            <Label htmlFor="attendance" className="text-xs">출결만</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={showTestsOnly} onCheckedChange={setShowTestsOnly} id="tests" />
            <Label htmlFor="tests" className="text-xs">테스트만</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={showHomeworkIssuesOnly} onCheckedChange={setShowHomeworkIssuesOnly} id="homework" />
            <Label htmlFor="homework" className="text-xs">숙제이슈만</Label>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className={cn(showCommentsOnly && "ring-2 ring-primary")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                코멘트 건수
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{kpis.comments}</p>
              <p className="text-xs text-muted-foreground">조교/교사 관찰</p>
            </CardContent>
          </Card>

          <Card className={cn(showAttendanceOnly && "ring-2 ring-primary")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                출결 이슈
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{kpis.attendance}</p>
              <p className="text-xs text-muted-foreground">지각/결석/조퇴 등</p>
            </CardContent>
          </Card>

          <Card className={cn(showHomeworkIssuesOnly && "ring-2 ring-primary")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileWarning className="w-4 h-4" />
                숙제 이슈
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{kpis.homework}</p>
              <p className="text-xs text-muted-foreground">미이행/일부완료</p>
            </CardContent>
          </Card>

          <Card className={cn(showTestsOnly && "ring-2 ring-primary")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4" />
                테스트 건수
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{kpis.tests}</p>
              <p className="text-xs text-muted-foreground">당일 테스트</p>
            </CardContent>
          </Card>

          <Card className={cn(kpis.testsMissingContent > 0 && "border-destructive")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
                <FileWarning className="w-4 h-4" />
                내용 누락
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">{kpis.testsMissingContent}</p>
              <p className="text-xs text-muted-foreground">테스트 내용 없음</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table 1: Comments */}
      {(!showAttendanceOnly && !showTestsOnly && !showHomeworkIssuesOnly) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              코멘트 달린 학생 ({commentRecords.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40" />
            ) : commentRecords.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">코멘트가 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead>담당</TableHead>
                    <TableHead>타입</TableHead>
                    <TableHead>미리보기</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commentRecords.map(record => (
                    <TableRow key={record.id}>
                      <TableCell>{format(new Date(record.lesson_date), 'M/d')}</TableCell>
                      <TableCell className="font-medium">{record.student_name}</TableCell>
                      <TableCell>{record.subject}</TableCell>
                      <TableCell>{record.teacher_name}</TableCell>
                      <TableCell>
                        {getCommentType(record).map(t => (
                          <Badge key={t} variant={t === '조교' ? 'secondary' : 'outline'} className="mr-1">
                            {t}
                          </Badge>
                        ))}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {getCommentPreview(record)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openViewModal(record)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table 2: Attendance Issues */}
      {(!showCommentsOnly && !showTestsOnly && !showHomeworkIssuesOnly) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              출결 이슈 ({attendanceIssueRecords.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40" />
            ) : attendanceIssueRecords.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">출결 이슈가 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead>담당</TableHead>
                    <TableHead>출결</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceIssueRecords.map(record => (
                    <TableRow key={record.id}>
                      <TableCell>{format(new Date(record.lesson_date), 'M/d')}</TableCell>
                      <TableCell className="font-medium">{record.student_name}</TableCell>
                      <TableCell>{record.subject}</TableCell>
                      <TableCell>{record.teacher_name}</TableCell>
                      <TableCell>
                        {record.attendance_status?.filter(s => ATTENDANCE_ISSUES.includes(s)).map(s => (
                          <Badge key={s} variant="destructive" className="mr-1">
                            {s}
                          </Badge>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openViewModal(record)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table 3: Test Records */}
      {(!showCommentsOnly && !showAttendanceOnly && !showHomeworkIssuesOnly) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              테스트 기록 ({testRecords.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40" />
            ) : testRecords.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">테스트 기록이 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead>담당</TableHead>
                    <TableHead>테스트내용</TableHead>
                    <TableHead>결과</TableHead>
                    <TableHead></TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testRecords.map(record => (
                    <TableRow key={record.id}>
                      <TableCell>{format(new Date(record.lesson_date), 'M/d')}</TableCell>
                      <TableCell className="font-medium">{record.student_name}</TableCell>
                      <TableCell>{record.subject}</TableCell>
                      <TableCell>{record.teacher_name}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {getTestDisplayContent(record) || <span className="text-muted-foreground italic">-</span>}
                      </TableCell>
                      <TableCell>
                        {record.test_result_text}
                        {record.english_pass_fail && (
                          <Badge variant={record.english_pass_fail === 'pass' ? 'default' : 'destructive'} className="ml-1">
                            {record.english_pass_fail === 'pass' ? 'P' : 'F'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasNoTestContent(record) && (
                          <Badge variant="destructive">내용 없음</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openViewModal(record)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table 4: Homework Issues */}
      {(!showCommentsOnly && !showAttendanceOnly && !showTestsOnly) && showHomeworkIssuesOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileWarning className="w-5 h-5" />
              숙제 이슈 ({homeworkIssueRecords.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40" />
            ) : homeworkIssueRecords.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">숙제 이슈가 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead>담당</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {homeworkIssueRecords.map(record => (
                    <TableRow key={record.id}>
                      <TableCell>{format(new Date(record.lesson_date), 'M/d')}</TableCell>
                      <TableCell className="font-medium">{record.student_name}</TableCell>
                      <TableCell>{record.subject}</TableCell>
                      <TableCell>{record.teacher_name}</TableCell>
                      <TableCell>
                        <Badge variant={record.homework_status === 'not_done' ? 'destructive' : 'secondary'}>
                          {record.homework_status === 'not_done' ? '미이행' : '일부완료'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openViewModal(record)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* View Modal - ADMIN_REPORT_VIEW_MODAL_V1 */}
      {modalContext && (
        <LessonModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          context={modalContext}
          existingRecordId={modalRecordId}
          initialMode="view"
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
