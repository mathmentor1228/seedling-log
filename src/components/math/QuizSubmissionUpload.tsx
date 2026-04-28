import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Camera, CheckCircle2, XCircle, HelpCircle, Star, PartyPopper } from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import type { QuizQuestion } from './MathConceptManager';
import HomeworkImageUploader, { type ImageItem } from '@/components/student/HomeworkImageUploader';
import { compressImage } from '@/lib/imageCompression';
import { preprocessImageForOCR } from '@/lib/imagePreprocess';

const uploadQuizSubmissionImage = async (file: File, studentId: string, quizId: string, index: number) => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${studentId}/${quizId}/${Date.now()}_${index}_${safeName}`;
  const { error } = await supabase.storage
    .from('quiz-submissions')
    .upload(path, file, { upsert: false });
  if (error) throw error;

  const { data } = supabase.storage
    .from('quiz-submissions')
    .getPublicUrl(path);
  return data.publicUrl;
};

interface Props {
  quiz: { id: string; concept_id: string; questions: QuizQuestion[] };
  studentId: string;
  onSubmitted?: () => void;
}

interface GradingResultItem {
  question_number: number;
  student_answer: string;
  is_correct: boolean;
  status: 'correct' | 'incorrect' | 'unreadable' | 'not_found';
  note?: string;
}

interface GradingResult {
  results: GradingResultItem[];
  total_correct: number;
  total_graded: number;
  overall_feedback: string;
}

export function QuizSubmissionUpload({ quiz, studentId, onSubmitted }: Props) {
  const { toast } = useToast();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(null);
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  const handleSubmit = async () => {
    if (images.length === 0) {
      toast({ title: '사진을 올려주세요', description: '풀이를 적은 노트 사진을 촬영해서 올려주세요.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const uploadedUrls = await Promise.all(
        images.map((img, index) => uploadQuizSubmissionImage(img.file, studentId, quiz.id, index))
      );

      // Create submission record
      const { data: submission, error: insertErr } = await supabase
        .from('math_quiz_submissions')
        .insert({
          student_id: studentId,
          concept_id: quiz.concept_id,
          quiz_id: quiz.id,
          image_urls: uploadedUrls,
          status: 'submitted',
        } as any)
        .select()
        .single();

      if (insertErr) throw insertErr;

      setUploading(false);
      setGrading(true);

      // Call AI grading
      const { data: gradeData, error: gradeErr } = await supabase.functions.invoke('grade-quiz-submission', {
        body: { submission_id: (submission as any).id },
      });

      if (gradeErr) throw gradeErr;
      if (gradeData?.error) throw new Error(gradeData.error);

      setGradingResult(gradeData.grading);
      setPointsAwarded(gradeData.points_awarded);
      
      // Celebration animation
      if (gradeData.points_awarded > 0) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3000);
      }

      toast({ title: '채점 완료!', description: `${gradeData.grading.total_correct}/${gradeData.grading.total_graded}문항 정답` });
      onSubmitted?.();
    } catch (error: any) {
      console.error(error);
      toast({ title: '오류', description: error.message || '제출에 실패했습니다.', variant: 'destructive' });
    } finally {
      setUploading(false);
      setGrading(false);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'correct': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'incorrect': return <XCircle className="w-5 h-5 text-destructive" />;
      case 'unreadable': return <HelpCircle className="w-5 h-5 text-yellow-500" />;
      default: return <HelpCircle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  return (
    <Card className="relative overflow-hidden">
      {/* Celebration overlay */}
      {showCelebration && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 animate-fade-in">
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

      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Camera className="w-5 h-5" />
          내 풀이 사진 올리기
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!gradingResult ? (
          <>
            <p className="text-sm text-muted-foreground">
              퀴즈를 손으로 풀어 적은 노트를 촬영해서 올려주세요. AI가 자동으로 채점해줍니다!
            </p>
            <HomeworkImageUploader
              images={images}
              onImagesChange={setImages}
              disabled={uploading || grading}
              maxFiles={8}
              maxDimension={1000}
              quality={0.62}
            />
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={images.length === 0 || uploading || grading}
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 업로드 중...</>
              ) : grading ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> AI 채점 중...</>
              ) : (
                <><Camera className="w-4 h-4 mr-2" /> 제출하고 채점받기</>
              )}
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            {/* Score summary */}
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-3xl font-bold text-primary">
                {gradingResult.total_correct} / {gradingResult.total_graded}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{gradingResult.overall_feedback}</p>
              <Badge className="mt-2 bg-yellow-500 text-white">
                <Star className="w-3 h-3 mr-1" /> +{pointsAwarded} 포인트 획득
              </Badge>
            </div>

            {/* Per-question results */}
            <div className="space-y-2">
              {gradingResult.results.map((r) => {
                const question = quiz.questions.find(q => q.question_number === r.question_number);
                return (
                  <div key={r.question_number} className="flex items-start gap-3 p-3 rounded-lg border">
                    {statusIcon(r.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Q{r.question_number}</p>
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
                      {r.note && <p className="text-xs text-muted-foreground mt-0.5">{r.note}</p>}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button variant="outline" className="w-full" onClick={() => { setGradingResult(null); setImages([]); }}>
              다시 제출하기
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
