// STUDENT-MATH-QUIZ-V2: Student math concept quiz page with per-question resubmission
import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BookOpen, Camera, CheckCircle2, XCircle, HelpCircle, Star,
  Loader2, ChevronLeft, PartyPopper, RefreshCw, WifiOff, AlertTriangle
} from 'lucide-react';
import HomeworkImageUploader, { type ImageItem } from '@/components/student/HomeworkImageUploader';
import { MathRenderer } from '@/components/math/MathRenderer';

interface Quiz {
  id: string;
  concept_id: string;
  questions: any[];
  status: string;
  created_at: string;
  math_concepts: { title: string; course: string; grade: string } | null;
}

interface Submission {
  id: string;
  quiz_id: string;
  status: string;
  ai_total_score: number | null;
  ai_total_questions: number | null;
  points_awarded: number;
  submitted_at: string;
  ai_grading_result: any;
  teacher_feedback: string | null;
}

interface GradingResultItem {
  question_number: number;
  student_answer: string;
  is_correct: boolean;
  status: string;
  note?: string;
}

export default function StudentMathQuiz() {
  const { student } = useStudentAuth();
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);

  // Submission state
  const [images, setImages] = useState<ImageItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradingResult, setGradingResult] = useState<any>(null);
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  // Per-question resubmission state
  const [resubmitMode, setResubmitMode] = useState(false);
  const [resubmitQuestions, setResubmitQuestions] = useState<number[]>([]);
  const [resubmitImages, setResubmitImages] = useState<ImageItem[]>([]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await studentApi.getMathQuizzes();
    if (err) {
      setError(err);
    } else if (data) {
      setQuizzes(data.quizzes || []);
      setSubmissions(data.submissions || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const getQuizSubmission = (quizId: string) =>
    submissions.find(s => s.quiz_id === quizId);

  const getNeedsResubmitQuestions = (result: any): number[] => {
    if (!result?.results) return [];
    return result.results
      .filter((r: GradingResultItem) => r.status === 'needs_resubmit')
      .map((r: GradingResultItem) => r.question_number);
  };

  const handleSubmit = async () => {
    if (!selectedQuiz || !student || images.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const img of images) {
        const safeName = img.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${student.id}/${selectedQuiz.id}/${Date.now()}_${safeName}`;
        const { error: uploadErr } = await supabase.storage
          .from('quiz-submissions')
          .upload(path, img.file);
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('quiz-submissions')
          .getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      setUploading(false);
      setGrading(true);

      const { data, error: submitErr } = await studentApi.submitMathQuiz(
        selectedQuiz.id,
        selectedQuiz.concept_id,
        uploadedUrls
      );

      if (submitErr) throw new Error(submitErr);

      if (data?.grading) {
        setGradingResult(data.grading);
        setPointsAwarded(data.points_awarded || 0);

        const needsResubmit = getNeedsResubmitQuestions(data.grading);
        if (needsResubmit.length > 0) {
          setResubmitQuestions(needsResubmit);
          toast({
            title: '채점 완료 (일부 재제출 필요)',
            description: `${needsResubmit.length}개 문항의 답이 불분명하여 다시 제출해야 합니다.`,
          });
        } else {
          if (data.points_awarded > 0) {
            setShowCelebration(true);
            setTimeout(() => setShowCelebration(false), 3000);
          }
          toast({ title: '채점 완료!', description: `${data.grading.total_correct}/${data.grading.total_graded}문항 정답` });
        }
      } else {
        toast({ title: '제출 완료', description: '채점 중 오류가 발생했습니다. 선생님이 직접 확인합니다.' });
      }

      fetchData();
    } catch (err: any) {
      console.error(err);
      toast({ title: '오류', description: err.message || '제출에 실패했습니다.', variant: 'destructive' });
    } finally {
      setUploading(false);
      setGrading(false);
    }
  };

  const handleResubmit = async () => {
    if (!selectedQuiz || !student || resubmitImages.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const img of resubmitImages) {
        const safeName = img.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${student.id}/${selectedQuiz.id}/resubmit_${Date.now()}_${safeName}`;
        const { error: uploadErr } = await supabase.storage
          .from('quiz-submissions')
          .upload(path, img.file);
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('quiz-submissions')
          .getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      setUploading(false);
      setGrading(true);

      const { data, error: submitErr } = await studentApi.submitMathQuiz(
        selectedQuiz.id,
        selectedQuiz.concept_id,
        uploadedUrls
      );

      if (submitErr) throw new Error(submitErr);

      if (data?.grading) {
        setGradingResult(data.grading);
        setPointsAwarded(data.points_awarded || 0);
        setResubmitMode(false);
        setResubmitImages([]);

        const newNeedsResubmit = getNeedsResubmitQuestions(data.grading);
        if (newNeedsResubmit.length > 0) {
          setResubmitQuestions(newNeedsResubmit);
          toast({
            title: '채점 완료',
            description: `아직 ${newNeedsResubmit.length}개 문항이 불분명합니다.`,
          });
        } else {
          setResubmitQuestions([]);
          if (data.points_awarded > 0) {
            setShowCelebration(true);
            setTimeout(() => setShowCelebration(false), 3000);
          }
          toast({ title: '채점 완료!', description: `${data.grading.total_correct}/${data.grading.total_graded}문항 정답` });
        }
      }

      fetchData();
    } catch (err: any) {
      console.error(err);
      toast({ title: '오류', description: err.message || '재제출에 실패했습니다.', variant: 'destructive' });
    } finally {
      setUploading(false);
      setGrading(false);
    }
  };

  const handleBack = () => {
    setSelectedQuiz(null);
    setImages([]);
    setGradingResult(null);
    setPointsAwarded(0);
    setResubmitMode(false);
    setResubmitQuestions([]);
    setResubmitImages([]);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'correct': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'incorrect': return <XCircle className="w-5 h-5 text-destructive" />;
      case 'needs_resubmit': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      default: return <HelpCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center space-y-3">
        <WifiOff className="w-8 h-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">데이터를 불러올 수 없습니다.</p>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-1" /> 다시 시도
        </Button>
      </div>
    );
  }

  // Detail / submission view
  if (selectedQuiz) {
    const existingSub = getQuizSubmission(selectedQuiz.id);
    const concept = selectedQuiz.math_concepts;

    // Determine which grading result to check for needs_resubmit
    const activeGradingResult = gradingResult || existingSub?.ai_grading_result;
    const activeNeedsResubmit = resubmitQuestions.length > 0
      ? resubmitQuestions
      : getNeedsResubmitQuestions(activeGradingResult);

    const renderGradingResults = (result: any, points: number, teacherFeedback?: string | null) => (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-center p-4 rounded-lg bg-muted/50">
            <p className="text-3xl font-bold text-primary">
              {result.total_correct} / {result.total_graded}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{result.overall_feedback}</p>
            <Badge className="mt-2 bg-yellow-500 text-white">
              <Star className="w-3 h-3 mr-1" /> +{points} 포인트 획득
            </Badge>
          </div>

          {teacherFeedback && (
            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
              <p className="text-xs font-medium text-primary mb-1">💬 선생님 피드백</p>
              <p className="text-sm">{teacherFeedback}</p>
            </div>
          )}

          {/* Needs resubmit banner */}
          {activeNeedsResubmit.length > 0 && !resubmitMode && (
            <div className="p-3 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                    {activeNeedsResubmit.length}개 문항 재제출 필요
                  </p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                    Q{activeNeedsResubmit.join(', Q')} 번 문항의 답이 불분명합니다.
                    해당 문항만 다시 깨끗하게 풀어서 사진을 올려주세요.
                  </p>
                  <Button
                    size="sm"
                    className="mt-2 bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={() => setResubmitMode(true)}
                  >
                    <Camera className="w-4 h-4 mr-1" /> 해당 문항 다시 제출하기
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {result.results?.map((r: GradingResultItem) => {
              const question = selectedQuiz.questions.find((q: any) => q.question_number === r.question_number);
              const isNeedsResubmit = r.status === 'needs_resubmit';
              return (
                <div
                  key={r.question_number}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    isNeedsResubmit ? 'border-orange-300 bg-orange-50/50 dark:bg-orange-950/20' : ''
                  }`}
                >
                  {statusIcon(r.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Q{r.question_number}</p>
                      {isNeedsResubmit && (
                        <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">
                          재제출 필요
                        </Badge>
                      )}
                    </div>
                    {question && (
                      <p className="text-xs text-muted-foreground truncate">
                        <MathRenderer text={question.question_text.substring(0, 60) + '...'} />
                      </p>
                    )}
                    <p className="text-xs mt-1">
                      내 답: <span className="font-medium">{r.student_answer || '-'}</span>
                      {r.status === 'incorrect' && question && (
                        <span className="text-destructive ml-2">
                          (정답: <MathRenderer text={question.answer} />)
                        </span>
                      )}
                    </p>
                    {r.note && (
                      <p className={`text-xs mt-0.5 ${isNeedsResubmit ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-muted-foreground'}`}>
                        {isNeedsResubmit ? '⚠️ ' : ''}{r.note}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resubmit mode: show specific questions and uploader */}
          {resubmitMode && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                📸 아래 문항만 다시 풀어서 사진을 올려주세요
              </p>
              <div className="space-y-2">
                {activeNeedsResubmit.map(qNum => {
                  const question = selectedQuiz.questions.find((q: any) => q.question_number === qNum);
                  return question ? (
                    <div key={qNum} className="p-3 rounded-lg border border-orange-200 bg-orange-50/50 dark:bg-orange-950/20">
                      <p className="text-sm">
                        <span className="font-bold text-orange-600 mr-2">Q{qNum}</span>
                        <MathRenderer text={question.question_text} />
                      </p>
                    </div>
                  ) : null;
                })}
              </div>
              <HomeworkImageUploader images={resubmitImages} onImagesChange={setResubmitImages} disabled={uploading || grading} />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setResubmitMode(false); setResubmitImages([]); }}
                  disabled={uploading || grading}
                >
                  취소
                </Button>
                <Button
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleResubmit}
                  disabled={resubmitImages.length === 0 || uploading || grading}
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 업로드 중...</>
                  ) : grading ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> AI 채점 중...</>
                  ) : (
                    <><Camera className="w-4 h-4 mr-2" /> 재제출하고 채점받기</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {!resubmitMode && (
            <Button variant="outline" className="w-full" onClick={handleBack}>
              목록으로 돌아가기
            </Button>
          )}
        </CardContent>
      </Card>
    );

    return (
      <div className="p-4 space-y-4 relative">
        {/* Celebration overlay */}
        {showCelebration && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 animate-fade-in">
            <div className="text-center animate-scale-in space-y-3">
              <PartyPopper className="w-16 h-16 text-yellow-500 mx-auto animate-bounce" />
              <p className="text-2xl font-bold text-foreground">축하해요! 🎉</p>
              <div className="flex items-center justify-center gap-2">
                <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                <span className="text-xl font-bold text-primary">+{pointsAwarded} 포인트</span>
                <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
              </div>
            </div>
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1">
          <ChevronLeft className="w-4 h-4" /> 목록으로
        </Button>

        <div>
          <h2 className="text-lg font-bold">{concept?.title || '퀴즈'}</h2>
          <p className="text-sm text-muted-foreground">{concept?.course} · {concept?.grade}</p>
        </div>

        {/* Show grading result if just submitted */}
        {gradingResult ? (
          renderGradingResults(gradingResult, pointsAwarded)
        ) : existingSub && existingSub.ai_grading_result ? (
          <>
            {renderGradingResults(existingSub.ai_grading_result, existingSub.points_awarded, existingSub.teacher_feedback)}

            {/* Allow full re-submission if no needs_resubmit pending */}
            {activeNeedsResubmit.length === 0 && (
              <Card>
                <CardContent className="pt-4 space-y-2">
                  <p className="text-sm font-medium">📸 다시 제출하기</p>
                  <HomeworkImageUploader images={images} onImagesChange={setImages} disabled={uploading || grading} />
                  <Button className="w-full" onClick={handleSubmit} disabled={images.length === 0 || uploading || grading}>
                    {uploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 업로드 중...</>
                    ) : grading ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> AI 채점 중...</>
                    ) : (
                      <><Camera className="w-4 h-4 mr-2" /> 다시 제출하고 채점받기</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          /* Fresh submission */
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                퀴즈를 손으로 풀어 적은 노트를 촬영해서 올려주세요. AI가 자동으로 채점해줍니다! 🤖
              </p>

              {/* Show questions */}
              <div className="space-y-2">
                <p className="text-sm font-medium">📝 문제 ({selectedQuiz.questions.length}개)</p>
                {selectedQuiz.questions.map((q: any) => (
                  <div key={q.question_number} className="p-3 rounded-lg border bg-muted/30">
                    <p className="text-sm">
                      <span className="font-bold text-primary mr-2">Q{q.question_number}</span>
                      <MathRenderer text={q.question_text} />
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">📸 내 풀이 사진 올리기</p>
                <HomeworkImageUploader images={images} onImagesChange={setImages} disabled={uploading || grading} />
                <Button className="w-full mt-2" onClick={handleSubmit} disabled={images.length === 0 || uploading || grading}>
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 업로드 중...</>
                  ) : grading ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> AI 채점 중...</>
                  ) : (
                    <><Camera className="w-4 h-4 mr-2" /> 제출하고 채점받기</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Quiz list view
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-primary" />
        수학 개념 퀴즈
      </h1>

      {quizzes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">아직 등록된 퀴즈가 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {quizzes.map(quiz => {
            const sub = getQuizSubmission(quiz.id);
            const concept = quiz.math_concepts;
            const questionCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
            const hasNeedsResubmit = sub?.ai_grading_result
              ? getNeedsResubmitQuestions(sub.ai_grading_result).length > 0
              : false;

            return (
              <Card
                key={quiz.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => { setSelectedQuiz(quiz); setImages([]); setGradingResult(null); setResubmitQuestions([]); setResubmitMode(false); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{concept?.title || '퀴즈'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {concept?.course} · {concept?.grade} · {questionCount}문항
                      </p>
                    </div>
                    <div className="text-right ml-2">
                      {sub ? (
                        <>
                          {hasNeedsResubmit ? (
                            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                              <AlertTriangle className="w-3 h-3 mr-1" /> 재제출
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> 완료
                            </Badge>
                          )}
                          {sub.ai_total_score != null && (
                            <p className="text-sm font-bold mt-1 text-primary">
                              {sub.ai_total_score}/{sub.ai_total_questions}
                            </p>
                          )}
                        </>
                      ) : (
                        <Badge variant="secondary" className="text-xs">미제출</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
