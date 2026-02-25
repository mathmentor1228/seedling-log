// HOMEWORK-STATS-V1
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ClipboardCheck, Camera, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';

interface TeacherHwStat {
  teacherId: string;
  teacherName: string;
  totalAssigned: number;
  withSubmissions: number;
  checked: number;
  avgSubmissionRate: number;
}

interface StudentHwStat {
  studentId: string;
  studentName: string;
  grade: string | null;
  totalAssigned: number;
  totalSubmissions: number;
  requiredTotal: number;
  completionRate: number;
  teacherName: string;
  subjects: string[];
}

export default function HomeworkStatsSection() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [teacherStats, setTeacherStats] = useState<TeacherHwStat[]>([]);
  const [studentStats, setStudentStats] = useState<StudentHwStat[]>([]);
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'completionRate' | 'totalAssigned'>('completionRate');

  const fetchStats = async () => {
    setLoading(true);
    const sinceDate = format(subDays(startOfDay(new Date()), Number(period)), 'yyyy-MM-dd');

    // Fetch homework assignments in period (submissions are stored directly on this table)
    const { data: assignments, error: hwErr } = await supabase
      .from('homework_assignments')
      .select('id, student_id, subject, assigned_date, check_status, required_submissions, created_by, submitted_at, submission_image_url')
      .gte('assigned_date', sinceDate);

    if (hwErr) { console.error(hwErr); setLoading(false); return; }

    // Fetch students and teachers
    const { data: students } = await supabase.from('students').select('id, name, grade').eq('enrollment_status', '재원');
    const { data: profiles } = await supabase.from('profiles').select('id, full_name');

    const studentMap = new Map((students || []).map(s => [s.id, s]));
    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    // --- Teacher stats ---
    const teacherAgg = new Map<string, { assigned: number; withSub: number; checked: number }>();
    for (const hw of assignments || []) {
      const tid = hw.created_by || 'unknown';
      if (!teacherAgg.has(tid)) teacherAgg.set(tid, { assigned: 0, withSub: 0, checked: 0 });
      const agg = teacherAgg.get(tid)!;
      agg.assigned++;
      if (hw.submitted_at) agg.withSub++;
      if (hw.check_status !== 'unchecked') agg.checked++;
    }
    const tStats: TeacherHwStat[] = [];
    for (const [tid, agg] of teacherAgg) {
      const profile = profileMap.get(tid);
      tStats.push({
        teacherId: tid,
        teacherName: profile?.full_name || '(알 수 없음)',
        totalAssigned: agg.assigned,
        withSubmissions: agg.withSub,
        checked: agg.checked,
        avgSubmissionRate: agg.assigned > 0 ? Math.round((agg.withSub / agg.assigned) * 100) : 0,
      });
    }
    tStats.sort((a, b) => b.totalAssigned - a.totalAssigned);
    setTeacherStats(tStats);

    // --- Student stats ---
    const studentAgg = new Map<string, {
      assigned: number; subs: number; reqTotal: number;
      teachers: Set<string>; subjects: Set<string>;
    }>();

    for (const hw of assignments || []) {
      const sid = hw.student_id;
      if (!studentAgg.has(sid)) {
        studentAgg.set(sid, { assigned: 0, subs: 0, reqTotal: 0, teachers: new Set(), subjects: new Set() });
      }
      const agg = studentAgg.get(sid)!;
      agg.assigned++;
      agg.reqTotal += hw.required_submissions || 1;
      agg.subs += hw.submitted_at ? 1 : 0;
      if (hw.created_by) agg.teachers.add(hw.created_by);
      if (hw.subject) agg.subjects.add(hw.subject);
    }

    const sStats: StudentHwStat[] = [];
    for (const [sid, agg] of studentAgg) {
      const student = studentMap.get(sid);
      if (!student) continue;
      const teacherNames = [...agg.teachers].map(tid => profileMap.get(tid)?.full_name || '').filter(Boolean);
      sStats.push({
        studentId: sid,
        studentName: student.name,
        grade: student.grade,
        totalAssigned: agg.assigned,
        totalSubmissions: agg.subs,
        requiredTotal: agg.reqTotal,
        completionRate: agg.reqTotal > 0 ? Math.round((agg.subs / agg.reqTotal) * 100) : 0,
        teacherName: teacherNames.join(', ') || '-',
        subjects: [...agg.subjects],
      });
    }
    setStudentStats(sStats);
    setLoading(false);
  };

  useEffect(() => { fetchStats(); }, [period]);

  const filteredStudents = useMemo(() => {
    let list = [...studentStats];
    if (teacherFilter !== 'all') {
      list = list.filter(s => s.teacherName.includes(teacherFilter));
    }
    list.sort((a, b) => sortBy === 'completionRate'
      ? a.completionRate - b.completionRate
      : b.totalAssigned - a.totalAssigned
    );
    return list;
  }, [studentStats, teacherFilter, sortBy]);

  const uniqueTeachers = useMemo(() => {
    const names = new Set<string>();
    teacherStats.forEach(t => names.add(t.teacherName));
    return [...names].filter(n => n !== '(알 수 없음)');
  }, [teacherStats]);

  const getRateColor = (rate: number) => {
    if (rate >= 80) return 'text-emerald-600';
    if (rate >= 50) return 'text-amber-600';
    return 'text-destructive';
  };

  const getRateBadge = (rate: number) => {
    if (rate >= 80) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300';
    if (rate >= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
    return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <ClipboardCheck className="w-4.5 h-4.5" />
          숙제 인증 통계
        </h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">최근 7일</SelectItem>
            <SelectItem value="14">최근 14일</SelectItem>
            <SelectItem value="30">최근 30일</SelectItem>
            <SelectItem value="60">최근 60일</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Teacher Usage Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">선생님별 숙제 관리 현황</CardTitle>
        </CardHeader>
        <CardContent>
          {teacherStats.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">해당 기간 숙제 데이터가 없습니다</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>선생님</TableHead>
                  <TableHead className="text-center">출제 건수</TableHead>
                  <TableHead className="text-center">인증 제출됨</TableHead>
                  <TableHead className="text-center">확인 완료</TableHead>
                  <TableHead className="text-center">인증률</TableHead>
                  <TableHead className="text-center">확인률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teacherStats.map((t) => (
                  <TableRow key={t.teacherId}>
                    <TableCell className="font-medium">{t.teacherName}</TableCell>
                    <TableCell className="text-center">{t.totalAssigned}</TableCell>
                    <TableCell className="text-center">
                      <span className="flex items-center justify-center gap-1">
                        <Camera className="w-3 h-3 text-muted-foreground" />
                        {t.withSubmissions}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{t.checked}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={getRateBadge(t.avgSubmissionRate)}>
                        {t.avgSubmissionRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={getRateBadge(t.totalAssigned > 0 ? Math.round((t.checked / t.totalAssigned) * 100) : 0)}>
                        {t.totalAssigned > 0 ? Math.round((t.checked / t.totalAssigned) * 100) : 0}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Student Completion Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">학생별 숙제 이행률</CardTitle>
          <div className="flex flex-wrap gap-3 mt-3">
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="선생님" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 선생님</SelectItem>
                {uniqueTeachers.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completionRate">이행률 낮은순</SelectItem>
                <SelectItem value="totalAssigned">출제 많은순</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학생명</TableHead>
                  <TableHead>학년</TableHead>
                  <TableHead>과목</TableHead>
                  <TableHead className="text-center">출제</TableHead>
                  <TableHead className="text-center">인증</TableHead>
                  <TableHead className="text-center">이행률</TableHead>
                  <TableHead>담당</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((s) => (
                    <TableRow key={s.studentId}>
                      <TableCell className="font-medium">{s.studentName}</TableCell>
                      <TableCell>{s.grade || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {s.subjects.map(subj => (
                            <Badge key={subj} variant="outline" className="text-xs">{subj}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{s.totalAssigned}</TableCell>
                      <TableCell className="text-center">
                        {s.totalSubmissions}/{s.requiredTotal}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-semibold ${getRateColor(s.completionRate)}`}>
                          {s.completionRate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{s.teacherName}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      조건에 맞는 데이터가 없습니다
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            총 {filteredStudents.length}명
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
