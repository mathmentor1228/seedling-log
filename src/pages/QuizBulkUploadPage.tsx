import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Camera, Loader2, Upload, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import HomeworkImageUploader, { type ImageItem } from '@/components/student/HomeworkImageUploader';
import { compressImage } from '@/lib/imageCompression';
import { preprocessImageForOCR } from '@/lib/imagePreprocess';
import { ArchiveNotice } from '@/components/layout/ArchiveNotice';

interface UploadResult {
  fileName: string;
  studentName: string;
  status: 'submitted' | 'error' | 'no_qr';
  message: string;
}

function BulkUploadContent() {
  const { toast } = useToast();
  const [quizId, setQuizId] = useState('');
  const [quizzes, setQuizzes] = useState<{ id: string; title: string; concept_id: string }[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  // Load available quizzes
  const loadQuizzes = async () => {
    setLoadingQuizzes(true);
    const { data } = await supabase
      .from('math_concept_quizzes')
      .select('id, concept_id, math_concepts(title, subject, course)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      setQuizzes(data.map((q: any) => ({
        id: q.id,
        concept_id: q.concept_id,
        title: q.math_concepts ? `${q.math_concepts.subject} · ${q.math_concepts.course} · ${q.math_concepts.title}` : q.id,
      })));
    }
    setLoadingQuizzes(false);
  };

  useState(() => { loadQuizzes(); });

  const handleBulkProcess = async () => {
    if (!quizId || images.length === 0) {
      toast({ title: '입력 오류', description: '퀴즈를 선택하고 이미지를 올려주세요.', variant: 'destructive' });
      return;
    }

    const selectedQuiz = quizzes.find(q => q.id === quizId);
    if (!selectedQuiz) return;

    setProcessing(true);
    const uploadResults: UploadResult[] = [];

    try {
      // Call bulk processing edge function
      const { data, error } = await supabase.functions.invoke('bulk-quiz-upload', {
        body: {
          quiz_id: quizId,
          concept_id: selectedQuiz.concept_id,
          image_count: images.length,
        },
      });

      // Upload each image, preprocess, and create submission
      // In bulk mode, we assign all images to the quiz and let AI grade them
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          const preprocessed = await preprocessImageForOCR(img.file);
          const compressed = await compressImage(preprocessed);
          const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const path = `bulk/${quizId}/${Date.now()}_${i}_${safeName}`;

          const { error: upErr } = await supabase.storage
            .from('quiz-submissions')
            .upload(path, compressed);
          if (upErr) throw upErr;

          const { data: urlData } = supabase.storage
            .from('quiz-submissions')
            .getPublicUrl(path);

          // Create a pending submission for bulk processing
          const { error: insErr } = await supabase
            .from('math_quiz_submissions')
            .insert({
              student_id: '00000000-0000-0000-0000-000000000000', // placeholder, will be identified by AI
              concept_id: selectedQuiz.concept_id,
              quiz_id: quizId,
              image_urls: [urlData.publicUrl],
              status: 'bulk_pending',
            } as any);

          if (insErr) throw insErr;

          uploadResults.push({
            fileName: img.file.name,
            studentName: `이미지 ${i + 1}`,
            status: 'submitted',
            message: '업로드 완료 - AI 분류 대기 중',
          });
        } catch (e: any) {
          uploadResults.push({
            fileName: img.file.name,
            studentName: '',
            status: 'error',
            message: e.message || '업로드 실패',
          });
        }
      }

      // Trigger bulk grading
      await supabase.functions.invoke('grade-quiz-submission', {
        body: { bulk_quiz_id: quizId, mode: 'bulk' },
      }).catch(() => {/* non-critical */});

      setResults(uploadResults);
      toast({
        title: '일괄 업로드 완료',
        description: `${uploadResults.filter(r => r.status === 'submitted').length}/${images.length}장 업로드됨`,
      });
    } catch (e: any) {
      toast({ title: '오류', description: e.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            일괄 업로드 모드
          </CardTitle>
          <CardDescription>
            여러 학생의 답안지를 한 번에 촬영하여 업로드하면, AI가 QR 코드를 인식해 학생별로 자동 분류하고 채점합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>퀴즈 선택</Label>
            <Select value={quizId} onValueChange={setQuizId}>
              <SelectTrigger>
                <SelectValue placeholder="채점할 퀴즈를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {quizzes.map(q => (
                  <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <HomeworkImageUploader
            images={images}
            onImagesChange={setImages}
            disabled={processing}
          />

          <Button
            className="w-full"
            onClick={handleBulkProcess}
            disabled={!quizId || images.length === 0 || processing}
          >
            {processing ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 처리 중...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> {images.length}장 일괄 업로드 및 채점</>
            )}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">업로드 결과</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border text-sm">
                  {r.status === 'submitted' ? (
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  )}
                  <span className="font-medium truncate">{r.fileName}</span>
                  <Badge variant={r.status === 'submitted' ? 'secondary' : 'destructive'} className="ml-auto shrink-0">
                    {r.message}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function QuizBulkUploadPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <div className="space-y-3">
        <ArchiveNotice to="/quiz-lookup" label="문제 조회" />
      <BulkUploadContent />
    </div>
    </ProtectedRoute>
  );
}
