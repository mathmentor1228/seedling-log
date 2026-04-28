import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Camera, Loader2, CheckCircle2, Sparkles, Upload } from 'lucide-react';
import HomeworkImageUploader, { type ImageItem } from '@/components/student/HomeworkImageUploader';
import { compressImage } from '@/lib/imageCompression';
import { preprocessImageForOCR } from '@/lib/imagePreprocess';
import logoImg from '@/assets/logo-thementor.png';

const uploadQuizImage = async (file: File, studentId: string, quizId: string, index: number) => {
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

export default function QuizSubmitPage() {
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('quiz_id');
  const presetStudentId = searchParams.get('student_id');

  const [studentCode, setStudentCode] = useState('');
  const [studentId, setStudentId] = useState(presetStudentId || '');
  const [studentName, setStudentName] = useState('');
  const [conceptId, setConceptId] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [step, setStep] = useState<'identify' | 'upload' | 'done'>(presetStudentId ? 'upload' : 'identify');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load quiz info
  useEffect(() => {
    if (!quizId) return;
    supabase
      .from('math_concept_quizzes')
      .select('id, concept_id, math_concepts(title, subject, course)')
      .eq('id', quizId)
      .single()
      .then(({ data }) => {
        if (data) {
          setConceptId(data.concept_id);
          const c = (data as any).math_concepts;
          setQuizTitle(c ? `${c.subject} · ${c.course} · ${c.title}` : '개념 퀴즈');
        }
      });
  }, [quizId]);

  // If studentId preset, load name
  useEffect(() => {
    if (!presetStudentId) return;
    supabase
      .from('students')
      .select('name')
      .eq('id', presetStudentId)
      .single()
      .then(({ data }) => {
        if (data) setStudentName(data.name);
      });
  }, [presetStudentId]);

  const handleIdentify = async () => {
    if (!studentCode.trim()) { setError('학생 코드를 입력해주세요.'); return; }
    setLoading(true);
    setError('');
    const { data, error: err } = await (supabase
      .from('student_accounts') as any)
      .select('student_id, students(name)')
      .eq('student_code', studentCode.trim().toUpperCase())
      .single();
    if (err || !data) {
      setError('학생을 찾을 수 없습니다. 코드를 확인해주세요.');
      setLoading(false);
      return;
    }
    setStudentId(data.student_id);
    setStudentName((data as any).students?.name || '');
    setStep('upload');
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!quizId || !studentId || !conceptId || images.length === 0) return;
    setSubmitting(true);
    try {
      const uploadedUrls = await Promise.all(
        images.map((img, index) => uploadQuizImage(img.file, studentId, quizId, index))
      );

      const { error: insErr } = await supabase
        .from('math_quiz_submissions')
        .insert({
          student_id: studentId,
          concept_id: conceptId,
          quiz_id: quizId,
          image_urls: uploadedUrls,
          status: 'submitted',
        } as any);
      if (insErr) throw insErr;

      setStep('done');
    } catch (e: any) {
      setError(e.message || '제출에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!quizId) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center text-destructive">
            유효하지 않은 링크입니다.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2 pb-4">
          <img src={logoImg} alt="더멘토" className="h-8 mx-auto" />
          <CardTitle className="text-lg">퀴즈 답안 제출</CardTitle>
          {quizTitle && <p className="text-sm text-muted-foreground">{quizTitle}</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'identify' && (
            <>
              <div className="space-y-2">
                <Label>학생 코드</Label>
                <Input
                  placeholder="학생 코드를 입력하세요"
                  value={studentCode}
                  onChange={e => setStudentCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleIdentify()}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={handleIdentify} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                확인
              </Button>
            </>
          )}

          {step === 'upload' && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <Badge variant="secondary" className="shrink-0">
                  {studentName || '학생'}
                </Badge>
                <span className="text-sm text-muted-foreground">답안을 촬영해서 올려주세요</span>
              </div>

              <HomeworkImageUploader
                images={images}
                onImagesChange={setImages}
                disabled={submitting}
                maxFiles={8}
                maxDimension={1000}
                quality={0.62}
              />

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button className="w-full" onClick={handleSubmit} disabled={images.length === 0 || submitting}>
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 제출 중...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" /> 제출하기</>
                )}
              </Button>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-8 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold">제출 완료! 🎉</h3>
              <p className="text-sm text-muted-foreground">
                오늘도 고생했어! 결과는 잠시 후 대시보드에서 확인해 봐! ✨
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
