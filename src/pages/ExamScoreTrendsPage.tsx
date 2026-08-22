import { ProtectedRoute } from '@/components/ProtectedRoute';
// EXAM-SCORE-TRENDS-V1: 학생별 내신 성적 추이 + 가장 많이 오른 학생 랭킹
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  TrendingUp, TrendingDown, Minus, Search, Trophy, BarChart3, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';

type Row = {
  id: string;
  student_id: string;
  subject: string;
  exam_type: string;
  exam_year: number | null;
  exam_period: string | null;
  actual_score: number | null;
  exam_date: string | null;
  submitted_at: string;
  school_name: string;
};

type Student = { id: string; name: string; school: string | null; grade_year: number | null };

const SUBJECT_COLORS: Record<string, string> = {
  수학: 'hsl(217 91% 60%)',
  영어: 'hsl(142 71% 45%)',
  국어: 'hsl(271 76% 53%)',
  과학: 'hsl(25 95% 53%)',
  사회: 'hsl(0 84% 60%)',
};

// "1-a" -> 1학기 중간 / "1-b" -> 1학기 기말 같은 표기. period: "1-a","1-b","2-a","2-b"
function periodLabel(year: number | null, period: string | null, examType: string) {
  if (!year && !period) return examType;
  const sem = period?.startsWith('2') ? '2학기' : '1학기';
  const mf = period?.endsWith('a') ? '중간' : period?.endsWith('b') ? '기말' : '';
  return `${year ? String(year).slice(2) + '년 ' : ''}${sem} ${mf}`.trim();
}

function periodSortKey(year: number | null, period: string | null) {
  // year * 10 + (1-a=1, 1-b=2, 2-a=3, 2-b=4)
  const m: Record<string, number> = { '1-a': 1, '1-b': 2, '2-a': 3, '2-b': 4 };
  return (year ?? 0) * 10 + (period ? m[period] ?? 0 : 0);
}

