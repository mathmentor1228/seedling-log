// CONSULT-LOG-V1 — 원장 화면 '상담 후속조치' 작은 업무 목록.
// 예정/기한 지남만 표면화한다. 통계·자동 메시지 없음.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronRight, Loader2, PhoneCall } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTodayKST } from '@/lib/utils';

interface Row {
  id: string;
  student_id: string | null;
  due_date: string;
  consult_target: string | null;
  consult_method: string | null;
  body: string | null;
  studentName: string;
}

export function ConsultFollowUpsCard() {
  const navigate = useNavigate();
  const today = getTodayKST();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data, error: e } = await supabase
        .from('team_notes')
        .select('*')
        .eq('scope', 'student')
        .eq('status', 'open')
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })
        .limit(30);
      if (e) throw e;
      const list = ((data || []) as any[]).filter((r) => r.consulted_at && r.student_id);
      const ids = [...new Set(list.map((r) => r.student_id))];
      const nameById = new Map<string, string>();
      if (ids.length) {
        const { data: st } = await supabase.from('students').select('id, name').in('id', ids);
        (st || []).forEach((s: any) => nameById.set(s.id, s.name));
      }
      setRows(list.map((r) => ({
        id: r.id,
        student_id: r.student_id,
        due_date: r.due_date,
        consult_target: r.consult_target,
        consult_method: r.consult_method,
        body: r.body,
        studentName: nameById.get(r.student_id) || '학생 정보 없음',
      })));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!loading && !error && rows.length === 0) return null;

  return (
    <Card className="border-amber-500/30">
      <CardContent className="p-4 space-y-2">
        <h2 className="text-sm font-bold flex items-center gap-1.5">
          <PhoneCall className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          상담 후속조치
          <span className="text-[11px] font-normal text-muted-foreground">예정·기한 지남만 표시</span>
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">
            후속조치 목록을 불러오지 못했습니다.
            <Button variant="outline" size="sm" className="ml-2 h-7" onClick={load}>다시 시도</Button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const overdue = r.due_date < today;
              return (
                <li key={r.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border/50 bg-muted/20 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold truncate">{r.studentName}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded',
                        overdue ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
                        {r.due_date} {overdue ? '기한 지남' : '예정'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {r.consult_target || '대상 미기재'} · {r.consult_method || '방식 미기재'}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 break-words">{r.body || '내용 없음'}</p>
                  </div>
                  {r.student_id && (
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 shrink-0"
                      onClick={() => navigate(`/students/${r.student_id}/karte`)}>
                      카르테 <ChevronRight className="w-3 h-3" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!loading && !error && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 shrink-0" /> 알림·문자는 전송되지 않습니다. 완료 처리는 기존 팀 메모 화면에서 합니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
