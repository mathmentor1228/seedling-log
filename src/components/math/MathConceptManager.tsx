import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  Upload,
  Brain,
  FileText,
  RefreshCw,
  Trash2,
  BookOpen,
  Send,
  ClipboardCheck,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { MathQuizPreview } from './MathQuizPreview';
import { QuizSubmissionReview } from './QuizSubmissionReview';
import { MathQuizAssignManager } from './MathQuizAssignManager';
import { QuizVersionTracker } from './QuizVersionTracker';

interface ConceptCreator {
  full_name: string | null;
}

interface MathConcept {
  id: string;
  subject: string;
  grade: string;
  course: string;
  title: string;
  pdf_original_name: string;
  pdf_storage_path: string;
  status: string;
  created_at: string;
  created_by: string | null;
  quiz_generation_prompt: string | null;
  creator?: ConceptCreator | null;
}

interface QuizSummary {
  id: string;
  concept_id: string;
  status: string;
  math_concepts: {
    title: string;
    course: string;
    grade: string;
    subject: string;
  } | null;
}

interface QuizData {
  id: string;
  concept_id: string;
  questions: QuizQuestion[];
  status: string;
  version_number?: number;
  version_label?: string | null;
}

interface QuizVersionSummary {
  id: string;
  version_number: number;
  version_label: string | null;
  created_at: string;
}

export interface QuizQuestion {
  question_number: number;
  question_type: 'fill_blank' | 'true_false' | 'short_answer';
  question_text: string;
  answer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '기타'];
const GRADES = ['중등', '고등 22개정', '고등 15개정', '초등', '기타'];
const COURSE_HINTS: Record<string, string[]> = {
  수학: ['중1', '중2', '중3', '공통수학1', '공통수학2', '대수', '미적분1', '기하'],
  영어: ['중등 영어', '고등 영어', '독해', '문법'],
  국어: ['중등 국어', '고등 국어', '문학', '비문학', '문법'],
  과학: ['중등 과학', '통합과학', '물리', '화학', '생명과학', '지구과학'],
  사회: ['중등 사회', '통합사회', '한국사', '세계사', '정치와법'],
};

const ALL_SUBJECT_FILTER = 'all';

