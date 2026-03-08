import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Brain, FileText, RefreshCw, Trash2 } from 'lucide-react';
import { MathQuizPreview } from './MathQuizPreview';
import { QuizSubmissionReview } from './QuizSubmissionReview';
import { MathQuizAssignManager } from './MathQuizAssignManager';

interface MathConcept {
  id: string;
  grade: string;
  course: string;
  title: string;
  pdf_original_name: string;
  pdf_storage_path: string;
  status: string;
  created_at: string;
}

interface QuizData {
  id: string;
  concept_id: string;
  questions: QuizQuestion[];
  status: string;
}

export interface QuizQuestion {
  question_number: number;
  question_type: 'fill_blank' | 'true_false' | 'short_answer';
  question_text: string;
  answer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

const GRADES = ['중등', '고등 22개정', '고등 15개정'];
const COURSES: Record<string, string[]> = {
  '중등': ['중1', '중2', '중3'],
  '고등 22개정': ['공통수학1', '공통수학2', '대수', '미적분1', '기하'],
  '고등 15개정': ['미적분(2015)', '확률과통계(2015)'],
};

export function MathConceptManager() {
  const { toast } = useToast();
  const [concepts, setConcepts] = useState<MathConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  // Upload form
  const [grade, setGrade] = useState('');
  const [course, setCourse] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Quiz preview
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);

  // All quizzes for assignment manager
  const [allQuizzes, setAllQuizzes] = useState<any[]>([]);

  const fetchConcepts = async () => {
    const [conceptsRes, quizzesRes] = await Promise.all([
      supabase.from('math_concepts').select('*').order('created_at', { ascending: false }),
      supabase.from('math_concept_quizzes').select('id, concept_id, status, math_concepts(title, course, grade)') as any,
    ]);
    if (!conceptsRes.error) setConcepts((conceptsRes.data as any[]) || []);
    if (!quizzesRes.error) setAllQuizzes(quizzesRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchConcepts(); }, []);

