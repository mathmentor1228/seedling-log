// ACTIVE-PARENTS-VIEWERS-V1: parents who view the portal 4+ times in the last 30 days
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart, Users } from 'lucide-react';

interface VisitRow { student_id: string; visited_at: string }
interface StudentRow {
  id: string;
  name: string;
  parent_name: string | null;
  parent_phone: string | null;
}

interface Aggregated {
  student_id: string;
  student_name: string;
  parent_name: string | null;
  parent_phone: string | null;
  visits: number;
  last_visited_at: string;
}

const WINDOW_DAYS = 30;
const MIN_VISITS = 4;

export function ActiveParentsSection() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Aggregated[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - WINDOW_DAYS);
      const sinceIso = since.toISOString();

      const { data: visits } = await (supabase as any)
        .from('parent_portal_visits')
        .select('student_id, visited_at')
        .gte('visited_at', sinceIso)
        .order('visited_at', { ascending: false });

      const list = (visits || []) as VisitRow[];
      const byStudent = new Map<string, { count: number; last: string }>();
      for (const v of list) {
        if (!v.student_id) continue;
        const cur = byStudent.get(v.student_id);
        if (!cur) byStudent.set(v.student_id, { count: 1, last: v.visited_at });
        else cur.count += 1;
      }

      const ids = Array.from(byStudent.entries())
        .filter(([, v]) => v.count >= MIN_VISITS)
        .map(([id]) => id);

      let students: StudentRow[] = [];
      if (ids.length > 0) {
        const { data } = await supabase
          .from('students')
          .select('id, name, parent_name, parent_phone')
          .in('id', ids);
        students = (data || []) as StudentRow[];
      }
      const sMap = new Map(students.map((s) => [s.id, s]));

      const agg: Aggregated[] = ids.map((id) => {
        const v = byStudent.get(id)!;
        const s = sMap.get(id);
        return {
          student_id: id,
          student_name: s?.name || '알 수 없음',
          parent_name: s?.parent_name ?? null,
          parent_phone: s?.parent_phone ?? null,
          visits: v.count,
          last_visited_at: v.last,
        };
      }).sort((a, b) => b.visits - a.visits);

      if (!cancelled) {
        setRows(agg);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const total = useMemo(() => rows.length, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-500/15 text-pink-500 flex items-center justify-center">
            <Heart className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">최근 {WINDOW_DAYS}일간 월 {MIN_VISITS}회 이상 방문 학부모</p>
            <p className="text-2xl font-bold text-foreground">{total}명</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-4 h-4" /> 주기적으로 학부모 웹페이지를 열람하는 학부모
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              최근 {WINDOW_DAYS}일 동안 {MIN_VISITS}회 이상 방문한 학부모가 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.student_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {r.parent_name ? `${r.parent_name} 학부모` : `${r.student_name} 학생 학부모`}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">({r.student_name})</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.parent_phone || '연락처 미등록'} · 마지막 방문 {new Date(r.last_visited_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <Badge variant="outline" className="gap-1 shrink-0">
                    <Heart className="w-3 h-3" /> {r.visits}회
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
