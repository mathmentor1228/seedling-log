import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2, CheckCircle2, XCircle, Search, Users, Save, ClipboardCheck,
  Calendar, ChevronRight, CheckCheck, XOctagon,
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';

interface Quiz {
  id: string;
  concept_id: string;
  answer_code: string | null;
  questions: any[];
  created_at: string;
  math_concepts: { title: string; course: string; grade: string; subject: string } | null;
}

interface Student {
  id: string;
  name: string;
  school_level: string | null;
  grade_year: number | null;
}

interface ManualEntry {
  questionNumber: number;
  isCorrect: boolean;
}

export function ManualQuizGrading() {
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Selection
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [quizSearch, setQuizSearch] = useState('');

  // Manual entry
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [feedback, setFeedback] = useState('');
  const [showResult, setShowResult] = useState(false);

  // Student detail dialog
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const [quizRes, studentRes] = await Promise.all([
      supabase
        .from('math_concept_quizzes')
        .select('id, concept_id, answer_code, questions, created_at, math_concepts(title, course, grade, subject)')
        .in('status', ['draft', 'published'])
        .order('created_at', { ascending: false }) as any,
      supabase
        .from('students')
        .select('id, name, school_level, grade_year')
        .neq('enrollment_status', '퇴원')
        .order('name') as any,
    ]);
    if (quizRes.data) setQuizzes(quizRes.data);
    if (studentRes.data) setStudents(studentRes.data);
    setLoading(false);
  }

  const selectedQuiz = quizzes.find(q => q.id === selectedQuizId);
  const questions: any[] = useMemo(() => {
    if (!selectedQuiz?.questions) return [];
    const qs = Array.isArray(selectedQuiz.questions) ? selectedQuiz.questions : [];
    return qs.sort((a: any, b: any) => (a.question_number || 0) - (b.question_number || 0));
  }, [selectedQuiz]);

  // When quiz changes, reset entries — default all to correct
  useEffect(() => {
    if (questions.length > 0) {
      setEntries(questions.map((q: any) => ({
        questionNumber: q.question_number,
        isCorrect: true, // default: all correct
      })));
      setShowResult(false);
      setFeedback('');
    } else {
      setEntries([]);
    }
  }, [selectedQuizId, questions.length]);

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(s => s.name.toLowerCase().includes(q));
  }, [students, studentSearch]);

  const filteredQuizzes = useMemo(() => {
    if (!quizSearch.trim()) return quizzes;
    const q = quizSearch.toLowerCase();
    return quizzes.filter(quiz => {
      const title = quiz.math_concepts?.title?.toLowerCase() || '';
      const course = quiz.math_concepts?.course?.toLowerCase() || '';
      const code = quiz.answer_code?.toLowerCase() || '';
      return title.includes(q) || course.includes(q) || code.includes(q);
    });
  }, [quizzes, quizSearch]);

  function toggleCorrect(idx: number) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, isCorrect: !e.isCorrect } : e));
  }

  function markAllCorrect() {
    setEntries(prev => prev.map(e => ({ ...e, isCorrect: true })));
  }

  function markAllIncorrect() {
    setEntries(prev => prev.map(e => ({ ...e, isCorrect: false })));
  }

  const correctCount = entries.filter(e => e.isCorrect).length;
  const incorrectCount = entries.filter(e => !e.isCorrect).length;
  const totalCount = entries.length;
  const scorePercent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  async function handleSave() {
    if (!selectedQuizId || !selectedStudentId) {
      toast({ title: '퀴즈와 학생을 선택하세요', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const results = entries.map(e => {
        const question = questions.find((q: any) => q.question_number === e.questionNumber);
        return {
          question_number: e.questionNumber,
          student_answer: e.isCorrect ? (question?.answer || '정답') : '오답',
          correct_answer: question?.answer || '',
          is_correct: e.isCorrect,
          status: e.isCorrect ? 'correct' : 'incorrect',
        };
      });

      const pointsAwarded = correctCount * 2;
      const { data: user } = await supabase.auth.getUser();

      const { data: existing } = await supabase
        .from('math_quiz_submissions')
        .select('id')
        .eq('quiz_id', selectedQuizId)
        .eq('student_id', selectedStudentId)
        .order('created_at', { ascending: false })
        .limit(1) as any;

      const gradingPayload = {
        ai_grading_result: { results, total_correct: correctCount, total_graded: totalCount, overall_feedback: feedback || '수동 채점' },
        ai_total_score: correctCount,
        ai_total_questions: totalCount,
        points_awarded: pointsAwarded,
        teacher_feedback: feedback || null,
        teacher_reviewed_by: user.user?.id,
        teacher_reviewed_at: new Date().toISOString(),
        status: 'reviewed',
        updated_at: new Date().toISOString(),
      };

      if (existing && existing.length > 0) {
        await supabase.from('math_quiz_submissions').update(gradingPayload as any).eq('id', existing[0].id);
      } else {
        await supabase.from('math_quiz_submissions').insert({
          student_id: selectedStudentId,
          concept_id: selectedQuiz!.concept_id,
          quiz_id: selectedQuizId,
          image_urls: [],
          ...gradingPayload,
        } as any);
      }

      toast({ title: '채점 저장 완료', description: `${correctCount}/${totalCount} 정답 (${scorePercent}점) · +${pointsAwarded}포인트` });

      // Reset
      setEntries(questions.map((q: any) => ({ questionNumber: q.question_number, isCorrect: true })));
      setFeedback('');
      setSelectedStudentId('');
    } catch (error: any) {
      toast({ title: '저장 실패', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Step 1: Select student */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            1단계: 학생 선택
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="학생 이름 검색..."
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
            {filteredStudents.map(student => (
              <button
                key={student.id}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  selectedStudentId === student.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted/50'
                }`}
                onClick={() => setSelectedStudentId(student.id)}
              >
                {student.name}
                {student.school_level && student.grade_year && (
                  <span className="ml-1 opacity-70">{student.school_level}{student.grade_year}</span>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Select quiz */}
      {selectedStudentId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" />
              2단계: 시험지 선택
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="퀴즈 검색 (제목/과정/코드)..."
                value={quizSearch}
                onChange={e => setQuizSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              {filteredQuizzes.map(quiz => (
                <div
                  key={quiz.id}
                  className={`p-2.5 border rounded-lg cursor-pointer text-sm transition-colors ${
                    selectedQuizId === quiz.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedQuizId(quiz.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{quiz.math_concepts?.title || '제목 없음'}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {quiz.answer_code && (
                        <Badge variant="outline" className="text-[10px] font-mono">{quiz.answer_code}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(quiz.created_at).toLocaleDateString('ko-KR')}</span>
                    <span>·</span>
                    <span>{quiz.math_concepts?.course} · {quiz.math_concepts?.subject}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Grading */}
      {selectedStudentId && selectedQuiz && questions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />
                3단계: 채점
                <Badge variant="secondary" className="text-xs">{selectedQuiz.math_concepts?.title}</Badge>
                <Badge variant="outline" className="text-xs">
                  {students.find(s => s.id === selectedStudentId)?.name}
                </Badge>
              </CardTitle>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={markAllCorrect}>
                  <CheckCheck className="w-3.5 h-3.5 text-green-500" /> 일괄 정답
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={markAllIncorrect}>
                  <XOctagon className="w-3.5 h-3.5 text-destructive" /> 일괄 오답
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              기본적으로 모든 문항이 정답으로 설정됩니다. 틀린 문항만 클릭하여 오답 처리하세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Score summary */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{correctCount}<span className="text-lg text-muted-foreground">/{totalCount}</span></p>
                <p className="text-xs text-muted-foreground">맞은 문제</p>
              </div>
              <div className="h-12 w-px bg-border" />
              <div className="text-center">
                <p className="text-3xl font-bold text-destructive">{incorrectCount}</p>
                <p className="text-xs text-muted-foreground">틀린 문제</p>
              </div>
              <div className="h-12 w-px bg-border" />
              <div className="text-center">
                <p className={`text-3xl font-bold ${scorePercent >= 80 ? 'text-green-600' : scorePercent >= 50 ? 'text-yellow-600' : 'text-destructive'}`}>
                  {scorePercent}<span className="text-lg">점</span>
                </p>
                <p className="text-xs text-muted-foreground">환산 점수</p>
              </div>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${scorePercent >= 80 ? 'bg-green-500' : scorePercent >= 50 ? 'bg-yellow-500' : 'bg-destructive'}`}
                    style={{ width: `${scorePercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Question grid — click to toggle */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {entries.map((entry, idx) => {
                const question = questions.find((q: any) => q.question_number === entry.questionNumber);
                return (
                  <button
                    key={entry.questionNumber}
                    onClick={() => toggleCorrect(idx)}
                    className={`p-3 rounded-lg border-2 text-left transition-all hover:shadow-sm ${
                      entry.isCorrect
                        ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20 hover:border-green-400'
                        : 'border-destructive/40 bg-destructive/5 hover:border-destructive/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">Q{entry.questionNumber}</span>
                      {entry.isCorrect
                        ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                        : <XCircle className="w-5 h-5 text-destructive" />
                      }
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      답: {question?.answer || '-'}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Feedback */}
            <div className="space-y-1.5">
              <Label className="text-xs">선생님 코멘트 (선택)</Label>
              <Textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="학생에게 전달할 피드백..."
                rows={2}
                className="text-sm"
              />
            </div>

            {/* Save */}
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              채점 결과 저장 ({correctCount}/{totalCount} · {scorePercent}점)
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