  const handleUpload = async () => {
    if (!grade || !course || !title || !file) {
      toast({ title: '입력 오류', description: '모든 필드를 입력해주세요.', variant: 'destructive' });
      return;
    }
    if (file.type !== 'application/pdf') {
      toast({ title: '파일 오류', description: 'PDF 파일만 업로드 가능합니다.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `concepts/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('math-concepts')
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('math_concepts')
        .insert({
          grade,
          course,
          title,
          pdf_storage_path: path,
          pdf_original_name: file.name,
          pdf_file_size: file.size,
          status: 'uploaded',
        } as any);
      if (insertError) throw insertError;

      toast({ title: '업로드 완료', description: 'PDF가 성공적으로 업로드되었습니다.' });
      setGrade(''); setCourse(''); setTitle(''); setFile(null);
      await fetchConcepts();
    } catch (error) {
      console.error(error);
      toast({ title: '오류', description: '업로드에 실패했습니다.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateQuiz = async (conceptId: string) => {
    setGenerating(conceptId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-math-quiz', {
        body: { concept_id: conceptId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: '퀴즈 생성 완료', description: '5문항이 생성되었습니다. 미리보기를 확인하세요.' });
      await fetchConcepts();
      // Open preview
      setSelectedConceptId(conceptId);
      await loadQuiz(conceptId);
    } catch (error: any) {
      console.error(error);
      toast({ title: '오류', description: error.message || '퀴즈 생성에 실패했습니다.', variant: 'destructive' });
    } finally {
      setGenerating(null);
    }
  };

  const loadQuiz = async (conceptId: string) => {
    setLoadingQuiz(true);
    const { data, error } = await supabase
      .from('math_concept_quizzes')
      .select('*')
      .eq('concept_id', conceptId)
      .maybeSingle();
    if (!error && data) {
      setQuizData(data as any);
    } else {
      setQuizData(null);
    }
    setLoadingQuiz(false);
  };

  const handleDeleteConcept = async (concept: MathConcept) => {
    if (!confirm(`"${concept.title}" 개념을 삭제하시겠습니까?`)) return;
    try {
      await supabase.storage.from('math-concepts').remove([concept.pdf_storage_path]);
      await supabase.from('math_concepts').delete().eq('id', concept.id);
      toast({ title: '삭제 완료' });
      if (selectedConceptId === concept.id) {
        setSelectedConceptId(null);
        setQuizData(null);
      }
      await fetchConcepts();
    } catch (error) {
      toast({ title: '오류', description: '삭제 실패', variant: 'destructive' });
    }
  };

  const handleSaveQuiz = async (questions: QuizQuestion[]) => {
    if (!quizData) return;
    try {
      const { error } = await supabase
        .from('math_concept_quizzes')
        .update({ questions: questions as any, updated_at: new Date().toISOString() } as any)
        .eq('id', quizData.id);
      if (error) throw error;
      toast({ title: '저장 완료', description: '퀴즈가 수정되었습니다.' });
      setQuizData({ ...quizData, questions });
    } catch (error) {
      toast({ title: '오류', description: '저장 실패', variant: 'destructive' });
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'uploaded': return <Badge variant="secondary">업로드됨</Badge>;
      case 'quiz_generated': return <Badge className="bg-green-500 text-white">퀴즈 생성됨</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const availableCourses = grade ? COURSES[grade] || [] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
          <Brain className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">수학 개념 관리</h1>
          <p className="text-muted-foreground">PDF 업로드 → AI 퀴즈 자동 생성</p>
        </div>
      </div>

      {/* Upload Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            개념 PDF 업로드
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label>학년</Label>
              <Select value={grade} onValueChange={(v) => { setGrade(v); setCourse(''); }}>
                <SelectTrigger><SelectValue placeholder="학년 선택" /></SelectTrigger>
                <SelectContent>
                  {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>과정</Label>
              <Select value={course} onValueChange={setCourse} disabled={!grade}>
                <SelectTrigger><SelectValue placeholder="과정 선택" /></SelectTrigger>
                <SelectContent>
                  {availableCourses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>개념 제목</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 이차함수의 그래프" />
            </div>
            <div>
              <Label>PDF 파일</Label>
              <Input
                type="file"
                accept=".pdf"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <Button className="mt-4" onClick={handleUpload} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
            업로드
          </Button>
        </CardContent>
      </Card>

      {/* Concepts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            업로드된 개념 목록 ({concepts.length}개)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : concepts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">업로드된 개념이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {concepts.map(concept => (
                <div
                  key={concept.id}
                  className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedConceptId === concept.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => {
                    setSelectedConceptId(concept.id);
                    loadQuiz(concept.id);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{concept.grade}</Badge>
                      <Badge variant="outline">{concept.course}</Badge>
                      {statusBadge(concept.status)}
                    </div>
                    <p className="font-medium truncate">{concept.title}</p>
                    <p className="text-xs text-muted-foreground">{concept.pdf_original_name}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={e => { e.stopPropagation(); handleGenerateQuiz(concept.id); }}
                      disabled={generating === concept.id}
                    >
                      {generating === concept.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : concept.status === 'quiz_generated' ? (
                        <RefreshCw className="w-4 h-4 mr-1" />
                      ) : (
                        <Brain className="w-4 h-4 mr-1" />
                      )}
                      {concept.status === 'quiz_generated' ? '다시 생성' : '퀴즈 생성'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={e => { e.stopPropagation(); handleDeleteConcept(concept); }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quiz Preview */}
      {selectedConceptId && (
        <MathQuizPreview
          quiz={quizData}
          loading={loadingQuiz}
          onSave={handleSaveQuiz}
          onRegenerate={() => handleGenerateQuiz(selectedConceptId)}
          regenerating={generating === selectedConceptId}
        />
      )}

      {/* Quiz Assignment */}
      <MathQuizAssignManager quizzes={allQuizzes} />

      {/* Submission Review */}
      <QuizSubmissionReview />
    </div>
  );
}
