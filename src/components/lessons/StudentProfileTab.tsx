import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth, isAdmin as checkIsAdmin, isTeacher as checkIsTeacher } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import {
  BookOpen, TestTube, Clock, Stethoscope, Search, User,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Target, MessageSquare, Users
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { SUBJECTS } from './constants';
import { StudentProfileOverview } from './StudentProfileOverview';
import { CohortAnalytics } from './CohortAnalytics';

// ─── Types ──────────────────────────────────────────────────
interface StudentBasic {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
  school_level: string | null;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────
function derivePassed(epf: string | null, tr: string | null): boolean | null {
  if (epf === 'pass' || tr === 'pass') return true;
  if (epf === 'fail' || tr === 'fail') return false;
  return null;
}

function calcDuration(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function fmtDur(mins: number | null) {
  if (!mins || mins <= 0) return '-';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}시간${m > 0 ? ` ${m}분` : ''}` : `${m}분`;
}

const SUBJECT_COLORS: Record<string, string> = {
  '수학': 'hsl(var(--primary))',
  '영어': 'hsl(var(--success))',
  '국어': 'hsl(var(--warning))',
  '과학': 'hsl(var(--destructive))',
};

// ─── Main Component ─────────────────────────────────────────
export function StudentProfileTab() {
  const { user, role } = useAuth();
  const isAdmin = checkIsAdmin(role);
  const isTeacherRole = checkIsTeacher(role);

  const [viewMode, setViewMode] = useState<'individual' | 'cohort'>('individual');
  const isAdmin = checkIsAdmin(role);
  const isTeacherRole = checkIsTeacher(role);

  const [students, setStudents] = useState<StudentBasic[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  // Fetch student list
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingList(true);
      if (isAdmin) {
        const { data } = await supabase
          .from('students')
          .select('id, name, grade, school, school_level, created_at')
          .neq('enrollment_status', '퇴원')
          .order('name');
        setStudents(data || []);
      } else if (isTeacherRole) {
        const { data: links } = await supabase
          .from('class_students')
          .select('student_id, classes!inner(teacher_id)')
          .eq('classes.teacher_id', user.id);
        const ids = [...new Set((links || []).map((l: any) => l.student_id))];
        if (ids.length > 0) {
          const { data } = await supabase
            .from('students')
            .select('id, name, grade, school, school_level, created_at')
            .in('id', ids)
            .neq('enrollment_status', '퇴원')
            .order('name');
          setStudents(data || []);
        }
      }
      setLoadingList(false);
    })();
  }, [user, isAdmin, isTeacherRole]);

  const filteredStudents = useMemo(() => {
    if (!searchQuery) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(s => s.name.toLowerCase().includes(q));
  }, [students, searchQuery]);

  const selectedStudent = students.find(s => s.id === selectedId) || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left: Student list */}
      <div className="lg:col-span-1">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">학생 목록</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="이름 검색..."
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-280px)]">
              {loadingList ? (
                <div className="p-3 space-y-2">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : filteredStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">학생이 없습니다</p>
              ) : (
                <div className="p-1">
                  {filteredStudents.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        selectedId === s.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <span className="font-medium">{s.name}</span>
                      {s.grade && (
                        <span className={`ml-2 text-xs ${selectedId === s.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {s.grade}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Right: Detail */}
      <div className="lg:col-span-3">
        {!selectedStudent ? (
          <Card className="h-full flex items-center justify-center min-h-[400px]">
            <div className="text-center text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">학생을 선택해주세요</p>
            </div>
          </Card>
        ) : (
          <StudentDetail student={selectedStudent} />
        )}
      </div>
    </div>
  );
}

// ─── Student Detail ─────────────────────────────────────────
function StudentDetail({ student }: { student: StudentBasic }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActiveTab('overview');
    setLoading(true);
    (async () => {
      const now = new Date();
      const ms = format(startOfMonth(now), 'yyyy-MM-dd');
      const me = format(endOfMonth(now), 'yyyy-MM-dd');

      const [lessons, tests, selfStudy, clinic, schedules, subjectTeachers] = await Promise.all([
        supabase.from('lesson_records').select('*').eq('student_id', student.id).order('lesson_date', { ascending: false }),
        supabase.from('lesson_records')
          .select('id, lesson_date, subject, test_content, test_title, test_result_text, english_pass_fail, test_result')
          .eq('student_id', student.id).not('test_content', 'is', null).neq('test_content', '').order('lesson_date', { ascending: false }),
        supabase.from('self_study_records').select('*').eq('student_id', student.id).order('study_date', { ascending: false }),
        supabase.from('clinic_records').select('*, profiles!teacher_id(full_name)').eq('student_id', student.id).order('clinic_date', { ascending: false }),
        supabase.from('class_schedules')
          .select('day_of_week, start_time, end_time, classes!inner(name, subject, teacher_id)')
          .eq('is_active', true)
          .in('class_id', (await supabase.from('class_students').select('class_id').eq('student_id', student.id)).data?.map((c: any) => c.class_id) || []),
        supabase.from('student_subject_teachers')
          .select('subject, profiles!teacher_id(full_name)')
          .eq('student_id', student.id),
      ]);

      // Month counts
      const monthLessons = (lessons.data || []).filter((l: any) => l.lesson_date >= ms && l.lesson_date <= me && l.submitted);
      const monthTests = (tests.data || []).filter((t: any) => t.lesson_date >= ms && t.lesson_date <= me);
      const monthSelfStudy = (selfStudy.data || []).filter((s: any) => s.study_date >= ms && s.study_date <= me);
      const monthClinic = (clinic.data || []).filter((c: any) => c.clinic_date >= ms && c.clinic_date <= me);

      // Unconfirmed clinic notes
      const unconfirmedNotes = (clinic.data || []).filter((c: any) => c.teacher_note && !c.teacher_note_shown);

      // Schedule map
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      const scheduleList = (schedules.data || []).map((s: any) => ({
        day: dayNames[s.day_of_week],
        dayNum: s.day_of_week,
        start: s.start_time?.slice(0, 5),
        end: s.end_time?.slice(0, 5),
        className: s.classes?.name,
        subject: s.classes?.subject,
      })).sort((a: any, b: any) => a.dayNum - b.dayNum);

      // Subject teachers
      const subjectTeacherMap: Record<string, string> = {};
      (subjectTeachers.data || []).forEach((st: any) => {
        subjectTeacherMap[st.subject] = st.profiles?.full_name || '-';
      });

      setData({
        lessons: lessons.data || [],
        tests: tests.data || [],
        selfStudy: selfStudy.data || [],
        clinic: clinic.data || [],
        monthCounts: {
          lessons: monthLessons.length,
          tests: monthTests.length,
          selfStudy: monthSelfStudy.length,
          clinic: monthClinic.length,
        },
        unconfirmedNotes,
        scheduleList,
        subjectTeacherMap,
      });
      setLoading(false);
    })();
  }, [student.id]);

  if (loading) {
    return (
      <Card><CardContent className="p-8 space-y-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap mb-4">
            <TabsTrigger value="overview">📊 한눈에 보기</TabsTrigger>
            <TabsTrigger value="lessons">📖 수업</TabsTrigger>
            <TabsTrigger value="tests">🔬 테스트</TabsTrigger>
            <TabsTrigger value="homework">✅ 숙제</TabsTrigger>
            <TabsTrigger value="study-clinic">📚 자습/클리닉</TabsTrigger>
            <TabsTrigger value="feedback">✏️ 피드백</TabsTrigger>
            <TabsTrigger value="progress">📋 진도</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewSection student={student} data={data} />
          </TabsContent>
          <TabsContent value="lessons">
            <LessonsSection lessons={data.lessons} />
          </TabsContent>
          <TabsContent value="tests">
            <TestsSection tests={data.tests} />
          </TabsContent>
          <TabsContent value="homework">
            <HomeworkSection lessons={data.lessons} />
          </TabsContent>
          <TabsContent value="study-clinic">
            <StudyClinicSection selfStudy={data.selfStudy} clinic={data.clinic} />
          </TabsContent>
          <TabsContent value="feedback">
            <FeedbackSection lessons={data.lessons} />
          </TabsContent>
          <TabsContent value="progress">
            <ProgressSection lessons={data.lessons} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Tab 1: Overview ────────────────────────────────────────
function OverviewSection({ student, data }: { student: StudentBasic; data: any }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground text-xs">이름</span><p className="font-semibold">{student.name}</p></div>
            <div><span className="text-muted-foreground text-xs">학년</span><p className="font-semibold">{student.grade || '-'}</p></div>
            <div><span className="text-muted-foreground text-xs">학교</span><p className="font-semibold">{student.school || '-'}</p></div>
            <div><span className="text-muted-foreground text-xs">등원 시작일</span><p className="font-semibold">{student.created_at ? format(parseISO(student.created_at), 'yyyy.MM.dd') : '-'}</p></div>
          </div>
          {Object.keys(data.subjectTeacherMap).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data.subjectTeacherMap).map(([subj, teacher]) => (
                <Badge key={subj} variant="secondary" className="text-xs">{subj}: {teacher as string}</Badge>
              ))}
            </div>
          )}
          {data.scheduleList.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-1">수업 시간표</p>
              <div className="flex flex-wrap gap-2">
                {data.scheduleList.map((s: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {s.day} {s.start}~{s.end} {s.subject}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="이번 달 수업" value={`${data.monthCounts.lessons}회`} icon={<BookOpen className="w-5 h-5" />} iconColor="primary" />
        <StatCard title="이번 달 테스트" value={`${data.monthCounts.tests}회`} icon={<TestTube className="w-5 h-5" />} iconColor="warning" />
        <StatCard title="이번 달 자습" value={`${data.monthCounts.selfStudy}회`} icon={<Clock className="w-5 h-5" />} iconColor="success" />
        <StatCard title="이번 달 클리닉" value={`${data.monthCounts.clinic}회`} icon={<Stethoscope className="w-5 h-5" />} iconColor="destructive" />
      </div>

      {data.unconfirmedNotes.length > 0 && (
        <Alert className="border-destructive/50 bg-destructive/5">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            미확인 클리닉 특이사항이 <strong>{data.unconfirmedNotes.length}건</strong> 있습니다
            <ul className="mt-2 space-y-1 text-xs">
              {data.unconfirmedNotes.slice(0, 3).map((n: any) => (
                <li key={n.id}>• {n.clinic_date} {n.subject}: {n.teacher_note}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ─── Tab 2: Lessons ─────────────────────────────────────────
function LessonsSection({ lessons }: { lessons: any[] }) {
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [page, setPage] = useState(0);
  const PAGE = 20;

  const submitted = lessons.filter(l => l.submitted);

  // Chart data
  const chartData = useMemo(() => {
    const byDate: Record<string, any> = {};
    submitted.filter(l => l.understanding_score != null).forEach(l => {
      const d = l.lesson_date;
      if (!byDate[d]) byDate[d] = { date: d };
      byDate[d][l.subject] = l.understanding_score;
    });
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date)).slice(-30);
  }, [submitted]);

  const subjects = [...new Set(submitted.map(l => l.subject))];

  const filtered = subjectFilter === 'all' ? submitted : submitted.filter(l => l.subject === subjectFilter);
  const totalPages = Math.ceil(filtered.length / PAGE);
  const paged = filtered.slice(page * PAGE, (page + 1) * PAGE);

  const hwLabel: Record<string, string> = { completed: '완료', partial: '일부', not_done: '미이행', none_assigned: '없음' };

  return (
    <div className="space-y-4">
      {chartData.length > 2 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">이해도 추이</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                <ReTooltip />
                <Legend />
                {subjects.map(s => (
                  <Line key={s} type="monotone" dataKey={s} stroke={SUBJECT_COLORS[s] || '#888'} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 items-center">
        <Select value={subjectFilter} onValueChange={v => { setSubjectFilter(v); setPage(0); }}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length}건</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>날짜</TableHead><TableHead>과목</TableHead><TableHead>수업내용</TableHead>
            <TableHead>이해도</TableHead><TableHead>숙제</TableHead><TableHead>메모</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map(l => (
            <TableRow key={l.id}>
              <TableCell className="text-sm">{l.lesson_date?.slice(5)}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{l.subject}</Badge></TableCell>
              <TableCell className="text-sm max-w-[200px] truncate">{l.lesson_range}</TableCell>
              <TableCell className="text-sm">{l.understanding_score ?? '-'}/5</TableCell>
              <TableCell className="text-xs">{hwLabel[l.homework_status] || l.homework_status}</TableCell>
              <TableCell className="text-xs max-w-[150px] truncate">{l.notes || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-xs text-muted-foreground">{page + 1}/{totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Tests ───────────────────────────────────────────
function TestsSection({ tests }: { tests: any[] }) {
  // Pass rate by subject
  const subjectStats = useMemo(() => {
    const map: Record<string, { total: number; passed: number }> = {};
    tests.forEach(t => {
      if (!map[t.subject]) map[t.subject] = { total: 0, passed: 0 };
      map[t.subject].total++;
      if (derivePassed(t.english_pass_fail, t.test_result) === true) map[t.subject].passed++;
    });
    return Object.entries(map).map(([subject, s]) => ({
      subject,
      ...s,
      rate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0,
    }));
  }, [tests]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {subjectStats.map(s => (
          <Card key={s.subject}>
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold">[{s.subject}]</span>
                <span className="text-xs text-muted-foreground">총 {s.total}회 | 통과 {s.passed}회</span>
              </div>
              <Progress value={s.rate} className="h-2" />
              <p className="text-right text-xs font-medium mt-1">{s.rate}%</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">최근 테스트</CardTitle></CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2">
            {tests.slice(0, 20).map(t => {
              const passed = derivePassed(t.english_pass_fail, t.test_result);
              return (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="text-base">{passed === true ? '✅' : passed === false ? '❌' : '➖'}</span>
                  <span className="text-muted-foreground text-xs w-14">{t.lesson_date?.slice(5)}</span>
                  <Badge variant="outline" className="text-xs">{t.subject}</Badge>
                  <span className="truncate">{t.test_content || t.test_title}</span>
                  {t.test_result_text && <span className="text-xs text-muted-foreground ml-auto">{t.test_result_text}</span>}
                </div>
              );
            })}
            {tests.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">테스트 기록이 없습니다</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 4: Homework ────────────────────────────────────────
function HomeworkSection({ lessons }: { lessons: any[] }) {
  const submitted = lessons.filter(l => l.submitted);

  // Monthly chart
  const monthlyData = useMemo(() => {
    const map: Record<string, { month: string; completed: number; partial: number; not_done: number; none: number }> = {};
    submitted.forEach(l => {
      const m = l.lesson_date?.slice(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = { month: m, completed: 0, partial: 0, not_done: 0, none: 0 };
      if (l.homework_status === 'completed') map[m].completed++;
      else if (l.homework_status === 'partial') map[m].partial++;
      else if (l.homework_status === 'not_done') map[m].not_done++;
      else map[m].none++;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  }, [submitted]);

  // Subject rates
  const subjectRates = useMemo(() => {
    const map: Record<string, { total: number; completed: number }> = {};
    submitted.forEach(l => {
      if (!map[l.subject]) map[l.subject] = { total: 0, completed: 0 };
      if (l.homework_status && l.homework_status !== 'none_assigned' && l.homework_status !== 'none') {
        map[l.subject].total++;
        if (l.homework_status === 'completed') map[l.subject].completed++;
      }
    });
    return Object.entries(map).map(([subject, s]) => ({
      subject,
      rate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
      total: s.total,
    }));
  }, [submitted]);

  // Recent not_done
  const notDone = submitted.filter(l => l.homework_status === 'not_done').slice(0, 10);

  return (
    <div className="space-y-4">
      {monthlyData.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">월별 숙제 이행률</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <ReTooltip />
                <Legend />
                <Bar dataKey="completed" name="완료" stackId="a" fill="hsl(var(--success))" />
                <Bar dataKey="partial" name="일부" stackId="a" fill="hsl(var(--warning))" />
                <Bar dataKey="not_done" name="미이행" stackId="a" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {subjectRates.map(s => (
          <Card key={s.subject}>
            <CardContent className="p-4">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-semibold">{s.subject}</span>
                <span className="text-xs text-muted-foreground">{s.rate}% (완료 기준)</span>
              </div>
              <Progress value={s.rate} className="h-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      {notDone.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">최근 미이행</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>날짜</TableHead><TableHead>과목</TableHead><TableHead>내용</TableHead></TableRow></TableHeader>
              <TableBody>
                {notDone.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">{l.lesson_date?.slice(5)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{l.subject}</Badge></TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]">{l.lesson_range}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 5: Study & Clinic ──────────────────────────────────
function StudyClinicSection({ selfStudy, clinic }: { selfStudy: any[]; clinic: any[] }) {
  const totalMins = selfStudy.reduce((sum, r) => sum + (r.duration_minutes ?? calcDuration(r.start_time, r.end_time) ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold mb-2 flex items-center gap-1"><BookOpen className="w-4 h-4" /> 자습 이력</h3>
        <p className="text-xs text-muted-foreground mb-3">총 자습 시간: <strong>{fmtDur(totalMins)}</strong></p>
        <Table>
          <TableHeader><TableRow>
            <TableHead>날짜</TableHead><TableHead>과목</TableHead><TableHead>시간</TableHead><TableHead>학습시간</TableHead><TableHead>할일</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {selfStudy.slice(0, 20).map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{r.study_date?.slice(5)}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{r.subject || '-'}</Badge></TableCell>
                <TableCell className="text-sm">{r.start_time?.slice(0, 5) || '-'}~{r.end_time?.slice(0, 5) || '-'}</TableCell>
                <TableCell className="text-sm">{fmtDur(r.duration_minutes ?? calcDuration(r.start_time, r.end_time))}</TableCell>
                <TableCell className="text-xs">{(() => {
                  const tasks = Array.isArray(r.task_list) ? r.task_list : [];
                  if (tasks.length === 0) return '-';
                  const done = tasks.filter((t: any) => t.done).length;
                  return `${done}/${tasks.length}`;
                })()}</TableCell>
              </TableRow>
            ))}
            {selfStudy.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">기록 없음</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <div>
        <h3 className="text-sm font-bold mb-2 flex items-center gap-1"><Stethoscope className="w-4 h-4" /> 클리닉 이력</h3>
        <Table>
          <TableHeader><TableRow>
            <TableHead>날짜</TableHead><TableHead>과목</TableHead><TableHead>담당</TableHead><TableHead>내용</TableHead><TableHead>다음예정</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {clinic.slice(0, 20).map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{r.clinic_date?.slice(5)}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{r.subject}</Badge></TableCell>
                <TableCell className="text-sm">{r.profiles?.full_name || '-'}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{r.content}</TableCell>
                <TableCell className="text-xs">{r.next_clinic_memo || '-'}</TableCell>
              </TableRow>
            ))}
            {clinic.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">기록 없음</TableCell></TableRow>}
          </TableBody>
        </Table>

        {/* Teacher notes timeline */}
        {clinic.filter((c: any) => c.teacher_note).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">선생님 특이사항 모음</p>
            <div className="space-y-2">
              {clinic.filter((c: any) => c.teacher_note).slice(0, 15).map((c: any) => (
                <div key={c.id} className="flex items-start gap-2 text-sm border-l-2 border-border pl-3 py-1">
                  <span className="text-xs text-muted-foreground w-14 shrink-0">{c.clinic_date?.slice(5)}</span>
                  <Badge variant="outline" className="text-xs shrink-0">{c.subject}</Badge>
                  <span className="flex-1">{c.teacher_note}</span>
                  {c.teacher_note_shown ? (
                    <Badge className="bg-success/10 text-success border-success/30 text-xs shrink-0">확인</Badge>
                  ) : (
                    <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-xs shrink-0">미확인</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 6: Feedback ────────────────────────────────────────
function FeedbackSection({ lessons }: { lessons: any[] }) {
  const [subjectFilter, setSubjectFilter] = useState('all');

  const feedbackLessons = lessons.filter(l =>
    l.submitted && (l.notes || l.next_lesson_goal || l.learning_issues_note || (l.learning_issues && l.learning_issues.length > 0))
  );

  const filtered = subjectFilter === 'all' ? feedbackLessons : feedbackLessons.filter(l => l.subject === subjectFilter);

  return (
    <div className="space-y-3">
      <Select value={subjectFilter} onValueChange={setSubjectFilter}>
        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">피드백 기록이 없습니다</p>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, 30).map(l => (
            <div key={l.id} className="border-l-2 border-primary/30 pl-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-muted-foreground">{l.lesson_date}</span>
                <Badge variant="outline" className="text-xs">{l.subject}</Badge>
              </div>
              {l.notes && <p className="text-sm">📝 {l.notes}</p>}
              {l.next_lesson_goal && <p className="text-sm">🎯 {l.next_lesson_goal}</p>}
              {l.learning_issues && l.learning_issues.length > 0 && (
                <p className="text-sm">⚠️ {l.learning_issues.join(', ')}</p>
              )}
              {l.learning_issues_note && <p className="text-sm text-muted-foreground">💬 {l.learning_issues_note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 7: Progress ────────────────────────────────────────
function ProgressSection({ lessons }: { lessons: any[] }) {
  const submitted = lessons.filter(l => l.submitted);
  const subjects = [...new Set(submitted.map(l => l.subject))];

  return (
    <div className="space-y-4">
      {subjects.map(subj => {
        const subjLessons = submitted.filter(l => l.subject === subj);
        const latest = subjLessons[0];
        const recent5 = subjLessons.slice(0, 5);

        return (
          <Card key={subj}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">{subj}</Badge>
                {latest && <span className="text-xs text-muted-foreground">마지막 수업: {latest.lesson_date}</span>}
              </div>
              {latest && (
                <p className="text-sm font-medium mb-3">{latest.lesson_range}</p>
              )}
              <div className="space-y-1">
                {recent5.map(l => (
                  <div key={l.id} className="flex items-center gap-2 text-xs border-l-2 border-border pl-2 py-0.5">
                    <span className="text-muted-foreground w-14">{l.lesson_date?.slice(5)}</span>
                    <span className="truncate">{l.lesson_range}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {subjects.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">수업 기록이 없습니다</p>
      )}
    </div>
  );
}
