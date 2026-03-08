import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, XCircle, HelpCircle, Eye, MessageSquare, RefreshCw, Star } from 'lucide-react';
import { MathRenderer } from './MathRenderer';

interface Submission {
  id: string;
  student_id: string;
  concept_id: string;
  quiz_id: string;
  image_urls: string[];
  ai_grading_result: any;
  ai_total_score: number | null;
  ai_total_questions: number | null;
  status: string;
  teacher_override_result: any;
  teacher_feedback: string | null;
  teacher_reviewed_by: string | null;
  teacher_reviewed_at: string | null;
  points_awarded: number;
  submitted_at: string;
  students?: { name: string };
  math_concepts?: { title: string; course: string };
}

export function QuizSubmissionReview() {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const fetchSubmissions = async () => {
    const { data, error } = await supabase
      .from('math_quiz_submissions')
      .select('*, students(name), math_concepts(title, course)')
      .order('submitted_at', { ascending: false }) as any;
    if (!error && data) setSubmissions(data);
    setLoading(false);
  };

  useEffect(() => { fetchSubmissions(); }, []);

  const selected = submissions.find(s => s.id === selectedId);

  const handleOverride = async (questionNumber: number, newStatus: 'correct' | 'incorrect') => {
    if (!selected) return;
    const currentOverrides = selected.teacher_override_result || {};
    const updated = { ...currentOverrides, [questionNumber]: newStatus };

    await supabase
      .from('math_quiz_submissions')
      .update({ teacher_override_result: updated, updated_at: new Date().toISOString() } as any)
      .eq('id', selected.id);

    setSubmissions(prev => prev.map(s =>
      s.id === selected.id ? { ...s, teacher_override_result: updated } : s
    ));
    toast({ title: '재채점 반영됨' });
  };

  const handleSaveFeedback = async () => {
    if (!selected) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('math_quiz_submissions')
      .update({
        teacher_feedback: feedback,
        teacher_reviewed_by: user?.id,
        teacher_reviewed_at: new Date().toISOString(),
        status: 'reviewed',
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', selected.id);

    setSubmissions(prev => prev.map(s =>
      s.id === selected.id ? { ...s, teacher_feedback: feedback, status: 'reviewed' } : s
    ));
    setSaving(false);
    toast({ title: '피드백 저장 완료' });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'submitted': return <Badge variant="secondary">제출됨</Badge>;
      case 'graded': return <Badge className="bg-blue-500 text-white">AI 채점 완료</Badge>;
      case 'reviewed': return <Badge className="bg-green-500 text-white">검수 완료</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'correct': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'incorrect': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'unreadable': return <HelpCircle className="w-4 h-4 text-yellow-500" />;
      default: return <HelpCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Eye className="w-5 h-5" />
        학생 제출물 검수 ({submissions.length}건)
      </h2>

      {/* Full-screen image viewer */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setSelectedImage(null)}
        >
          <img src={selectedImage} alt="확대" className="max-w-[95vw] max-h-[95vh] object-contain" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Submission list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">제출 목록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
            {submissions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">제출된 퀴즈가 없습니다.</p>
            ) : submissions.map(sub => (
              <div
                key={sub.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedId === sub.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
                onClick={() => { setSelectedId(sub.id); setFeedback(sub.teacher_feedback || ''); }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{(sub as any).students?.name || '학생'}</p>
                    <p className="text-xs text-muted-foreground">
                      {(sub as any).math_concepts?.course} · {(sub as any).math_concepts?.title}
                    </p>
                  </div>
                  <div className="text-right">
                    {statusBadge(sub.status)}
                    {sub.ai_total_score != null && (
                      <p className="text-sm font-bold mt-1">
                        {sub.ai_total_score}/{sub.ai_total_questions}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(sub.submitted_at).toLocaleString('ko-KR')}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Detail view */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">상세 보기</CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-center text-muted-foreground py-12">왼쪽에서 제출물을 선택하세요.</p>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {/* Student images */}
                <div>
                  <p className="text-sm font-medium mb-2">📸 학생 노트 사진</p>
                  <div className="grid grid-cols-2 gap-2">
                    {selected.image_urls?.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`풀이 ${i + 1}`}
                        className="rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setSelectedImage(url)}
                      />
                    ))}
                  </div>
                </div>

                {/* AI grading results */}
                {selected.ai_grading_result && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">🤖 AI 채점 결과</p>
                      <Badge variant="outline">
                        <Star className="w-3 h-3 mr-1" /> +{selected.points_awarded}점
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {selected.ai_grading_result.overall_feedback}
                    </p>
                    <div className="space-y-1">
                      {selected.ai_grading_result.results?.map((r: any) => {
                        const override = selected.teacher_override_result?.[r.question_number];
                        const finalStatus = override || r.status;
                        return (
                          <div key={r.question_number} className="flex items-center gap-2 p-2 rounded border text-sm">
                            {statusIcon(finalStatus)}
                            <span className="font-medium w-8">Q{r.question_number}</span>
                            <span className="flex-1 truncate text-xs">{r.student_answer || '-'}</span>
                            {override && <Badge variant="outline" className="text-xs">수정됨</Badge>}
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant={finalStatus === 'correct' ? 'default' : 'ghost'}
                                className="h-6 w-6"
                                onClick={() => handleOverride(r.question_number, 'correct')}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant={finalStatus === 'incorrect' ? 'destructive' : 'ghost'}
                                className="h-6 w-6"
                                onClick={() => handleOverride(r.question_number, 'incorrect')}
                              >
                                <XCircle className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Teacher feedback */}
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-1">
                    <MessageSquare className="w-4 h-4" /> 선생님 피드백
                  </p>
                  <Textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder="학생에게 전달할 피드백을 입력하세요..."
                    rows={3}
                  />
                  <Button className="mt-2 w-full" onClick={handleSaveFeedback} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <MessageSquare className="w-4 h-4 mr-1" />}
                    피드백 저장
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
