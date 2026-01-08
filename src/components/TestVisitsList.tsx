import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { FlaskConical, Clock, User } from 'lucide-react';

interface TestVisit {
  id: string;
  student_id: string;
  student_name: string;
  subject: string;
  visit_date: string;
  visit_time: string;
  test_result_text: string | null;
  english_pass_fail: 'pass' | 'fail' | null;
  test_assistant: string | null;
  notes: string | null;
  created_at: string;
}

interface TestVisitsListProps {
  date: string; // YYYY-MM-DD
}

// MARKER: TESTVISITS-LIST-V1
export function TestVisitsList({ date }: TestVisitsListProps) {
  const [visits, setVisits] = useState<TestVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVisits();
  }, [date]);

  async function fetchVisits() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('test_visits')
        .select(`
          id,
          student_id,
          subject,
          visit_date,
          visit_time,
          test_result_text,
          english_pass_fail,
          test_assistant,
          notes,
          created_at,
          students!inner(name)
        `)
        .eq('visit_date', date)
        .order('visit_time', { ascending: true });

      if (error) throw error;

      const mapped: TestVisit[] = (data || []).map((row: any) => ({
        id: row.id,
        student_id: row.student_id,
        student_name: row.students?.name || '알 수 없음',
        subject: row.subject,
        visit_date: row.visit_date,
        visit_time: row.visit_time,
        test_result_text: row.test_result_text,
        english_pass_fail: row.english_pass_fail,
        test_assistant: row.test_assistant,
        notes: row.notes,
        created_at: row.created_at,
      }));

      setVisits(mapped);
    } catch (error) {
      console.error('Error fetching test visits:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (visits.length === 0) {
    return null; // Don't show card if no test visits
  }

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="w-5 h-5 text-blue-600" />
          테스트 방문 ({visits.length}명)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {visits.map((visit) => (
            <div
              key={visit.id}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
            >
              <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
                <span className="font-medium">{visit.student_name}</span>
                <Badge variant="outline" className="text-xs">
                  {visit.subject}
                </Badge>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {visit.visit_time.slice(0, 5)}
                </div>
                {visit.test_result_text && (
                  <Badge variant="secondary" className="text-xs">
                    결과: {visit.test_result_text}
                  </Badge>
                )}
                {visit.english_pass_fail && (
                  <Badge
                    className={`text-xs ${
                      visit.english_pass_fail === 'pass'
                        ? 'bg-green-500/15 text-green-600 border-green-500/30'
                        : 'bg-red-500/15 text-red-600 border-red-500/30'
                    }`}
                  >
                    {visit.english_pass_fail === 'pass' ? '통과' : '불통과'}
                  </Badge>
                )}
                {visit.test_assistant && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="w-3 h-3" />
                    {visit.test_assistant}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