export function MathConceptManager() {
  const { toast } = useToast();
  const [concepts, setConcepts] = useState<MathConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  // Upload form
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [grade, setGrade] = useState(GRADES[0]);
  const [course, setCourse] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadPrompt, setUploadPrompt] = useState('');

  // Quiz preview
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [conceptVersions, setConceptVersions] = useState<QuizVersionSummary[]>([]);

  // Concept tuning
  const [conceptSubjectDraft, setConceptSubjectDraft] = useState(SUBJECTS[0]);
  const [conceptCourseDraft, setConceptCourseDraft] = useState('');
  const [conceptPromptDraft, setConceptPromptDraft] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // All quizzes for assignment manager
  const [allQuizzes, setAllQuizzes] = useState<QuizSummary[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState(ALL_SUBJECT_FILTER);

  const selectedConcept = useMemo(
    () => concepts.find((concept) => concept.id === selectedConceptId) ?? null,
    [concepts, selectedConceptId],
  );

  const subjectFilterOptions = useMemo(() => {
    const values = Array.from(new Set(concepts.map((concept) => concept.subject).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'ko'),
    );
    return [ALL_SUBJECT_FILTER, ...values];
  }, [concepts]);

  const courseHints = useMemo(() => COURSE_HINTS[subject] || [], [subject]);

  useEffect(() => {
    if (!selectedConcept) {
      setConceptSubjectDraft(SUBJECTS[0]);
      setConceptCourseDraft('');
      setConceptPromptDraft('');
      return;
    }

    setConceptSubjectDraft(selectedConcept.subject || SUBJECTS[0]);
    setConceptCourseDraft(selectedConcept.course || '');
    setConceptPromptDraft(selectedConcept.quiz_generation_prompt || '');
  }, [selectedConcept]);

  const fetchConcepts = async () => {
    setLoading(true);

    const [conceptsRes, quizzesRes] = await Promise.all([
      supabase.from('math_concepts').select('*').order('created_at', { ascending: false }),
      supabase
        .from('math_concept_quizzes')
        .select('id, concept_id, status, math_concepts(title, course, grade, subject)') as any,
    ]);

    if (conceptsRes.error) {
      console.error(conceptsRes.error);
      toast({ title: '오류', description: '개념 목록을 불러오지 못했습니다.', variant: 'destructive' });
    } else {
      const conceptRows = ((conceptsRes.data as any[]) || []).map((row) => ({
        ...row,
        subject: row.subject || '수학',
      }));

      const creatorIds = Array.from(
        new Set(conceptRows.map((concept) => concept.created_by).filter(Boolean) as string[]),
      );

      let creatorMap: Record<string, string> = {};
      if (creatorIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds as any);

        creatorMap = (profileRows || []).reduce<Record<string, string>>((acc, profile: any) => {
          acc[profile.id] = profile.full_name || '이름 없음';
          return acc;
        }, {});
      }

      setConcepts(
        conceptRows.map((concept) => ({
          ...concept,
          creator: concept.created_by
            ? { full_name: creatorMap[concept.created_by] || '담당자 미확인' }
            : { full_name: '담당자 미지정' },
        })),
      );
    }

    if (quizzesRes.error) {
      console.error(quizzesRes.error);
    } else {
      setAllQuizzes((quizzesRes.data || []) as QuizSummary[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchConcepts();
  }, []);

  const handleUpload = async () => {
    if (!subject || !grade || !course.trim() || !title.trim() || !file) {
      toast({ title: '입력 오류', description: '과목, 학년, 과정, 제목, 파일을 입력해주세요.', variant: 'destructive' });
      return;
    }

    if (file.type !== 'application/pdf') {
      toast({ title: '파일 오류', description: 'PDF 파일만 업로드 가능합니다.', variant: 'destructive' });
      return;
    }

    setUploading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `concepts/${Date.now()}_${safeName}`;

      const { error: uploadError } = await supabase.storage.from('math-concepts').upload(path, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('math_concepts').insert({
        subject,
        grade,
        course: course.trim(),
        title: title.trim(),
        pdf_storage_path: path,
        pdf_original_name: file.name,
        pdf_file_size: file.size,
        status: 'uploaded',
        created_by: userId,
        quiz_generation_prompt: uploadPrompt.trim() || null,
      } as any);

      if (insertError) throw insertError;

      toast({ title: '업로드 완료', description: '개념 파일이 저장되었습니다.' });
      setSubject(SUBJECTS[0]);
      setGrade(GRADES[0]);
      setCourse('');
      setTitle('');
      setUploadPrompt('');
      setFile(null);
      await fetchConcepts();
    } catch (error) {
      console.error(error);
      toast({ title: '오류', description: '업로드에 실패했습니다.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const saveSelectedConceptConfigIfNeeded = async (conceptId: string) => {
    if (!selectedConcept || selectedConcept.id !== conceptId) return;

    const nextSubject = conceptSubjectDraft.trim() || selectedConcept.subject;
    const nextCourse = conceptCourseDraft.trim() || selectedConcept.course;
    const nextPrompt = conceptPromptDraft.trim() || null;

    const currentPrompt = selectedConcept.quiz_generation_prompt || null;

    const hasChanged =
      nextSubject !== selectedConcept.subject || nextCourse !== selectedConcept.course || nextPrompt !== currentPrompt;

    if (!hasChanged) return;

    const { error } = await supabase
      .from('math_concepts')
      .update({
        subject: nextSubject,
        course: nextCourse,
        quiz_generation_prompt: nextPrompt,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', conceptId);

    if (error) throw error;
  };

  const handleGenerateQuiz = async (conceptId: string) => {
    setGenerating(conceptId);

    try {
      await saveSelectedConceptConfigIfNeeded(conceptId);

      const { data, error } = await supabase.functions.invoke('generate-math-quiz', {
        body: { concept_id: conceptId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: '퀴즈 생성 완료', description: '개념 퀴즈가 생성되었습니다.' });
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
    // Load the latest version quiz for this concept
    const { data, error } = await supabase
      .from('math_concept_quizzes')
      .select('*')
      .eq('concept_id', conceptId)
      .order('version_number', { ascending: false })
      .limit(1)
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
      console.error(error);
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
      console.error(error);
      toast({ title: '오류', description: '저장 실패', variant: 'destructive' });
    }
  };

  const handleSaveConceptConfig = async () => {
    if (!selectedConcept) return;

    const nextSubject = conceptSubjectDraft.trim() || selectedConcept.subject;
    const nextCourse = conceptCourseDraft.trim() || selectedConcept.course;

    if (!nextCourse) {
      toast({ title: '입력 오류', description: '과정명은 비워둘 수 없습니다.', variant: 'destructive' });
      return;
    }

    setSavingConfig(true);

    try {
      const { error } = await supabase
        .from('math_concepts')
        .update({
          subject: nextSubject,
          course: nextCourse,
          quiz_generation_prompt: conceptPromptDraft.trim() || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', selectedConcept.id);

      if (error) throw error;

      toast({ title: '설정 저장 완료', description: '출제 설정이 반영되었습니다.' });
      await fetchConcepts();
    } catch (error) {
      console.error(error);
      toast({ title: '오류', description: '설정 저장에 실패했습니다.', variant: 'destructive' });
    } finally {
      setSavingConfig(false);
    }
  };

  const quizReadyCount = concepts.filter((concept) => concept.status === 'quiz_generated').length;
  const uploadedOnlyCount = concepts.filter((concept) => concept.status === 'uploaded').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">개념 퀴즈</h1>
            <p className="text-xs text-muted-foreground">PDF 업로드 → 출제 가이드 설정 → 퀴즈 생성 → 학생 배정 → 채점</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {concepts.length}개 개념
          </Badge>
          <Badge className="text-xs">{quizReadyCount}개 퀴즈 준비</Badge>
          {uploadedOnlyCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {uploadedOnlyCount}개 생성 대기
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="concepts" className="space-y-4">
        <TabsList className="w-full grid grid-cols-4 h-11">
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
          <TabsTrigger value="tracking" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <ChevronRight className="w-4 h-4" />
            추적 대시보드
          </TabsTrigger>
        </TabsList>

        <TabsContent value="concepts" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Upload className="w-4 h-4" />
                새 개념 업로드
              </CardTitle>
              <CardDescription className="text-xs">과목·과정 정보를 함께 저장하면 과목별 정렬과 출제 조정이 쉬워집니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div>
                  <Label className="text-xs">과목</Label>
                  <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">학년</Label>
                  <Select value={grade} onValueChange={setGrade}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">과정</Label>
                  <Input
                    className="h-9 text-sm"
                    list="concept-course-hints"
                    value={course}
                    onChange={(event) => setCourse(event.target.value)}
                    placeholder="예: 공통수학1"
                  />
                  <datalist id="concept-course-hints">
                    {courseHints.map((hint) => (
                      <option key={hint} value={hint} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <Label className="text-xs">개념 제목</Label>
                  <Input
                    className="h-9 text-sm"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="예: 함수의 극한"
                  />
                </div>
                <div>
                  <Label className="text-xs">PDF 파일</Label>
                  <Input
                    className="h-9 text-sm"
                    type="file"
                    accept=".pdf"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </div>
                <div className="flex items-end">
                  <Button className="h-9 w-full text-sm" onClick={handleUpload} disabled={uploading}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                    업로드
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs">출제 가이드 프롬프트 (선택)</Label>
                <Textarea
                  value={uploadPrompt}
                  onChange={(event) => setUploadPrompt(event.target.value)}
                  placeholder="예: 서술형은 핵심 용어 정의를 먼저 확인하고, 오답 유도 문항은 쉬운 표현으로 만들어줘"
                  className="min-h-[88px]"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4" />
                  개념 목록
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative w-56">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      className="h-8 pl-8 text-xs"
                      placeholder="제목/과정 검색..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                  <div className="w-36">
                    <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                      <SelectTrigger className="h-8 text-xs">
                        <SlidersHorizontal className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                        <SelectValue placeholder="과목 필터" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_SUBJECT_FILTER}>전체 과목</SelectItem>
                        {subjectFilterOptions
                          .filter((option) => option !== ALL_SUBJECT_FILTER)
                          .map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
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
                  subjectFilter={subjectFilter}
                  selectedConceptId={selectedConceptId}
                  generating={generating}
                  onSelect={(id) => {
                    setSelectedConceptId(id);
                    loadQuiz(id);
                  }}
                  onGenerate={handleGenerateQuiz}
                  onDelete={handleDeleteConcept}
                />
              )}
            </CardContent>
          </Card>

          {selectedConcept && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">선택 개념 출제 설정</CardTitle>
                <CardDescription className="text-xs">
                  과목/과정과 출제 가이드를 수정한 뒤 저장하면, 다음 퀴즈 생성부터 바로 반영됩니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">과목</Label>
                    <Select value={conceptSubjectDraft} onValueChange={setConceptSubjectDraft}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="과목 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">과정</Label>
                    <Input
                      className="h-9 text-sm"
                      value={conceptCourseDraft}
                      onChange={(event) => setConceptCourseDraft(event.target.value)}
                      placeholder="예: 중2 영어 독해"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">출제 가이드 프롬프트</Label>
                  <Textarea
                    value={conceptPromptDraft}
                    onChange={(event) => setConceptPromptDraft(event.target.value)}
                    placeholder="예: 오답 선지는 학생들이 자주 혼동하는 개념 중심으로 구성하고, 해설은 한 줄 요약을 먼저 써줘"
                    className="min-h-[96px]"
                  />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSaveConceptConfig} disabled={savingConfig}>
                    {savingConfig ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    설정 저장
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

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

        <TabsContent value="assign">
          <MathQuizAssignManager quizzes={allQuizzes} />
        </TabsContent>

        <TabsContent value="review">
          <QuizSubmissionReview />
        </TabsContent>

        <TabsContent value="tracking">
          <QuizVersionTracker />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ConceptListProps {
  concepts: MathConcept[];
  searchQuery: string;
  subjectFilter: string;
  selectedConceptId: string | null;
  generating: string | null;
  onSelect: (id: string) => void;
  onGenerate: (id: string) => void;
  onDelete: (concept: MathConcept) => void;
}

function ConceptList({
  concepts,
  searchQuery,
  subjectFilter,
  selectedConceptId,
  generating,
  onSelect,
  onGenerate,
  onDelete,
}: ConceptListProps) {
  const query = searchQuery.trim().toLowerCase();

  const filtered = concepts.filter((concept) => {
    const searchMatched =
      !query ||
      concept.title.toLowerCase().includes(query) ||
      concept.course.toLowerCase().includes(query) ||
      concept.subject.toLowerCase().includes(query);

    const subjectMatched = subjectFilter === ALL_SUBJECT_FILTER || concept.subject === subjectFilter;

    return searchMatched && subjectMatched;
  });

  const grades = Array.from(new Set(filtered.map((concept) => concept.grade).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );

  if (grades.length === 0) {
    return <p className="text-center text-muted-foreground py-8 text-sm">필터 조건에 맞는 개념이 없습니다.</p>;
  }

  return (
    <Tabs defaultValue={grades[0]}>
      <TabsList className="w-full flex-wrap h-auto">
        {grades.map((grade) => {
          const count = filtered.filter((concept) => concept.grade === grade).length;
          return (
            <TabsTrigger key={grade} value={grade} className="text-xs sm:text-sm">
              {grade}
              <span className="ml-1 text-muted-foreground">({count})</span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {grades.map((grade) => {
        const gradeFiltered = filtered.filter((concept) => concept.grade === grade);
        const subjects = Array.from(new Set(gradeFiltered.map((concept) => concept.subject))).sort((a, b) =>
          a.localeCompare(b, 'ko'),
        );

        return (
          <TabsContent key={grade} value={grade} className="mt-3 space-y-4">
            {subjects.map((subjectName) => {
              const subjectItems = gradeFiltered.filter((concept) => concept.subject === subjectName);
              const courses = Array.from(new Set(subjectItems.map((concept) => concept.course))).sort((a, b) =>
                a.localeCompare(b, 'ko'),
              );

              return (
                <div key={`${grade}-${subjectName}`} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-medium">
                      {subjectName}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{subjectItems.length}개</span>
                  </div>

                  {courses.map((courseName) => {
                    const items = subjectItems.filter((concept) => concept.course === courseName);
                    return (
                      <div key={`${subjectName}-${courseName}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs font-medium">
                            {courseName}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{items.length}개</span>
                        </div>

                        <div className="space-y-1.5">
                          {items.map((concept) => (
                            <div
                              key={concept.id}
                              className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${
                                selectedConceptId === concept.id ? 'border-primary bg-primary/5 shadow-sm' : 'hover:bg-muted/50'
                              }`}
                              onClick={() => onSelect(concept.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <ChevronRight
                                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                                    selectedConceptId === concept.id ? 'rotate-90 text-primary' : ''
                                  }`}
                                />
                                <div className="min-w-0">
                                  <p className="font-medium text-sm truncate">{concept.title}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">{concept.pdf_original_name}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    제작자: {concept.creator?.full_name || '담당자 미지정'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 ml-3 shrink-0">
                                {concept.status === 'quiz_generated' ? (
                                  <Badge className="text-[10px]">퀴즈 완료</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">
                                    생성 대기
                                  </Badge>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs px-2"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onGenerate(concept.id);
                                  }}
                                  disabled={generating === concept.id}
                                >
                                  {generating === concept.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : concept.status === 'quiz_generated' ? (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                                      재생성
                                    </>
                                  ) : (
                                    <>
                                      <Brain className="w-3.5 h-3.5 mr-1" />
                                      생성
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onDelete(concept);
                                  }}
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
              );
            })}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