function ExamScoreTrendsContent() {
  const [rows, setRows] = useState<Row[]>([]);
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [r1, r2] = await Promise.all([
        supabase
          .from('student_exam_results')
          .select('id,student_id,subject,exam_type,exam_year,exam_period,actual_score,exam_date,submitted_at,school_name')
          .not('actual_score', 'is', null)
          .order('exam_year', { ascending: true })
          .order('exam_period', { ascending: true }),
        supabase.from('students').select('id,name,school,grade_year').neq('enrollment_status', '퇴원'),
      ]);
      setRows((r1.data as Row[]) || []);
      const map: Record<string, Student> = {};
      (r2.data || []).forEach((s: any) => (map[s.id] = s));
      setStudents(map);
      setLoading(false);
    })();
  }, []);

  const subjects = useMemo(
    () => Array.from(new Set(rows.map(r => r.subject))).sort(),
    [rows]
  );

  // Group rows: studentId -> subject -> sorted scores
  type Series = { key: string; label: string; score: number; sort: number };
  const studentMap = useMemo(() => {
    const m: Record<string, Record<string, Series[]>> = {};
    rows.forEach(r => {
      if (r.actual_score == null) return;
      if (subjectFilter !== 'all' && r.subject !== subjectFilter) return;
      const sid = r.student_id;
      if (!m[sid]) m[sid] = {};
      if (!m[sid][r.subject]) m[sid][r.subject] = [];
      m[sid][r.subject].push({
        key: `${r.exam_year}-${r.exam_period}-${r.exam_type}`,
        label: periodLabel(r.exam_year, r.exam_period, r.exam_type),
        score: Number(r.actual_score),
        sort: periodSortKey(r.exam_year, r.exam_period),
      });
    });
    // sort each series
    Object.values(m).forEach(subj => {
      Object.values(subj).forEach(arr => arr.sort((a, b) => a.sort - b.sort));
    });
    return m;
  }, [rows, subjectFilter]);

  // Top improvers: per (student, subject) compute latest - earliest (need >= 2 points)
  type Improver = {
    studentId: string;
    studentName: string;
    school: string;
    subject: string;
    first: Series;
    last: Series;
    delta: number;
    count: number;
  };
  const improvers = useMemo<Improver[]>(() => {
    const list: Improver[] = [];
    Object.entries(studentMap).forEach(([sid, subjs]) => {
      const stu = students[sid];
      if (!stu) return;
      Object.entries(subjs).forEach(([subject, series]) => {
        if (series.length < 2) return;
        const first = series[0];
        const last = series[series.length - 1];
        list.push({
          studentId: sid,
          studentName: stu.name,
          school: stu.school || '',
          subject,
          first,
          last,
          delta: last.score - first.score,
          count: series.length,
        });
      });
    });
    return list.sort((a, b) => b.delta - a.delta);
  }, [studentMap, students]);

  const topRisers = improvers.slice(0, 10);
  const topFallers = [...improvers].sort((a, b) => a.delta - b.delta).slice(0, 5);

  const filteredStudentIds = useMemo(() => {
    const ids = Object.keys(studentMap).filter(sid => {
      const s = students[sid];
      if (!s) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return s.name.toLowerCase().includes(q) || (s.school || '').toLowerCase().includes(q);
    });
    // sort by max delta (most improved first)
    return ids.sort((a, b) => {
      const da = Math.max(
        ...Object.values(studentMap[a]).map(arr =>
          arr.length >= 2 ? arr[arr.length - 1].score - arr[0].score : -Infinity
        ),
        -Infinity
      );
      const db = Math.max(
        ...Object.values(studentMap[b]).map(arr =>
          arr.length >= 2 ? arr[arr.length - 1].score - arr[0].score : -Infinity
        ),
        -Infinity
      );
      return db - da;
    });
  }, [studentMap, students, search]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            내신 성적 추이
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            학생별 시험 점수 변화와 가장 많이 향상된 학생을 확인할 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전 과목</SelectItem>
              {subjects.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking" className="gap-1.5">
            <Trophy className="w-4 h-4" /> 향상도 랭킹
          </TabsTrigger>
          <TabsTrigger value="students" className="gap-1.5">
            <BarChart3 className="w-4 h-4" /> 학생별 추이
          </TabsTrigger>
        </TabsList>

        {/* ========= RANKING TAB ========= */}
        <TabsContent value="ranking" className="space-y-4 mt-4">
          {improvers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                2회 이상 시험 점수가 등록된 학생이 없습니다.
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-3 gap-4 min-w-0">
              {/* Top Risers */}
              <Card className="md:col-span-2 min-w-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    가장 많이 오른 TOP 10
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {topRisers.map((imp, i) => (
                    <RiserRow key={`${imp.studentId}-${imp.subject}`} imp={imp} rank={i + 1} />
                  ))}
                </CardContent>
              </Card>

              {/* Top Fallers */}
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingDown className="w-5 h-5 text-red-500" />
                    하락폭 TOP 5
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {topFallers.map((imp, i) => (
                    <RiserRow key={`${imp.studentId}-${imp.subject}`} imp={imp} rank={i + 1} variant="down" />
                  ))}
                  {topFallers.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">하락한 학생이 없습니다.</p>
                  )}
                </CardContent>
              </Card>

              {/* Summary stats */}
              <Card className="md:col-span-3 min-w-0">
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5">
                  <Stat label="시험 본 학생" value={Object.keys(studentMap).length} suffix="명" />
                  <Stat
                    label="향상된 학생"
                    value={improvers.filter(i => i.delta > 0).length}
                    suffix="건"
                    color="text-emerald-600"
                  />
                  <Stat
                    label="하락한 학생"
                    value={improvers.filter(i => i.delta < 0).length}
                    suffix="건"
                    color="text-red-600"
                  />
                  <Stat
                    label="평균 변화"
                    value={
                      improvers.length
                        ? (improvers.reduce((s, i) => s + i.delta, 0) / improvers.length).toFixed(1)
                        : '0'
                    }
                    suffix="점"
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ========= STUDENTS TAB ========= */}
        <TabsContent value="students" className="space-y-4 mt-4">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="학생 이름 또는 학교명 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 min-w-0">
            {filteredStudentIds.map(sid => (
              <StudentTrendCard
                key={sid}
                student={students[sid]}
                subjects={studentMap[sid]}
              />
            ))}
          </div>
          {filteredStudentIds.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                해당 학생을 찾을 수 없습니다.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, suffix, color }: { label: string; value: number | string; suffix?: string; color?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color || ''}`}>
        {value}
        <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>
      </p>
    </div>
  );
}

function RiserRow({
  imp,
  rank,
  variant = 'up',
}: {
  imp: any;
  rank: number;
  variant?: 'up' | 'down';
}) {
  const isUp = variant === 'up';
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors">
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          rank === 1
            ? 'bg-amber-500/20 text-amber-600'
            : rank === 2
            ? 'bg-slate-400/20 text-slate-600'
            : rank === 3
            ? 'bg-orange-600/20 text-orange-700'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{imp.studentName}</span>
          <Badge
            variant="outline"
            className="text-[10px] shrink-0"
            style={{
              borderColor: SUBJECT_COLORS[imp.subject],
              color: SUBJECT_COLORS[imp.subject],
            }}
          >
            {imp.subject}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {imp.school} · {imp.first.label} {imp.first.score}점 → {imp.last.label} {imp.last.score}점
        </p>
      </div>
      <div
        className={`shrink-0 flex items-center gap-0.5 font-bold text-sm ${
          isUp ? 'text-emerald-600' : 'text-red-600'
        }`}
      >
        {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
        {imp.delta > 0 ? '+' : ''}
        {imp.delta.toFixed(0)}점
      </div>
    </div>
  );
}

function StudentTrendCard({
  student,
  subjects,
}: {
  student: Student | undefined;
  subjects: Record<string, { key: string; label: string; score: number; sort: number }[]>;
}) {
  if (!student) return null;

  // Merge into a single chart dataset: x = period label
  const allKeys = new Map<string, { label: string; sort: number }>();
  Object.values(subjects).forEach(arr => {
    arr.forEach(p => allKeys.set(p.label, { label: p.label, sort: p.sort }));
  });
  const xs = Array.from(allKeys.values()).sort((a, b) => a.sort - b.sort);
  const chartData = xs.map(x => {
    const row: any = { label: x.label };
    Object.entries(subjects).forEach(([subj, arr]) => {
      const found = arr.find(p => p.label === x.label);
      if (found) row[subj] = found.score;
    });
    return row;
  });

  // Per-subject delta
  const deltas = Object.entries(subjects).map(([subj, arr]) => ({
    subject: subj,
    delta: arr.length >= 2 ? arr[arr.length - 1].score - arr[0].score : null,
    latest: arr[arr.length - 1]?.score ?? null,
    count: arr.length,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{student.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {student.school || '학교 미등록'}
              {student.grade_year ? ` · ${student.grade_year}학년` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-end">
            {deltas.map(d => (
              <div
                key={d.subject}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                style={{
                  backgroundColor: `${SUBJECT_COLORS[d.subject] || 'hsl(var(--muted))'}15`,
                  color: SUBJECT_COLORS[d.subject] || 'inherit',
                }}
              >
                <span className="font-medium">{d.subject}</span>
                {d.delta == null ? (
                  <Minus className="w-3 h-3" />
                ) : d.delta > 0 ? (
                  <span className="font-bold">+{d.delta.toFixed(0)}</span>
                ) : d.delta < 0 ? (
                  <span className="font-bold">{d.delta.toFixed(0)}</span>
                ) : (
                  <Minus className="w-3 h-3" />
                )}
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length < 2 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            추이를 그리려면 2회 이상 시험 점수가 필요합니다. (현재 {chartData.length}회)
          </p>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="2 2" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                {Object.keys(subjects).map(subj => (
                  <Line
                    key={subj}
                    type="monotone"
                    dataKey={subj}
                    stroke={SUBJECT_COLORS[subj] || 'hsl(var(--primary))'}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExamScoreTrendsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']} noLayout>
      <ExamScoreTrendsContent />
    </ProtectedRoute>
  );
}
