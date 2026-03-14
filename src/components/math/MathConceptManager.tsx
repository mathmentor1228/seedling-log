import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Brain, FileText, RefreshCw, Trash2, BookOpen, Send, ClipboardCheck, ChevronRight, Search } from 'lucide-react';
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

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

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

      toast({ title: '퀴즈 생성 완료', description: '5문항이 생성되었습니다.' });
      await fetchConcepts();
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

  const availableCourses = grade ? COURSES[grade] || [] : [];

  const quizReadyCount = concepts.filter(c => c.status === 'quiz_generated').length;
  const uploadedOnlyCount = concepts.filter(c => c.status === 'uploaded').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">수학 개념퀴즈</h1>
            <p className="text-xs text-muted-foreground">PDF 업로드 → AI 퀴즈 생성 → 학생 배정 → 채점</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{concepts.length}개 개념</Badge>
          <Badge className="bg-green-500/10 text-green-700 border-green-200 text-xs">{quizReadyCount}개 퀴즈</Badge>
          {uploadedOnlyCount > 0 && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">{uploadedOnlyCount}개 대기</Badge>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="concepts" className="space-y-4">
        <TabsList className="w-full grid grid-cols-3 h-11">
          <TabsTrigger value="concepts" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <BookOpen className="w-4 h-4" />
            개념 & 퀴즈
          </TabsTrigger>
          <TabsTrigger value="assign" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Send className="w-4 h-4" />
            퀴즈 배정
          </TabsTrigger>
          <TabsTrigger value="review" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <ClipboardCheck className="w-4 h-4" />
            제출 채점
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Concepts & Quiz Generation */}
        <TabsContent value="concepts" className="space-y-4">
          {/* Upload Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Upload className="w-4 h-4" />
                새 개념 업로드
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs">학년</Label>
                  <Select value={grade} onValueChange={(v) => { setGrade(v); setCourse(''); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">과정</Label>
                  <Select value={course} onValueChange={setCourse} disabled={!grade}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {availableCourses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">개념 제목</Label>
                  <Input className="h-9 text-sm" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 이차함수의 그래프" />
                </div>
                <div>
                  <Label className="text-xs">PDF 파일</Label>
                  <Input className="h-9 text-sm" type="file" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
                </div>
                <div className="flex items-end">
                  <Button className="h-9 w-full text-sm" onClick={handleUpload} disabled={uploading}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                    업로드
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Concepts List */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4" />
                  개념 목록
                </CardTitle>
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-xs"
                    placeholder="제목 검색..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : concepts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">아직 업로드된 개념이 없습니다.</p>
                  <p className="text-xs mt-1">위 양식에서 PDF를 업로드하세요.</p>
                </div>
              ) : (
                <ConceptList
                  concepts={concepts}
                  searchQuery={searchQuery}
                  selectedConceptId={selectedConceptId}
                  generating={generating}
                  onSelect={(id) => { setSelectedConceptId(id); loadQuiz(id); }}
                  onGenerate={handleGenerateQuiz}
                  onDelete={handleDeleteConcept}
                />
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
        </TabsContent>

        {/* Tab 2: Quiz Assignment */}
        <TabsContent value="assign">
          <MathQuizAssignManager quizzes={allQuizzes} />
        </TabsContent>

        {/* Tab 3: Submission Review */}
        <TabsContent value="review">
          <QuizSubmissionReview />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Concept List Sub-component ---------- */

interface ConceptListProps {
  concepts: MathConcept[];
  searchQuery: string;
  selectedConceptId: string | null;
  generating: string | null;
  onSelect: (id: string) => void;
  onGenerate: (id: string) => void;
  onDelete: (concept: MathConcept) => void;
}

function ConceptList({ concepts, searchQuery, selectedConceptId, generating, onSelect, onGenerate, onDelete }: ConceptListProps) {
  const filtered = searchQuery.trim()
    ? concepts.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()) || c.course.toLowerCase().includes(searchQuery.toLowerCase()))
    : concepts;

  return (
    <Tabs defaultValue={GRADES[0]}>
      <TabsList className="w-full">
        {GRADES.map(g => {
          const count = filtered.filter(c => c.grade === g).length;
          return (
            <TabsTrigger key={g} value={g} className="flex-1 text-xs sm:text-sm">
              {g} <span className="ml-1 text-muted-foreground">({count})</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
      {GRADES.map(g => {
        const gradeFiltered = filtered.filter(c => c.grade === g);
        // Group by course
        const courses = Array.from(new Set(gradeFiltered.map(c => c.course)));
        return (
          <TabsContent key={g} value={g} className="mt-3">
            {gradeFiltered.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">이 학년의 개념이 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {courses.map(courseName => {
                  const items = gradeFiltered.filter(c => c.course === courseName);
                  return (
                    <div key={courseName}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs font-medium">{courseName}</Badge>
                        <span className="text-xs text-muted-foreground">{items.length}개</span>
                      </div>
                      <div className="space-y-1.5">
                        {items.map(concept => (
                          <div
                            key={concept.id}
                            className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${
                              selectedConceptId === concept.id
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => onSelect(concept.id)}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selectedConceptId === concept.id ? 'rotate-90 text-primary' : ''}`} />
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{concept.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{concept.pdf_original_name}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-3 shrink-0">
                              {concept.status === 'quiz_generated' ? (
                                <Badge className="bg-green-500/10 text-green-700 border-green-200 text-[10px]">퀴즈 완료</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">대기</Badge>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                                onClick={e => { e.stopPropagation(); onGenerate(concept.id); }}
                                disabled={generating === concept.id}
                              >
                                {generating === concept.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : concept.status === 'quiz_generated' ? (
                                  <><RefreshCw className="w-3.5 h-3.5 mr-1" />재생성</>
                                ) : (
                                  <><Brain className="w-3.5 h-3.5 mr-1" />생성</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={e => { e.stopPropagation(); onDelete(concept); }}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
