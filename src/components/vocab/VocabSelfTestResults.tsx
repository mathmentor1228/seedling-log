import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Zap, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface Row {
  id: string;
  student_id: string;
  student_name: string;
  completed_at: string;
  correct_count: number;
  wrong_count: number;
  total_count: number;
  mode: string;
  duration_seconds: number | null;
  expected_seconds: number | null;
  notified_teacher_id: string | null;
  self_test_options: any;
}

const RANGES = [
  { value: '7', label: '최근 7일' },
  { value: '14', label: '최근 14일' },
  { value: '30', label: '최근 30일' },
];

export function VocabSelfTestResults() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState('14');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');

  useEffect(() => {
    void load();
  }, [days, scope, user?.id]);

  async function load() {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - Number(days));

    let query = supabase
      .from('vocab_card_completions')
      .select('id, student_id, completed_at, correct_count, wrong_count, total_count, mode, duration_seconds, expected_seconds, notified_teacher_id, self_test_options, students(name)')
      .eq('is_self_test', true)
      .gte('completed_at', since.toISOString())
      .order('completed_at', { ascending: false })
      .limit(500);

    if (scope === 'mine' && user?.id) {
      query = query.eq('notified_teacher_id', user.id);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data || []).map((r: any) => ({
        id: r.id,
        student_id: r.student_id,
        student_name: r.students?.name ?? '—',
        completed_at: r.completed_at,
        correct_count: r.correct_count,
        wrong_count: r.wrong_count,
        total_count: r.total_count,
        mode: r.mode,
        duration_seconds: r.duration_seconds,
        expected_seconds: r.expected_seconds,
        notified_teacher_id: r.notified_teacher_id,
        self_test_options: r.self_test_options,
      })));
    }
    setLoading(false);
  }

  const summary = useMemo(() => {
    const total = rows.length;
    const overTime = rows.filter(r => r.duration_seconds && r.expected_seconds && r.duration_seconds > r.expected_seconds).length;
    const avgScore = total > 0
      ? Math.round(rows.reduce((s, r) => s + (r.total_count > 0 ? (r.correct_count / r.total_count) * 100 : 0), 0) / total)
      : 0;
    return { total, overTime, avgScore };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="w-4 h-4 text-primary" />
          학생 셀프 테스트 결과
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={scope} onValueChange={v => setScope(v as 'mine' | 'all')}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">담당 학생만</SelectItem>
              <SelectItem value="all">전체</SelectItem>
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex gap-2 text-xs">
            <Badge variant="outline">총 {summary.total}건</Badge>
            <Badge variant="outline">평균 {summary.avgScore}%</Badge>
            <Badge variant={summary.overTime > 0 ? 'destructive' : 'outline'} className="gap-1">
              <AlertTriangle className="w-3 h-3" /> 시간 초과 {summary.overTime}건
            </Badge>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">최근 셀프 테스트 기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">완료</TableHead>
                  <TableHead className="text-xs">학생</TableHead>
                  <TableHead className="text-xs text-center">점수</TableHead>
                  <TableHead className="text-xs text-center">소요 / 기준</TableHead>
                  <TableHead className="text-xs">옵션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const pct = r.total_count > 0 ? Math.round((r.correct_count / r.total_count) * 100) : 0;
                  const dur = r.duration_seconds ?? null;
                  const exp = r.expected_seconds ?? null;
                  const overTime = !!(dur && exp && dur > exp);
                  const opts = r.self_test_options || {};
                  const modes = Array.isArray(opts.modes) ? opts.modes : null;
                  return (
                    <TableRow key={r.id} className={overTime ? 'bg-destructive/5' : ''}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.completed_at), 'MM/dd HH:mm')}</TableCell>
                      <TableCell className="text-xs font-medium">{r.student_name}</TableCell>
                      <TableCell className="text-xs text-center">
                        <span className={pct >= 80 ? 'text-green-600 font-semibold' : pct >= 60 ? 'text-amber-600' : 'text-red-500 font-semibold'}>
                          {r.correct_count}/{r.total_count} ({pct}%)
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {dur != null ? (
                          <span className={`inline-flex items-center gap-1 ${overTime ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                            <Clock className="w-3 h-3" />
                            {Math.floor(dur / 60)}:{String(dur % 60).padStart(2, '0')}
                            {exp != null && (
                              <> / {Math.floor(exp / 60)}:{String(exp % 60).padStart(2, '0')}</>
                            )}
                            {overTime && <span className="ml-1">🚨</span>}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {opts.level && <Badge variant="outline" className="text-[10px]">Lv.{opts.level}</Badge>}
                          {opts.per_question_seconds && <Badge variant="outline" className="text-[10px]">{opts.per_question_seconds}s/문항</Badge>}
                          {modes ? modes.map((m: string) => (
                            <Badge key={m} variant="secondary" className="text-[10px]">
                              {m === 'eng_to_kor' ? '영→한' : m === 'kor_to_eng' ? '한→영' : '듣기'}
                            </Badge>
                          )) : (
                            <Badge variant="secondary" className="text-[10px]">{r.mode}</Badge>
                          )}
                        </div>
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
