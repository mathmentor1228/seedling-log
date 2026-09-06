// TEACHER-CHANGE-LOG-V1 — 수강과정 담당 선생님 변경 이력 검색 (읽기 전용)
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, History, RefreshCw, Search } from 'lucide-react';
import { matchesTeacherChangeQuery, type TeacherChangeRow } from '@/lib/teacherChangeLog';

type Row = TeacherChangeRow & { student_name: string | null };

function TeacherChangesInner() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('student_course_teacher_changes')
      .select('id, student_id, subject, from_teacher_name, to_teacher_name, effective_date, reason, created_at, students(name)')
      .order('effective_date', { ascending: false })
      .limit(500);
    if (err) setError(err.message);
    else {
      setRows((data || []).map((r: any) => ({ ...r, student_name: r.students?.name ?? null })));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => rows.filter((r) =>
      matchesTeacherChangeQuery(r, query) &&
      (!from || r.effective_date >= from) &&
      (!to || r.effective_date <= to)
    ),
    [rows, query, from, to]
  );

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <History className="w-5 h-5" /> 담당 선생님 변경 이력
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            수강과정에서 담당이 바뀐 기록입니다. 변경 이전 수업 기록의 담당자 표기는 그대로 보존됩니다.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> 새로고침
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <Label className="text-[11px] text-muted-foreground">검색 (학생·과목·선생님·사유)</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="예: 하예준 영어 이재진"
                className="pl-7 h-9"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">시작일 이후</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">시작일 이전</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : error ? (
        <Card><CardContent className="p-4 text-sm text-destructive">불러오지 못했습니다. ({error})</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">조건에 맞는 변경 기록이 없습니다.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length}건</p>
          {filtered.map((r) => (
            <Card key={r.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">{r.student_name || '(학생 정보 없음)'}</span>
                    {r.subject && <Badge variant="outline" className="text-[10px]">{r.subject}</Badge>}
                    <Badge variant="outline" className="text-[10px]">{r.effective_date}부터</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                    {r.from_teacher_name || '미지정'}
                    <ArrowRight className="w-3 h-3" />
                    <span className="text-foreground font-medium">{r.to_teacher_name || '미지정'}</span>
                  </p>
                  {r.reason && <p className="text-xs text-muted-foreground break-words">사유: {r.reason}</p>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-xs"
                  onClick={() => navigate(`/students/${r.student_id}/karte`)}
                >
                  학생 카르테
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeacherChangesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <TeacherChangesInner />
    </ProtectedRoute>
  );
}
