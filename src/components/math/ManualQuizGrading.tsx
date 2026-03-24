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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2, CheckCircle2, XCircle, Search, Users, Pencil, Save, ClipboardCheck,
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';

interface Quiz {
  id: string;
  concept_id: string;
  answer_code: string | null;
  questions: any[];
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
  studentAnswer: string;
  isCorrect: boolean | null; // null = not graded yet
}

export function ManualQuizGrading() {
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Selection
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [quizSearch, setQuizSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  // Manual entry
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [feedback, setFeedback] = useState('');
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [quizRes, studentRes] = await Promise.all([
      supabase
        .from('math_concept_quizzes')
        .select('id, concept_id, answer_code, questions, math_concepts(title, course, grade, subject)')
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

  // When quiz changes, reset entries
  useEffect(() => {
    if (questions.length > 0) {
      setEntries(questions.map((q: any) => ({
        questionNumber: q.question_number,
        studentAnswer: '',
        isCorrect: null,
      })));
      setShowResult(false);
      setFeedback('');
    } else {
      setEntries([]);
    }
  }, [selectedQuizId, questions.length]);

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

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(s => s.name.toLowerCase().includes(q));
  }, [students, studentSearch]);

  function updateEntry(idx: number, field: keyof ManualEntry, value: any) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }

  function autoGrade() {
    // Compare student answers with correct answers
    const newEntries = entries.map(entry => {
      const question = questions.find((q: any) => q.question_number === entry.questionNumber);
      if (!question || !entry.studentAnswer.trim()) return { ...entry, isCorrect: null };

      const correctAnswer = (question.answer || '').trim().toLowerCase()
        .replace(/\s+/g, '').replace(/,/g, '');
      const studentAnswer = entry.studentAnswer.trim().toLowerCase()
        .replace(/\s+/g, '').replace(/,/g, '');

      return { ...entry, isCorrect: correctAnswer === studentAnswer };
    });
    setEntries(newEntries);
    setShowResult(true);
  }

  async function handleSave() {
    if (!selectedQuizId || !selectedStudentId) {
      toast({ title: '퀴즈와 학생을 선택하세요', variant: 'destructive' });
      return;
    }
    if (entries.every(e => !e.studentAnswer.trim())) {
      toast({ title: '답안을 하나 이상 입력해주세요', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const gradedEntries = entries.filter(e => e.studentAnswer.trim());
      const totalGraded = gradedEntries.length;
      const totalCorrect = gradedEntries.filter(e => e.isCorrect === true).length;

      const results = gradedEntries.map(e => {
        const question = questions.find((q: any) => q.question_number === e.questionNumber);
        return {
          question_number: e.questionNumber,
          student_answer: e.studentAnswer,
          correct_answer: question?.answer || '',
          is_correct: e.isCorrect,
          status: e.isCorrect === true ? 'correct' : e.isCorrect === false ? 'incorrect' : 'ungraded',
        };
      });

      // Calculate points
      const pointsAwarded = totalCorrect * 2;

      const { data: user } = await supabase.auth.getUser();

      // Check for existing submission
      const { data: existing } = await supabase
        .from('math_quiz_submissions')
        .select('id')
        .eq('quiz_id', selectedQuizId)
        .eq('student_id', selectedStudentId)
        .order('created_at', { ascending: false })
        .limit(1) as any;

      if (existing && existing.length > 0) {
        // Update existing
        await supabase
          .from('math_quiz_submissions')
          .update({
            ai_grading_result: { results, total_correct: totalCorrect, total_graded: totalGraded, overall_feedback: feedback || '수동 채점' },
            ai_total_score: totalCorrect,
            ai_total_questions: totalGraded,
            points_awarded: pointsAwarded,
            teacher_feedback: feedback || null,
            teacher_reviewed_by: user.user?.id,
            teacher_reviewed_at: new Date().toISOString(),
            status: 'reviewed',
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', existing[0].id);
        toast({ title: '기존 제출물 채점 업데이트 완료' });
      } else {
        // Create new submission as manual entry
        await supabase
          .from('math_quiz_submissions')
          .insert({
            student_id: selectedStudentId,
            concept_id: selectedQuiz!.concept_id,
            quiz_id: selectedQuizId,
            image_urls: [],
            ai_grading_result: { results, total_correct: totalCorrect, total_graded: totalGraded, overall_feedback: feedback || '수동 채점' },
            ai_total_score: totalCorrect,
            ai_total_questions: totalGraded,
            points_awarded: pointsAwarded,
            teacher_feedback: feedback || null,
            teacher_reviewed_by: user.user?.id,
            teacher_reviewed_at: new Date().toISOString(),
            status: 'reviewed',
          } as any);

        // Award points
        if (pointsAwarded > 0) {
          await supabase.from('student_points').insert({
            student_id: selectedStudentId,
            points: pointsAwarded,
            reason: `퀴즈 채점 (${selectedQuiz?.math_concepts?.title || '퀴즈'}) - ${totalCorrect}/${totalGraded} 정답`,
            awarded_by: user.user?.id,
          } as any);
        }

        toast({ title: '수동 채점 저장 완료', description: `${totalCorrect}/${totalGraded} 정답 · +${pointsAwarded}포인트` });
      }

      // Reset
      setShowResult(false);
      setEntries(questions.map((q: any) => ({
        questionNumber: q.question_number,
        studentAnswer: '',
        isCorrect: null,
      })));
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

  const correctCount = entries.filter(e => e.isCorrect === true).length;
  const incorrectCount = entries.filter(e => e.isCorrect === false).length;
  const gradedCount = entries.filter(e => e.isCorrect !== null).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Quiz & Student Selection */}
        <div className="space-y-4">
          {/* Quiz Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4" />
                퀴즈 선택
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
                    className={`p-2 border rounded cursor-pointer text-sm transition-colors ${
                      selectedQuizId === quiz.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedQuizId(quiz.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{quiz.math_concepts?.title || '제목 없음'}</span>
                      {quiz.answer_code && (
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0 ml-1">{quiz.answer_code}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{quiz.math_concepts?.course} · {quiz.math_concepts?.subject}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Student Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4" />
                학생 선택
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="학생 검색..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {filteredStudents.map(student => (
                  <div
                    key={student.id}
                    className={`p-2 border rounded cursor-pointer text-sm transition-colors ${
                      selectedStudentId === student.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedStudentId(student.id)}
                  >
                    <span className="font-medium">{student.name}</span>
                    {student.school_level && student.grade_year && (
                      <span className="text-xs text-muted-foreground ml-2">{student.school_level}{student.grade_year}</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Answer Entry */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              답안 입력
              {selectedQuiz && (
                <Badge variant="secondary" className="ml-auto text-xs">{selectedQuiz.math_concepts?.title}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedQuiz ? (
              <p className="text-center text-muted-foreground py-8 text-sm">퀴즈를 먼저 선택해주세요</p>
            ) : questions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">문항이 없습니다</p>
            ) : (
              <div className="space-y-3">
                {/* Score summary */}
                {showResult && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{correctCount}/{gradedCount}</p>
                      <p className="text-xs text-muted-foreground">정답률</p>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        <span>정답 {correctCount}문항</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <XCircle className="w-3.5 h-3.5 text-destructive" />
                        <span>오답 {incorrectCount}문항</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Question entries */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {entries.map((entry, idx) => {
                    const question = questions.find((q: any) => q.question_number === entry.questionNumber);
                    return (
                      <div
                        key={entry.questionNumber}
                        className={`p-3 border rounded-lg space-y-2 ${
                          entry.isCorrect === true ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20' :
                          entry.isCorrect === false ? 'border-destructive/30 bg-destructive/5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="shrink-0 text-xs mt-0.5">Q{entry.questionNumber}</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground truncate">
                              <MathRenderer text={question?.question_text?.substring(0, 80) || ''} />
                            </p>
                          </div>
                          {entry.isCorrect !== null && (
                            entry.isCorrect 
                              ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                              : <XCircle className="w-4 h-4 text-destructive shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="학생 답안 입력"
                            value={entry.studentAnswer}
                            onChange={e => updateEntry(idx, 'studentAnswer', e.target.value)}
                            className="h-8 text-sm flex-1"
                          />
                          {showResult && entry.isCorrect === false && question && (
                            <span className="text-xs text-green-600 whitespace-nowrap">
                              정답: <MathRenderer text={question.answer} />
                            </span>
                          )}
                        </div>
                        {/* Manual override buttons */}
                        {showResult && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant={entry.isCorrect === true ? 'default' : 'ghost'}
                              className="h-6 text-xs px-2"
                              onClick={() => updateEntry(idx, 'isCorrect', true)}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />정답
                            </Button>
                            <Button
                              size="sm"
                              variant={entry.isCorrect === false ? 'destructive' : 'ghost'}
                              className="h-6 text-xs px-2"
                              onClick={() => updateEntry(idx, 'isCorrect', false)}
                            >
                              <XCircle className="w-3 h-3 mr-1" />오답
                            </Button>
                          </div>
                        )}
                      </div>
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

                {/* Actions */}
                <div className="flex gap-2">
                  {!showResult ? (
                    <Button
                      className="flex-1"
                      onClick={autoGrade}
                      disabled={entries.every(e => !e.studentAnswer.trim())}
                    >
                      <ClipboardCheck className="w-4 h-4 mr-2" />
                      자동 채점
                    </Button>
                  ) : (
                    <Button
                      className="flex-1"
                      onClick={handleSave}
                      disabled={saving || !selectedStudentId}
                    >
                      {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      채점 결과 저장 ({correctCount}/{gradedCount})
                    </Button>
                  )}
                </div>
                {!selectedStudentId && showResult && (
                  <p className="text-xs text-destructive">학생을 선택해야 저장할 수 있습니다.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
