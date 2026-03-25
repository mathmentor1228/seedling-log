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
  Loader2, CheckCircle2, XCircle, Search, Users, Save, ClipboardCheck,
  Calendar, ChevronRight, CheckCheck, XOctagon,
} from 'lucide-react';

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

const SCHOOL_ORDER = ['초', '중', '고'];
const SCHOOL_LABELS: Record<string, string> = { '초': '초등', '중': '중등', '고': '고등' };

export function ManualQuizGrading() {
  const { toast } = useToast();
  const [allQuizzes, setAllQuizzes] = useState<Quiz[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Assignments map: studentId -> Set<quizId>
  const [assignmentMap, setAssignmentMap] = useState<Record<string, Set<string>>>({});

  // Teacher filter
  const [currentTeacherId, setCurrentTeacherId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [teacherStudentIds, setTeacherStudentIds] = useState<Set<string> | null>(null);

  // Selection
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [quizSearch, setQuizSearch] = useState('');

  // Manual entry
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [feedback, setFeedback] = useState('');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id || null;
    setCurrentTeacherId(userId);

    // Check roles
    let adminFlag = false;
    if (userId) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId) as any;
      adminFlag = (roles || []).some((r: any) => r.role === 'admin');
      setIsAdmin(adminFlag);
    }

    const [quizRes, studentRes, assignRes] = await Promise.all([
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
      supabase
        .from('math_quiz_assignments')
        .select('quiz_id, student_id') as any,
    ]);

    if (quizRes.data) setAllQuizzes(quizRes.data);
    if (studentRes.data) setStudents(studentRes.data);

    // Build assignment map
    const aMap: Record<string, Set<string>> = {};
    (assignRes.data || []).forEach((a: any) => {
      if (!aMap[a.student_id]) aMap[a.student_id] = new Set();
      aMap[a.student_id].add(a.quiz_id);
    });
    setAssignmentMap(aMap);

    // If teacher (not admin), get their students
    if (userId && !adminFlag) {
      const { data: links } = await supabase
        .from('teacher_student_links')
        .select('student_id')
        .eq('teacher_id', userId) as any;
      if (links) {
        setTeacherStudentIds(new Set(links.map((l: any) => l.student_id)));
      }
    } else {
      setTeacherStudentIds(null);
    }

    setLoading(false);
  }

  // Quizzes assigned to selected student
  const studentQuizzes = useMemo(() => {
    if (!selectedStudentId) return [];
    const assignedIds = assignmentMap[selectedStudentId];
    if (!assignedIds || assignedIds.size === 0) return [];
    return allQuizzes.filter(q => assignedIds.has(q.id));
  }, [selectedStudentId, assignmentMap, allQuizzes]);

  // Search-filtered quizzes
  const filteredQuizzes = useMemo(() => {
    if (!quizSearch.trim()) return studentQuizzes;
    const q = quizSearch.toLowerCase();
    return studentQuizzes.filter(quiz => {
      const title = quiz.math_concepts?.title?.toLowerCase() || '';
      const course = quiz.math_concepts?.course?.toLowerCase() || '';
      const code = quiz.answer_code?.toLowerCase() || '';
      return title.includes(q) || course.includes(q) || code.includes(q);
    });
  }, [studentQuizzes, quizSearch]);

  const selectedQuiz = allQuizzes.find(q => q.id === selectedQuizId);
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
        isCorrect: true,
      })));
      setFeedback('');
    } else {
      setEntries([]);
    }
  }, [selectedQuizId, questions.length]);

  // Students filtered by teacher + search, grouped by grade
  const groupedStudents = useMemo(() => {
    let filtered = students;

    // Teacher filter: only show their students
    if (teacherStudentIds && !isAdmin) {
      filtered = filtered.filter(s => teacherStudentIds.has(s.id));
    }

    // Search filter
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      filtered = filtered.filter(s => s.name.toLowerCase().includes(q));
    }

    // Group by school_level + grade_year
    const groups: Record<string, Student[]> = {};
    filtered.forEach(s => {
      const level = s.school_level || '미분류';
      const year = s.grade_year || 0;
      const key = `${level}${year || ''}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });

    // Sort groups
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const aLevel = SCHOOL_ORDER.indexOf(a[0]) >= 0 ? SCHOOL_ORDER.indexOf(a[0]) : 99;
      const bLevel = SCHOOL_ORDER.indexOf(b[0]) >= 0 ? SCHOOL_ORDER.indexOf(b[0]) : 99;
      if (aLevel !== bLevel) return aLevel - bLevel;
      return a.localeCompare(b, 'ko');
    });

    return sortedKeys.map(key => ({
      label: key === '미분류' ? '미분류' : key,
      students: groups[key].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    }));
  }, [students, teacherStudentIds, isAdmin, studentSearch]);

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

      setEntries(questions.map((q: any) => ({ questionNumber: q.question_number, isCorrect: true })));
      setFeedback('');
      setSelectedStudentId('');
      setSelectedQuizId('');
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
      {/* Step 1: Select student — grouped by grade */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            1단계: 학생 선택
            {!isAdmin && teacherStudentIds && (
              <Badge variant="outline" className="text-[10px]">내 학생만</Badge>
            )}
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
          <div className="max-h-[200px] overflow-y-auto space-y-3">
            {groupedStudents.map(group => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 sticky top-0 bg-card px-1">
                  {SCHOOL_LABELS[group.label[0]] || ''} {group.label.slice(group.label[0] === '초' || group.label[0] === '중' || group.label[0] === '고' ? 1 : 0)}
                  <span className="ml-1 text-muted-foreground/60">({group.students.length}명)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.students.map(student => {
                    const hasAssignments = !!assignmentMap[student.id] && assignmentMap[student.id].size > 0;
                    return (
                      <button
                        key={student.id}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                          selectedStudentId === student.id
                            ? 'border-primary bg-primary text-primary-foreground'
                            : hasAssignments
                              ? 'border-border hover:bg-muted/50'
                              : 'border-border/50 text-muted-foreground/50 hover:bg-muted/30'
                        }`}
                        onClick={() => {
                          setSelectedStudentId(student.id);
                          setSelectedQuizId('');
                        }}
                      >
                        {student.name}
                        {hasAssignments && (
                          <span className="ml-1 text-[10px] opacity-70">({assignmentMap[student.id].size})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {groupedStudents.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">검색 결과 없음</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Select quiz — only assigned quizzes */}
      {selectedStudentId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" />
              2단계: 배정된 시험지 선택
              <Badge variant="secondary" className="text-[10px]">
                {students.find(s => s.id === selectedStudentId)?.name}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {studentQuizzes.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                이 학생에게 배정된 퀴즈가 없습니다.
              </p>
            ) : (
              <>
                {studentQuizzes.length > 5 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="퀴즈 검색 (제목/과정/코드)..."
                      value={quizSearch}
                      onChange={e => setQuizSearch(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                )}
                <div className="max-h-[250px] overflow-y-auto space-y-1.5">
                  {filteredQuizzes.map(quiz => (
                    <div
                      key={quiz.id}
                      className={`p-3 border rounded-lg cursor-pointer text-sm transition-colors ${
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
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(quiz.created_at).toLocaleDateString('ko-KR')}</span>
                        <span>·</span>
                        <span>{quiz.math_concepts?.course} · {quiz.math_concepts?.subject}</span>
                        <span>·</span>
                        <span>{Array.isArray(quiz.questions) ? quiz.questions.length : 0}문항</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Grading — improved answer visibility */}
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
              모든 문항이 정답으로 설정됩니다. 틀린 문항만 클릭하여 오답 처리하세요.
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

            {/* Question grid — improved visibility */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {entries.map((entry, idx) => {
                const question = questions.find((q: any) => q.question_number === entry.questionNumber);
                return (
                  <button
                    key={entry.questionNumber}
                    onClick={() => toggleCorrect(idx)}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                      entry.isCorrect
                        ? 'border-green-400 bg-green-50 dark:bg-green-950/30 hover:border-green-500'
                        : 'border-destructive/50 bg-destructive/10 hover:border-destructive/70'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-base text-foreground">Q{entry.questionNumber}</span>
                      {entry.isCorrect
                        ? <CheckCircle2 className="w-6 h-6 text-green-500" />
                        : <XCircle className="w-6 h-6 text-destructive" />
                      }
                    </div>
                    <div className="bg-background/80 rounded-md px-2 py-1.5 border border-border/50">
                      <p className="text-[10px] text-muted-foreground mb-0.5">정답</p>
                      <p className="text-sm font-semibold text-foreground leading-tight break-all">
                        {question?.answer || '-'}
                      </p>
                    </div>
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
