import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, CheckCircle2, XCircle, HelpCircle, Eye, MessageSquare,
  Search, Users, BookOpen, BarChart3, AlertTriangle, Filter, Star,
  ChevronDown, ChevronRight, Pencil
} from 'lucide-react';
import { ManualQuizGrading } from './ManualQuizGrading';

interface Submission {
  id: string;
  student_id: string;
  concept_id: string;
  quiz_id: string;
  image_urls: string[];
  ai_grading_result: any;
  ai_total_score: number | null;
  ai_total_questions: number | null;
  status: string;
  teacher_override_result: any;
  teacher_feedback: string | null;
  teacher_reviewed_by: string | null;
  teacher_reviewed_at: string | null;
  points_awarded: number;
  submitted_at: string;
  students?: { name: string; school_level: string | null; grade_year: number | null; school: string | null };
  math_concepts?: { title: string; course: string; grade: string };
  math_concept_quizzes?: { answer_code: string | null; version_number: number };
}

const SCHOOL_LABELS: Record<string, string> = { '초': '초등', '중': '중등', '고': '고등' };

export function QuizSubmissionReview() {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSchoolLevel, setFilterSchoolLevel] = useState('all');
  const [filterCourse, setFilterCourse] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [activeTab, setActiveTab] = useState('list');

  // Wrong-answer extraction
  const [wrongDateFrom, setWrongDateFrom] = useState('');
  const [wrongDateTo, setWrongDateTo] = useState('');
  const [wrongStudentFilter, setWrongStudentFilter] = useState('');

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('math_quiz_submissions')
      .select('*, students(name, school_level, grade_year, school), math_concepts(title, course, grade), math_concept_quizzes(answer_code, version_number)')
      .order('submitted_at', { ascending: false })
      .limit(500) as any;
    if (!error && data) setSubmissions(data);
    setLoading(false);
  };

  useEffect(() => { fetchSubmissions(); }, []);

  // Derived data
  const courses = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach(s => { if (s.math_concepts?.course) set.add(s.math_concepts.course); });
    return Array.from(set).sort();
  }, [submissions]);

  const filtered = useMemo(() => {
    return submissions.filter(s => {
      if (filterSchoolLevel !== 'all' && s.students?.school_level !== filterSchoolLevel) return false;
      if (filterCourse !== 'all' && s.math_concepts?.course !== filterCourse) return false;
      if (filterStatus !== 'all' && s.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = s.students?.name?.toLowerCase() || '';
        const code = s.math_concept_quizzes?.answer_code?.toLowerCase() || '';
        const title = s.math_concepts?.title?.toLowerCase() || '';
        if (!name.includes(q) && !code.includes(q) && !title.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, filterSchoolLevel, filterCourse, filterStatus, searchQuery]);

  // Stats by student
  const studentStats = useMemo(() => {
    const map = new Map<string, {
      id: string; name: string; school_level: string; grade_year: number;
      total: number; correct: number; incorrect: number; quizCount: number;
      concepts: Set<string>;
    }>();
    submissions.forEach(s => {
      if (!s.students?.name) return;
      let entry = map.get(s.student_id);
      if (!entry) {
        entry = {
          id: s.student_id, name: s.students.name,
          school_level: s.students.school_level || '미분류',
          grade_year: s.students.grade_year || 0,
          total: 0, correct: 0, incorrect: 0, quizCount: 0,
          concepts: new Set()
        };
        map.set(s.student_id, entry);
      }
      entry.quizCount++;
      if (s.math_concepts?.title) entry.concepts.add(s.math_concepts.title);
      if (s.ai_grading_result?.results) {
        s.ai_grading_result.results.forEach((r: any) => {
          const override = s.teacher_override_result?.[r.question_number];
          const status = override || r.status;
          entry!.total++;
          if (status === 'correct') entry!.correct++;
          else if (status === 'incorrect') entry!.incorrect++;
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const lo = ['초', '중', '고', '미분류'];
      const ai = lo.indexOf(a.school_level), bi = lo.indexOf(b.school_level);
      if (ai !== bi) return ai - bi;
      if (a.grade_year !== b.grade_year) return a.grade_year - b.grade_year;
      return a.name.localeCompare(b.name);
    });
  }, [submissions]);

  // Stats by course
  const courseStats = useMemo(() => {
    const map = new Map<string, {
      course: string; grade: string; total: number; correct: number; incorrect: number;
      studentCount: Set<string>; quizCount: number;
    }>();
    submissions.forEach(s => {
      const course = s.math_concepts?.course || '미분류';
      let entry = map.get(course);
      if (!entry) {
        entry = { course, grade: s.math_concepts?.grade || '', total: 0, correct: 0, incorrect: 0, studentCount: new Set(), quizCount: 0 };
        map.set(course, entry);
      }
      entry.quizCount++;
      entry.studentCount.add(s.student_id);
      if (s.ai_grading_result?.results) {
        s.ai_grading_result.results.forEach((r: any) => {
          const override = s.teacher_override_result?.[r.question_number];
          const status = override || r.status;
          entry!.total++;
          if (status === 'correct') entry!.correct++;
          else if (status === 'incorrect') entry!.incorrect++;
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.course.localeCompare(b.course));
  }, [submissions]);

  // Wrong answers extraction
  const wrongAnswers = useMemo(() => {
    const results: {
      studentName: string; studentId: string; conceptTitle: string; course: string;
      questionNumber: number; studentAnswer: string; correctAnswer: string;
      answerCode: string; submittedAt: string;
    }[] = [];
    const from = wrongDateFrom ? new Date(wrongDateFrom) : null;
    const to = wrongDateTo ? new Date(wrongDateTo + 'T23:59:59') : null;

    submissions.forEach(s => {
      if (from && new Date(s.submitted_at) < from) return;
      if (to && new Date(s.submitted_at) > to) return;
      if (wrongStudentFilter) {
        const q = wrongStudentFilter.toLowerCase();
        if (!s.students?.name?.toLowerCase().includes(q)) return;
      }
      if (!s.ai_grading_result?.results) return;
      s.ai_grading_result.results.forEach((r: any) => {
        const override = s.teacher_override_result?.[r.question_number];
        const status = override || r.status;
        if (status === 'incorrect') {
          results.push({
            studentName: s.students?.name || '?',
            studentId: s.student_id,
            conceptTitle: s.math_concepts?.title || '?',
            course: s.math_concepts?.course || '?',
            questionNumber: r.question_number,
            studentAnswer: r.student_answer || '-',
            correctAnswer: r.correct_answer || '-',
            answerCode: s.math_concept_quizzes?.answer_code || '-',
            submittedAt: s.submitted_at,
          });
        }
      });
    });
    return results;
  }, [submissions, wrongDateFrom, wrongDateTo, wrongStudentFilter]);

  const selected = submissions.find(s => s.id === selectedId);

  const handleOverride = async (questionNumber: number, newStatus: 'correct' | 'incorrect') => {
    if (!selected) return;
    const updated = { ...(selected.teacher_override_result || {}), [questionNumber]: newStatus };
    await supabase
      .from('math_quiz_submissions')
      .update({ teacher_override_result: updated, updated_at: new Date().toISOString() } as any)
      .eq('id', selected.id);
    setSubmissions(prev => prev.map(s =>
      s.id === selected.id ? { ...s, teacher_override_result: updated } : s
    ));
    toast({ title: '재채점 반영됨' });
  };

  const handleSaveFeedback = async () => {
    if (!selected) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('math_quiz_submissions')
      .update({
        teacher_feedback: feedback,
        teacher_reviewed_by: user?.id,
        teacher_reviewed_at: new Date().toISOString(),
        status: 'reviewed',
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', selected.id);
    setSubmissions(prev => prev.map(s =>
      s.id === selected.id ? { ...s, teacher_feedback: feedback, status: 'reviewed' } : s
    ));
    setSaving(false);
    toast({ title: '피드백 저장 완료' });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'submitted': return <Badge variant="secondary">제출됨</Badge>;
      case 'graded': return <Badge className="bg-blue-500 text-white">AI 채점</Badge>;
      case 'reviewed': return <Badge className="bg-green-500 text-white">검수 완료</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'correct': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'incorrect': return <XCircle className="w-4 h-4 text-destructive" />;
      default: return <HelpCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const pctBar = (correct: number, total: number) => {
    if (total === 0) return null;
    const pct = Math.round((correct / total) * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-destructive'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium w-10 text-right">{pct}%</span>
      </div>
    );
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  // Summary numbers
  const totalSubs = submissions.length;
  const gradedCount = submissions.filter(s => s.status === 'graded' || s.status === 'reviewed').length;
  const pendingCount = submissions.filter(s => s.status === 'submitted').length;

  return (
    <div className="space-y-4">
      {/* Full-screen image viewer */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} alt="확대" className="max-w-[95vw] max-h-[95vh] object-contain" />
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">전체 제출</p>
          <p className="text-2xl font-bold">{totalSubs}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">채점 완료</p>
          <p className="text-2xl font-bold text-green-600">{gradedCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">미채점</p>
          <p className="text-2xl font-bold text-orange-500">{pendingCount}</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="list" className="text-xs"><Eye className="w-3 h-3 mr-1" />제출 목록</TabsTrigger>
          <TabsTrigger value="students" className="text-xs"><Users className="w-3 h-3 mr-1" />학생별</TabsTrigger>
          <TabsTrigger value="courses" className="text-xs"><BookOpen className="w-3 h-3 mr-1" />과정별</TabsTrigger>
          <TabsTrigger value="wrong" className="text-xs"><AlertTriangle className="w-3 h-3 mr-1" />오답 추출</TabsTrigger>
        </TabsList>

        {/* TAB 1: Submission list with detail */}
        <TabsContent value="list" className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="학생명 / 코드 / 단원 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8" />
            </div>
            <Select value={filterSchoolLevel} onValueChange={setFilterSchoolLevel}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="초">초등</SelectItem>
                <SelectItem value="중">중등</SelectItem>
                <SelectItem value="고">고등</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCourse} onValueChange={setFilterCourse}>
              <SelectTrigger className="w-32"><SelectValue placeholder="과정" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 과정</SelectItem>
                {courses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="submitted">제출됨</SelectItem>
                <SelectItem value="graded">AI 채점</SelectItem>
                <SelectItem value="reviewed">검수 완료</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">{filtered.length}건 표시</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* List */}
            <Card>
              <CardContent className="p-2 space-y-1 max-h-[600px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">결과 없음</p>
                ) : filtered.map(sub => (
                  <div
                    key={sub.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedId === sub.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                    onClick={() => { setSelectedId(sub.id); setFeedback(sub.teacher_feedback || ''); }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{sub.students?.name || '학생'}</p>
                        <p className="text-xs text-muted-foreground">
                          {sub.math_concept_quizzes?.answer_code && (
                            <span className="font-mono mr-1">{sub.math_concept_quizzes.answer_code}</span>
                          )}
                          {sub.math_concepts?.course} · {sub.math_concepts?.title}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        {statusBadge(sub.status)}
                        {sub.ai_total_score != null && (
                          <p className="text-sm font-bold">{sub.ai_total_score}/{sub.ai_total_questions}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(sub.submitted_at).toLocaleString('ko-KR')}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Detail */}
            <Card>
              <CardContent className="p-4">
                {!selected ? (
                  <p className="text-center text-muted-foreground py-12">제출물을 선택하세요</p>
                ) : (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge>{selected.students?.name}</Badge>
                      {selected.math_concept_quizzes?.answer_code && (
                        <Badge variant="outline" className="font-mono">{selected.math_concept_quizzes.answer_code}</Badge>
                      )}
                      {statusBadge(selected.status)}
                    </div>

                    {/* Images */}
                    <div>
                      <p className="text-sm font-medium mb-2">📸 답안 사진</p>
                      <div className="grid grid-cols-2 gap-2">
                        {selected.image_urls?.map((url, i) => (
                          <img key={i} src={url} alt={`풀이 ${i + 1}`}
                            className="rounded-lg border cursor-pointer hover:opacity-80"
                            onClick={() => setSelectedImage(url)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* AI results */}
                    {selected.ai_grading_result && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium">🤖 AI 채점 결과</p>
                          <Badge variant="outline"><Star className="w-3 h-3 mr-1" />+{selected.points_awarded}점</Badge>
                        </div>
                        {selected.ai_grading_result.overall_feedback && (
                          <p className="text-xs text-muted-foreground mb-2">{selected.ai_grading_result.overall_feedback}</p>
                        )}
                        <div className="space-y-1">
                          {selected.ai_grading_result.results?.map((r: any) => {
                            const override = selected.teacher_override_result?.[r.question_number];
                            const finalStatus = override || r.status;
                            return (
                              <div key={r.question_number} className="flex items-center gap-2 p-2 rounded border text-sm">
                                {statusIcon(finalStatus)}
                                <span className="font-medium w-8">Q{r.question_number}</span>
                                <span className="flex-1 truncate text-xs">{r.student_answer || '-'}</span>
                                {override && <Badge variant="outline" className="text-xs">수정됨</Badge>}
                                <div className="flex gap-1">
                                  <Button size="icon" variant={finalStatus === 'correct' ? 'default' : 'ghost'} className="h-6 w-6" onClick={() => handleOverride(r.question_number, 'correct')}>
                                    <CheckCircle2 className="w-3 h-3" />
                                  </Button>
                                  <Button size="icon" variant={finalStatus === 'incorrect' ? 'destructive' : 'ghost'} className="h-6 w-6" onClick={() => handleOverride(r.question_number, 'incorrect')}>
                                    <XCircle className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Feedback */}
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-1"><MessageSquare className="w-4 h-4" />선생님 피드백</p>
                      <Textarea value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="피드백 입력..." rows={3} />
                      <Button className="mt-2 w-full" onClick={handleSaveFeedback} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <MessageSquare className="w-4 h-4 mr-1" />}
                        피드백 저장
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: By Student */}
        <TabsContent value="students" className="space-y-3">
          <p className="text-sm text-muted-foreground">학생별 퀴즈 풀이 현황 · {studentStats.length}명</p>
          {(() => {
            const groups = new Map<string, typeof studentStats>();
            studentStats.forEach(s => {
              const key = `${SCHOOL_LABELS[s.school_level] || s.school_level} ${s.grade_year}학년`;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(s);
            });
            return Array.from(groups.entries()).map(([label, students]) => (
              <Card key={label}>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">{label} ({students.length}명)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {students.map(s => (
                      <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            퀴즈 {s.quizCount}회 · 단원 {s.concepts.size}개
                          </p>
                        </div>
                        <div className="w-32">
                          {pctBar(s.correct, s.total)}
                        </div>
                        <div className="text-right text-xs whitespace-nowrap">
                          <span className="text-green-600">{s.correct}✓</span>
                          {' / '}
                          <span className="text-destructive">{s.incorrect}✗</span>
                          {' / '}
                          <span className="text-muted-foreground">{s.total}문항</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ));
          })()}
        </TabsContent>

        {/* TAB 3: By Course */}
        <TabsContent value="courses" className="space-y-3">
          <p className="text-sm text-muted-foreground">과정/단원별 풀이 현황</p>
          <div className="space-y-2">
            {courseStats.map(c => (
              <Card key={c.course} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">{c.course}</p>
                    <p className="text-xs text-muted-foreground">{c.grade} · 학생 {c.studentCount.size}명 · 퀴즈 {c.quizCount}회</p>
                  </div>
                  <div className="text-right text-xs">
                    <span className="text-green-600 font-medium">{c.correct}✓</span>
                    {' / '}
                    <span className="text-destructive font-medium">{c.incorrect}✗</span>
                  </div>
                </div>
                {pctBar(c.correct, c.total)}
              </Card>
            ))}
            {courseStats.length === 0 && (
              <p className="text-center text-muted-foreground py-8">데이터가 없습니다.</p>
            )}
          </div>
        </TabsContent>

        {/* TAB 4: Wrong Answer Extraction */}
        <TabsContent value="wrong" className="space-y-3">
          <Card className="p-4">
            <p className="font-medium text-sm mb-3 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />오답 추출 (복습 문항)</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <Input type="date" value={wrongDateFrom} onChange={e => setWrongDateFrom(e.target.value)} className="w-40" placeholder="시작일" />
              <span className="self-center text-sm text-muted-foreground">~</span>
              <Input type="date" value={wrongDateTo} onChange={e => setWrongDateTo(e.target.value)} className="w-40" placeholder="종료일" />
              <div className="relative flex-1 min-w-[150px]">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="학생명 검색..." value={wrongStudentFilter} onChange={e => setWrongStudentFilter(e.target.value)} className="pl-8" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {wrongAnswers.length}개 오답 문항 {wrongDateFrom || wrongDateTo ? '(기간 필터 적용됨)' : '(전체 기간)'}
            </p>
          </Card>

          {wrongAnswers.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">학생</th>
                        <th className="text-left p-2 font-medium">코드</th>
                        <th className="text-left p-2 font-medium">단원</th>
                        <th className="text-center p-2 font-medium">문항</th>
                        <th className="text-left p-2 font-medium">학생 답</th>
                        <th className="text-left p-2 font-medium">정답</th>
                        <th className="text-left p-2 font-medium">제출일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {wrongAnswers.map((w, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="p-2 font-medium">{w.studentName}</td>
                          <td className="p-2 font-mono text-xs">{w.answerCode}</td>
                          <td className="p-2 text-xs">{w.course} · {w.conceptTitle}</td>
                          <td className="p-2 text-center">Q{w.questionNumber}</td>
                          <td className="p-2 text-destructive">{w.studentAnswer}</td>
                          <td className="p-2 text-green-600">{w.correctAnswer}</td>
                          <td className="p-2 text-xs text-muted-foreground">{new Date(w.submittedAt).toLocaleDateString('ko-KR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-center text-muted-foreground py-8">오답이 없거나 검색 조건에 해당하는 결과가 없습니다.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
