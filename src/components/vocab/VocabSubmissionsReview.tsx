// Teacher review panel for vocab test submissions
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, XCircle, Pencil, ChevronRight } from 'lucide-react';

interface Submission {
  id: string;
  test_id: string;
  student_id: string;
  answers: any[];
  auto_score: number;
  final_score: number;
  total: number;
  strictness_used: string;
  submission_type: string;
  image_urls: string[];
  status: string;
  created_at: string;
  students?: { name: string } | null;
  vocab_generated_tests?: { title: string; grading_strictness: string } | null;
}

const STRICTNESS_LABEL: Record<string, string> = {
  strict: '🌶️ 매운맛',
  normal: '🍜 보통맛',
  lenient: '🍦 순한맛',
};

export function VocabSubmissionsReview() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterTestId, setFilterTestId] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vocab_test_submissions')
      .select('*, students(name), vocab_generated_tests(title, grading_strictness)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) setSubs(data as unknown as Submission[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = filterTestId === 'all' ? subs : subs.filter(s => s.test_id === filterTestId);
  const uniqueTests = Array.from(new Map(subs.map(s => [s.test_id, s.vocab_generated_tests?.title || '제목없음'])).entries());
  const selected = subs.find(s => s.id === selectedId);

  const toggleCorrectness = async (submission: Submission, n: number) => {
    const newAnswers = submission.answers.map(a => a.n === n ? { ...a, is_correct: !a.is_correct, overridden: true } : a);
    const newFinal = newAnswers.filter(a => a.is_correct).length;
    const { error } = await supabase
      .from('vocab_test_submissions')
      .update({
        answers: newAnswers,
        final_score: newFinal,
        status: 'corrected',
        corrected_at: new Date().toISOString(),
      })
      .eq('id', submission.id);
    if (error) {
      toast({ title: '저장 실패', description: error.message, variant: 'destructive' });
      return;
    }
    setSubs(prev => prev.map(s => s.id === submission.id ? { ...s, answers: newAnswers, final_score: newFinal, status: 'corrected' } : s));
    toast({ title: '보정 완료', description: `최종 점수: ${newFinal}/${submission.total}` });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (subs.length === 0) {
    return <p className="text-center py-12 text-muted-foreground text-sm">아직 제출된 시험이 없습니다.</p>;
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* List */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Select value={filterTestId} onValueChange={setFilterTestId}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="전체 시험" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 시험</SelectItem>
              {uniqueTests.map(([id, title]) => (
                <SelectItem key={id} value={id}>{title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={load}>새로고침</Button>
        </div>

        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map(s => {
            const percent = s.total > 0 ? Math.round((s.final_score / s.total) * 100) : 0;
            const isSel = s.id === selectedId;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${isSel ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{s.students?.name || '학생'}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.vocab_generated_tests?.title}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold">{s.final_score}/{s.total}</div>
                    <div className="text-[10px] text-muted-foreground">{percent}%</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{STRICTNESS_LABEL[s.strictness_used] || s.strictness_used}</Badge>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">{s.submission_type === 'typing' ? '타이핑' : '사진'}</Badge>
                  {s.status === 'corrected' && <Badge variant="secondary" className="text-[10px] h-4 px-1.5"><Pencil className="w-2.5 h-2.5 mr-0.5" />보정됨</Badge>}
                  <span className="text-[10px] text-muted-foreground ml-auto">{new Date(s.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div>
        {!selected ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">제출 항목을 선택하세요</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold">{selected.students?.name}</div>
                  <div className="text-xs text-muted-foreground">{selected.vocab_generated_tests?.title}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{selected.final_score}<span className="text-sm text-muted-foreground">/{selected.total}</span></div>
                  {selected.auto_score !== selected.final_score && (
                    <div className="text-[10px] text-muted-foreground">자동: {selected.auto_score}</div>
                  )}
                </div>
              </div>

              {selected.image_urls && selected.image_urls.length > 0 && (
                <div className="flex gap-1 overflow-x-auto">
                  {selected.image_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`답안${i+1}`} className="h-20 rounded border" />
                    </a>
                  ))}
                </div>
              )}

              <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-1.5">
                {selected.answers.map((a: any) => (
                  <div key={a.n} className={`flex items-center gap-2 p-2 rounded border text-xs ${a.is_correct ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <span className="w-6 text-right font-medium shrink-0">{a.n}.</span>
                    {a.is_correct
                      ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                    <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-2">
                      <div className="truncate"><span className="text-muted-foreground">Q:</span> {a.prompt}</div>
                      <div className="truncate"><span className="text-muted-foreground">정답:</span> <span className="font-medium">{a.answer}</span></div>
                      <div className="truncate"><span className="text-muted-foreground">답:</span> <span className={a.is_correct ? 'text-green-700' : 'text-red-600'}>{a.student_answer || '(빈칸)'}</span></div>
                      <div className="truncate text-muted-foreground italic">{a.reason}</div>
                    </div>
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-[10px] shrink-0"
                      onClick={() => toggleCorrectness(selected, a.n)}
                    >
                      {a.is_correct ? '오답으로' : '정답으로'}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
