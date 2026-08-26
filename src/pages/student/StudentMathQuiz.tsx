// STUDENT-MATH-QUIZ-V3: Student math concept quiz with hints, speech-bubble feedback, enhanced UI
import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi, fileToBase64 } from '@/lib/studentApi';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  BookOpen, Camera, CheckCircle2, XCircle, HelpCircle, Star,
  Loader2, ChevronLeft, PartyPopper, RefreshCw, WifiOff, AlertTriangle,
  Lightbulb, MessageCircle
} from 'lucide-react';
import HomeworkImageUploader, { type ImageItem } from '@/components/student/HomeworkImageUploader';
import MathQuestionRoom from '@/components/student/MathQuestionRoom';
import { MathRenderer } from '@/components/math/MathRenderer';
import { StudentStudyTabs } from '@/components/student/StudentStudyTabs';

// STUDENT-UPLOAD-V2: private bucket → upload through the secure student endpoint
const uploadStudentQuizImage = async (file: File, studentId: string, quizId: string, index: number, prefix = '') => {
  const ext = file.name.split('.').pop() || 'jpg';
  const content = await fileToBase64(file);
  const { data, error } = await studentApi.uploadFile({
    bucket: 'quiz-submissions',
    homework_id: quizId,
    content,
    content_type: file.type || 'image/jpeg',
    ext,
  });
  if (error || !data?.url) throw new Error(error || 'UPLOAD_FAILED');
  return data.url;
};

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
  concept_feedback?: string;
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

  // Hint state
  const [hintsUsed, setHintsUsed] = useState<Set<number>>(new Set());

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

  const handleUseHint = (questionNumber: number) => {
    setHintsUsed(prev => new Set(prev).add(questionNumber));
  };

  const handleSubmit = async () => {
    if (!selectedQuiz || !student || images.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls = await Promise.all(
        images.map((img, index) => uploadStudentQuizImage(img.file, student.id, selectedQuiz.id, index))
      );

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
        toast({ title: '제출 완료', description: '사진 업로드가 완료되었습니다. AI 채점은 잠시 후 결과에 반영됩니다.' });
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
      const uploadedUrls = await Promise.all(
        resubmitImages.map((img, index) => uploadStudentQuizImage(img.file, student.id, selectedQuiz.id, index, 'resubmit_'))
      );

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

      if (!data?.grading) {
        toast({ title: '재제출 완료', description: '사진 업로드가 완료되었습니다. AI 채점은 잠시 후 결과에 반영됩니다.' });
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
    setHintsUsed(new Set());
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'correct': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'incorrect': return <XCircle className="w-5 h-5 text-destructive" />;
      case 'needs_resubmit': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      default: return <HelpCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  // Speech bubble feedback component
  const FeedbackBubble = ({ feedback, status }: { feedback: string; status: string }) => {
    const bgColor = status === 'correct'
      ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
      : status === 'needs_resubmit'
      ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
      : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';

    const iconColor = status === 'correct'
      ? 'text-green-500'
      : status === 'needs_resubmit'
      ? 'text-orange-500'
      : 'text-red-500';

    return (
      <div className={`relative mt-2 p-3 rounded-xl border ${bgColor}`}>
        {/* Speech bubble tail */}
        <div className={`absolute -top-2 left-4 w-4 h-4 rotate-45 border-l border-t ${bgColor}`} />
        <div className="flex items-start gap-2 relative">
          <MessageCircle className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
          <p className="text-xs leading-relaxed">{feedback}</p>
        </div>
      </div>
    );
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

    const activeGradingResult = gradingResult || existingSub?.ai_grading_result;
    const activeNeedsResubmit = resubmitQuestions.length > 0
      ? resubmitQuestions
      : getNeedsResubmitQuestions(activeGradingResult);

    const renderGradingResults = (result: any, points: number, teacherFeedback?: string | null) => (
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Score summary */}
          <div className="text-center p-4 rounded-xl bg-muted/50">
            <p className="text-3xl font-bold text-primary">
              {result.total_correct} / {result.total_graded}
            </p>
            {/* Overall feedback as speech bubble */}
            <div className="relative mt-3 mx-auto max-w-sm p-3 rounded-xl bg-primary/10 border border-primary/20">
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 bg-primary/10 border-l border-t border-primary/20" />
              <p className="text-sm text-foreground relative">{result.overall_feedback}</p>
            </div>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Badge className="bg-yellow-500 text-white">
                <Star className="w-3 h-3 mr-1" /> +{points} 포인트
              </Badge>
              {hintsUsed.size > 0 && (
                <Badge variant="outline" className="text-xs border-yellow-300 text-yellow-600">
                  <Lightbulb className="w-3 h-3 mr-1" /> 힌트 {hintsUsed.size}회 사용
                </Badge>
              )}
            </div>
          </div>

          {teacherFeedback && (
            <div className="relative p-3 rounded-xl border border-primary/20 bg-primary/5">
              <div className="absolute -top-2 left-4 w-4 h-4 rotate-45 bg-primary/5 border-l border-t border-primary/20" />
              <p className="text-xs font-medium text-primary mb-1 relative">💬 선생님 피드백</p>
              <p className="text-sm relative">{teacherFeedback}</p>
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

          {/* Per-question results with speech bubble feedback */}
          <div className="space-y-3">
            {result.results?.map((r: GradingResultItem) => {
              const question = selectedQuiz.questions.find((q: any) => q.question_number === r.question_number);
              const isNeedsResubmit = r.status === 'needs_resubmit';
              return (
                <div
                  key={r.question_number}
                  className={`p-3 rounded-xl border ${
                    isNeedsResubmit
                      ? 'border-orange-300 bg-orange-50/50 dark:bg-orange-950/20'
                      : r.is_correct
                      ? 'border-green-200 bg-green-50/30 dark:bg-green-950/10'
                      : 'border-red-200 bg-red-50/30 dark:bg-red-950/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
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
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <MathRenderer text={question.question_text.length > 80 ? question.question_text.substring(0, 80) + '...' : question.question_text} />
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
                    </div>
                  </div>

                  {/* Speech bubble feedback */}
                  {r.concept_feedback && (
                    <FeedbackBubble feedback={r.concept_feedback} status={r.status} />
                  )}
                  {!r.concept_feedback && r.note && (
                    <FeedbackBubble feedback={r.note} status={r.status} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Resubmit mode */}
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
              <HomeworkImageUploader images={resubmitImages} onImagesChange={setResubmitImages} disabled={uploading || grading} maxFiles={6} maxDimension={1000} quality={0.62} />
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
                  <HomeworkImageUploader images={images} onImagesChange={setImages} disabled={uploading || grading} maxFiles={8} maxDimension={1000} quality={0.62} />
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
          /* Fresh submission - questions with hint buttons */
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  퀴즈를 손으로 풀어 적은 노트를 촬영해서 올려주세요. AI가 자동으로 채점해줍니다! 🤖
                </p>
              </div>

              {hintsUsed.size > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
                  <Lightbulb className="w-4 h-4 text-yellow-500" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    힌트 {hintsUsed.size}회 사용 — 포인트가 절반으로 줄어듭니다
                  </p>
                </div>
              )}

              {/* Show questions with hint buttons */}
              <div className="space-y-2">
                <p className="text-sm font-medium">📝 문제 ({selectedQuiz.questions.length}개)</p>
                {selectedQuiz.questions.map((q: any) => (
                  <div key={q.question_number} className="p-3 rounded-xl border bg-muted/30">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-bold text-primary mr-2">Q{q.question_number}</span>
                          <MathRenderer text={q.question_text} />
                        </p>
                      </div>
                      {/* Hint button */}
                      {q.hint && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`shrink-0 h-8 w-8 rounded-full ${
                                hintsUsed.has(q.question_number)
                                  ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-950/30'
                                  : 'text-muted-foreground hover:text-yellow-500'
                              }`}
                              onClick={() => handleUseHint(q.question_number)}
                            >
                              <Lightbulb className="w-4 h-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent side="top" className="w-64 p-3">
                            <div className="flex items-start gap-2">
                              <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-yellow-700 dark:text-yellow-300 mb-1">💡 힌트</p>
                                <p className="text-sm">{q.hint}</p>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">📸 내 풀이 사진 올리기</p>
                <HomeworkImageUploader images={images} onImagesChange={setImages} disabled={uploading || grading} maxFiles={8} maxDimension={1000} quality={0.62} />
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
      <StudentStudyTabs />
      <h1 className="text-xl font-bold flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-primary" />
        개념 퀴즈
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
                onClick={() => { setSelectedQuiz(quiz); setImages([]); setGradingResult(null); setResubmitQuestions([]); setResubmitMode(false); setHintsUsed(new Set()); }}
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
      {/* 수학질문방 */}
      <MathQuestionRoom />
    </div>
  );
}
