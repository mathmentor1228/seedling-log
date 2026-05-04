// STUDENT-POINTS-STATS-V1
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
import { Star, TrendingUp, TrendingDown, Medal, Trophy } from 'lucide-react';

interface StudentPointRow {
  id: string;
  name: string;
  grade: string | null;
  total_points: number;
  recent_earned: number;
  recent_deducted: number;
}

export default function StudentPointsStatsSection() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentPointRow[]>([]);
  const [gradeFilter, setGradeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'points_desc' | 'points_asc' | 'recent_desc'>('points_desc');
  const [period, setPeriod] = useState('30');

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - Number(period));
    const sinceStr = sinceDate.toISOString();

    // Fetch students and recent point history in parallel
    const [studentsRes, historyRes] = await Promise.all([
      supabase.from('students').select('id, name, grade, total_points').in('enrollment_status', ['재학', '재등원']),
      supabase.from('student_point_history').select('student_id, points').gte('created_at', sinceStr),
    ]);

    if (studentsRes.error || historyRes.error) {
      console.error(studentsRes.error, historyRes.error);
      setLoading(false);
      return;
    }

    // Aggregate recent history
    const recentMap = new Map<string, { earned: number; deducted: number }>();
    for (const h of historyRes.data || []) {
      if (!recentMap.has(h.student_id)) recentMap.set(h.student_id, { earned: 0, deducted: 0 });
      const agg = recentMap.get(h.student_id)!;
      if (h.points > 0) agg.earned += h.points;
      else agg.deducted += h.points;
    }

    const rows: StudentPointRow[] = (studentsRes.data || []).map(s => {
      const recent = recentMap.get(s.id);
      return {
        id: s.id,
        name: s.name,
        grade: s.grade,
        total_points: s.total_points ?? 0,
        recent_earned: recent?.earned ?? 0,
        recent_deducted: recent?.deducted ?? 0,
      };
    });

    setStudents(rows);
    setLoading(false);
  };

  const grades = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => { if (s.grade) set.add(s.grade); });
    return Array.from(set).sort();
  }, [students]);

  const filtered = useMemo(() => {
    let list = students;
    if (gradeFilter !== 'all') list = list.filter(s => s.grade === gradeFilter);

    switch (sortBy) {
      case 'points_desc': list = [...list].sort((a, b) => b.total_points - a.total_points); break;
      case 'points_asc': list = [...list].sort((a, b) => a.total_points - b.total_points); break;
      case 'recent_desc': list = [...list].sort((a, b) => b.recent_earned - a.recent_earned); break;
    }
    return list;
  }, [students, gradeFilter, sortBy]);

  // Top 3 for display
  const top3 = useMemo(() => {
    return [...students].sort((a, b) => b.total_points - a.total_points).slice(0, 3);
  }, [students]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">학생 포인트 현황</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48" /></CardContent>
      </Card>
    );
  }

  const totalPoints = students.reduce((sum, s) => sum + s.total_points, 0);
  const avgPoints = students.length > 0 ? Math.round(totalPoints / students.length) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-amber-500" />
        <h2 className="text-base font-semibold">학생 포인트 현황</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">전체 학생 수</p>
          <p className="text-xl font-bold">{students.length}명</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">평균 포인트</p>
          <p className="text-xl font-bold">{avgPoints}점</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">최고 포인트</p>
          <p className="text-xl font-bold">{top3[0]?.total_points ?? 0}점</p>
          {top3[0] && <p className="text-[11px] text-muted-foreground">{top3[0].name}</p>}
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">최저 포인트</p>
          <p className="text-xl font-bold">
            {students.length > 0 ? Math.min(...students.map(s => s.total_points)) : 0}점
          </p>
        </div>
      </div>

      {/* Top 3 */}
      {top3.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {top3.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              {i === 0 && <Trophy className="w-4 h-4 text-amber-500" />}
              {i === 1 && <Medal className="w-4 h-4 text-gray-400" />}
              {i === 2 && <Medal className="w-4 h-4 text-amber-700" />}
              <span className="text-sm font-medium">{i + 1}위 {s.name}</span>
              <Badge variant="outline" className="text-xs">{s.total_points}점</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">학생별 포인트 상세</CardTitle>
          <div className="flex flex-wrap gap-3 mt-3">
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

            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="학년" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 학년</SelectItem>
                {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="points_desc">포인트 높은 순</SelectItem>
                <SelectItem value="points_asc">포인트 낮은 순</SelectItem>
                <SelectItem value="recent_desc">최근 획득 순</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>학생명</TableHead>
                  <TableHead>학년</TableHead>
                  <TableHead className="text-right">총 포인트</TableHead>
                  <TableHead className="text-right">최근 획득</TableHead>
                  <TableHead className="text-right">최근 차감</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length > 0 ? filtered.map((s, idx) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.grade || '-'}</TableCell>
                    <TableCell className="text-right font-semibold">{s.total_points}점</TableCell>
                    <TableCell className="text-right">
                      {s.recent_earned > 0 ? (
                        <span className="text-emerald-600 flex items-center justify-end gap-0.5">
                          <TrendingUp className="w-3 h-3" />+{s.recent_earned}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.recent_deducted < 0 ? (
                        <span className="text-red-500 flex items-center justify-end gap-0.5">
                          <TrendingDown className="w-3 h-3" />{s.recent_deducted}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      학생이 없습니다
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground mt-3">총 {filtered.length}명</p>
        </CardContent>
      </Card>
    </div>
  );
}
