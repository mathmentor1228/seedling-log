// MONTHLY-TEACHER-STUDENT-STATS-V1
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarDays, Users } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

interface MonthlyRow {
  teacher_id: string;
  teacher_name: string;
  month: string; // YYYY-MM
  student_count: number;
  subjects: string[];
}

export default function MonthlyTeacherStudentStats() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [monthRange, setMonthRange] = useState('6'); // last N months

  // Generate month options
  const months = useMemo(() => {
    const n = parseInt(monthRange);
    const result: string[] = [];
    for (let i = 0; i < n; i++) {
      result.push(format(subMonths(new Date(), i), 'yyyy-MM'));
    }
    return result;
  }, [monthRange]);

  useEffect(() => {
    fetchData();
  }, [monthRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const n = parseInt(monthRange);
      const from = format(startOfMonth(subMonths(new Date(), n - 1)), 'yyyy-MM-dd');
      const to = format(endOfMonth(new Date()), 'yyyy-MM-dd');

      // Fetch lesson records (including drafts) - paginate to avoid 1000 row limit
      let allLessons: { teacher_id: string; student_id: string; lesson_date: string; subject: string }[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error: batchError } = await supabase
          .from('lesson_records')
          .select('teacher_id, student_id, lesson_date, subject')
          .gte('lesson_date', from)
          .lte('lesson_date', to)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (batchError) {
          console.error('Monthly stats error:', batchError);
          setLoading(false);
          return;
        }
        allLessons = allLessons.concat(batch || []);
        hasMore = (batch?.length || 0) === pageSize;
        page++;
      }

      const lessons = allLessons;
      const error = null;

      if (error) {
        console.error('Monthly stats error:', error);
        setLoading(false);
        return;
      }

      // Fetch teacher names
      const teacherIds = [...new Set((lessons || []).map(l => l.teacher_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds.length > 0 ? teacherIds : ['__none__']);

      const nameMap: Record<string, string> = {};
      (profiles || []).forEach(p => { nameMap[p.id] = p.full_name; });

      // Group: teacher_id + month → unique students & subjects
      const grouped: Record<string, { students: Set<string>; subjects: Set<string> }> = {};
      (lessons || []).forEach(l => {
        const month = l.lesson_date.slice(0, 7);
        const key = `${l.teacher_id}__${month}`;
        if (!grouped[key]) grouped[key] = { students: new Set(), subjects: new Set() };
        grouped[key].students.add(l.student_id);
        grouped[key].subjects.add(l.subject);
      });

      const result: MonthlyRow[] = Object.entries(grouped).map(([key, val]) => {
        const [tid, month] = key.split('__');
        return {
          teacher_id: tid,
          teacher_name: nameMap[tid] || '(알 수 없음)',
          month,
          student_count: val.students.size,
          subjects: [...val.subjects],
        };
      });

      // Sort by month desc, then teacher name
      result.sort((a, b) => b.month.localeCompare(a.month) || a.teacher_name.localeCompare(b.teacher_name));
      setRows(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Pivot: teachers as rows, months as columns
  const teachers = useMemo(() => {
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.teacher_id] = r.teacher_name; });
    return Object.entries(map)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const dataMap = useMemo(() => {
    const m: Record<string, MonthlyRow> = {};
    rows.forEach(r => { m[`${r.teacher_id}__${r.month}`] = r; });
    return m;
  }, [rows]);

  const sortedMonths = useMemo(() => [...months].sort((a, b) => a.localeCompare(b)), [months]);

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-56" /></CardHeader>
        <CardContent><Skeleton className="h-40" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            월별 선생님 담당 학생 수
          </CardTitle>
          <Select value={monthRange} onValueChange={setMonthRange}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">최근 3개월</SelectItem>
              <SelectItem value="6">최근 6개월</SelectItem>
              <SelectItem value="12">최근 12개월</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground mt-1">수업 기록 기준, 선생님별 월간 고유 학생 수</p>
      </CardHeader>
      <CardContent>
        {teachers.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            해당 기간 수업 기록이 없습니다
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[80px]">선생님</TableHead>
                  {sortedMonths.map(m => (
                    <TableHead key={m} className="text-center min-w-[70px] text-xs">
                      {m.slice(2).replace('-', '.')}
                    </TableHead>
                  ))}
                  <TableHead className="text-center min-w-[60px] text-xs font-semibold">평균</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map(teacher => {
                  const counts = sortedMonths.map(m => dataMap[`${teacher.id}__${m}`]?.student_count || 0);
                  const nonZero = counts.filter(c => c > 0);
                  const avg = nonZero.length > 0 ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length) : 0;

                  return (
                    <TableRow key={teacher.id}>
                      <TableCell className="sticky left-0 bg-background z-10 font-medium text-sm whitespace-nowrap">
                        {teacher.name}
                      </TableCell>
                      {sortedMonths.map((m, i) => {
                        const row = dataMap[`${teacher.id}__${m}`];
                        const count = row?.student_count || 0;
                        return (
                          <TableCell key={m} className="text-center">
                            {count > 0 ? (
                              <div>
                                <span className="font-mono text-sm font-medium">{count}</span>
                                {row && row.subjects.length > 0 && (
                                  <div className="flex gap-0.5 justify-center mt-0.5 flex-wrap">
                                    {row.subjects.map(s => (
                                      <span key={s} className="text-[9px] text-muted-foreground">{s.charAt(0)}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs font-mono">{avg}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
