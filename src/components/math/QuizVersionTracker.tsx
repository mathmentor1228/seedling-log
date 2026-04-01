import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  History, User, FileText, Loader2, Search, BarChart3, ChevronRight, Pencil, Check, X,
} from 'lucide-react';

interface QuizVersion {
  id: string;
  concept_id: string;
  version_number: number;
  version_label: string | null;
  answer_code: string | null;
  title: string | null;
  status: string;
  created_at: string;
  questions: any[];
  math_concepts: { title: string; course: string; grade: string; subject: string } | null;
}

interface Assignment {
  id: string;
  quiz_id: string;
  student_id: string;
  assigned_at: string;
}

interface Submission {
  id: string;
  quiz_id: string;
  student_id: string;
  ai_total_score: number | null;
  ai_total_questions: number | null;
  status: string;
  submitted_at: string;
}

interface Student {
  id: string;
  name: string;
  grade: string | null;
}

export function QuizVersionTracker() {
  const { toast } = useToast();
  const [versions, setVersions] = useState<QuizVersion[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const [versionsRes, assignRes, subRes, studentsRes] = await Promise.all([
      supabase
        .from('math_concept_quizzes')
        .select('id, concept_id, version_number, version_label, answer_code, title, status, created_at, questions, math_concepts(title, course, grade, subject)')
        .order('created_at', { ascending: false }) as any,
      supabase.from('math_quiz_assignments').select('id, quiz_id, student_id, assigned_at') as any,
      supabase.from('math_quiz_submissions').select('id, quiz_id, student_id, ai_total_score, ai_total_questions, status, submitted_at') as any,
      supabase.from('students').select('id, name, grade').in('enrollment_status', ['재원', '재원예정']) as any,
    ]);

    if (versionsRes.data) setVersions(versionsRes.data);
    if (assignRes.data) setAssignments(assignRes.data);
    if (subRes.data) setSubmissions(subRes.data);
    if (studentsRes.data) setStudents(studentsRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const studentMap = useMemo(() => {
    const m: Record<string, Student> = {};
    students.forEach(s => { m[s.id] = s; });
    return m;
  }, [students]);

  // ===== Version view =====
  const selectedVersion = versions.find(v => v.id === selectedVersionId);
  const versionAssignments = useMemo(
    () => assignments.filter(a => a.quiz_id === selectedVersionId),
    [assignments, selectedVersionId],
  );
  const versionSubmissions = useMemo(
    () => submissions.filter(s => s.quiz_id === selectedVersionId),
    [submissions, selectedVersionId],
  );
  const versionAvgScore = useMemo(() => {
    const scored = versionSubmissions.filter(s => s.ai_total_score != null && s.ai_total_questions);
    if (scored.length === 0) return null;
    const avg = scored.reduce((sum, s) => sum + ((s.ai_total_score! / s.ai_total_questions!) * 100), 0) / scored.length;
    return Math.round(avg);
  }, [versionSubmissions]);

  // ===== Student view =====
  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const studentAssignments = useMemo(
    () => assignments.filter(a => a.student_id === selectedStudentId),
    [assignments, selectedStudentId],
  );
  const studentSubmissions = useMemo(
    () => submissions.filter(s => s.student_id === selectedStudentId),
    [submissions, selectedStudentId],
  );

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(s => s.name.toLowerCase().includes(q));
  }, [students, searchQuery]);

  const filteredVersions = useMemo(() => {
    if (!searchQuery.trim()) return versions;
    const q = searchQuery.trim().toLowerCase();
    return versions.filter(v =>
      (v.version_label || '').toLowerCase().includes(q) ||
      (v.title || '').toLowerCase().includes(q) ||
      (v.math_concepts?.title || '').toLowerCase().includes(q) ||
      (v.answer_code || '').toLowerCase().includes(q),
    );
  }, [versions, searchQuery]);

  const handleSaveTitle = async (quizId: string) => {
    const { error } = await supabase
      .from('math_concept_quizzes')
      .update({ title: editTitleValue.trim() || null } as any)
      .eq('id', quizId);
    if (error) {
      toast({ title: '제목 저장 실패', variant: 'destructive' });
    } else {
      setVersions(prev => prev.map(v => v.id === quizId ? { ...v, title: editTitleValue.trim() || null } : v));
      toast({ title: '제목이 수정되었습니다' });
    }
    setEditingTitleId(null);
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          퀴즈 추적 대시보드
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="by-version">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="by-version">버전별 보기</TabsTrigger>
            <TabsTrigger value="by-student">학생별 보기</TabsTrigger>
          </TabsList>

          {/* ====== By Version ====== */}
          <TabsContent value="by-version" className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="버전, 단원명 또는 코드(MT-...) 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Version list */}
              <div className="md:col-span-1 space-y-2 max-h-[500px] overflow-y-auto">
                {filteredVersions.map(v => {
                  const assignCount = assignments.filter(a => a.quiz_id === v.id).length;
                  const subCount = submissions.filter(s => s.quiz_id === v.id).length;
                  return (
                    <div
                      key={v.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors text-sm ${
                        selectedVersionId === v.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => { setSelectedVersionId(v.id); setSelectedStudentId(null); }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant="secondary" className="text-[10px]">V{v.version_number}</Badge>
                        <Badge variant="outline" className="text-[10px]">{v.math_concepts?.subject || '기타'}</Badge>
                        {v.answer_code && <Badge variant="outline" className="text-[10px] font-mono">{v.answer_code}</Badge>}
                      </div>
                      <p className="font-medium truncate">{v.title || v.math_concepts?.title || '퀴즈'}</p>
                      <p className="text-xs text-muted-foreground truncate">{v.version_label || ''}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{assignCount}명 배포</span>
                        <span className="text-xs text-muted-foreground">{subCount}명 제출</span>
                      </div>
                    </div>
                  );
                })}
                {filteredVersions.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-6">퀴즈 버전이 없습니다.</p>
                )}
              </div>

              {/* Version detail */}
              <div className="md:col-span-2">
                {selectedVersion ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <h3 className="font-semibold">{selectedVersion.math_concepts?.title}</h3>
                      <p className="text-sm text-muted-foreground">{selectedVersion.version_label}</p>
                      <div className="flex gap-3 mt-2 text-sm">
                        <span>{(selectedVersion.questions as any[])?.length || 0}문항</span>
                        <span>{versionAssignments.length}명 배포</span>
                        <span>{versionSubmissions.length}명 제출</span>
                        {versionAvgScore != null && (
                          <Badge variant="secondary">평균 정답률 {versionAvgScore}%</Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">배포 학생 명단</p>
                      {versionAssignments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">아직 배포된 학생이 없습니다.</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-3 py-2">학생</th>
                                <th className="text-left px-3 py-2">배포일</th>
                                <th className="text-left px-3 py-2">제출</th>
                                <th className="text-left px-3 py-2">점수</th>
                              </tr>
                            </thead>
                            <tbody>
                              {versionAssignments.map(a => {
                                const st = studentMap[a.student_id];
                                const sub = versionSubmissions.find(s => s.student_id === a.student_id);
                                const pct = sub?.ai_total_score != null && sub?.ai_total_questions
                                  ? Math.round((sub.ai_total_score / sub.ai_total_questions) * 100) : null;
                                return (
                                  <tr key={a.id} className="border-t">
                                    <td className="px-3 py-2">{st?.name || '알 수 없음'}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{new Date(a.assigned_at).toLocaleDateString('ko-KR')}</td>
                                    <td className="px-3 py-2">
                                      {sub ? (
                                        <Badge variant="secondary" className="text-xs">{sub.status === 'graded' ? '채점완료' : '제출'}</Badge>
                                      ) : (
                                        <span className="text-muted-foreground">미제출</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">{pct != null ? `${pct}%` : '-'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                    <FileText className="w-5 h-5 mr-2" />
                    왼쪽에서 퀴즈 버전을 선택하세요
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ====== By Student ====== */}
          <TabsContent value="by-student" className="space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="학생 이름 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Student list */}
              <div className="md:col-span-1 space-y-1 max-h-[500px] overflow-y-auto">
                {filteredStudents.map(s => {
                  const cnt = assignments.filter(a => a.student_id === s.id).length;
                  if (cnt === 0) return null;
                  return (
                    <div
                      key={s.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors text-sm ${
                        selectedStudentId === s.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => { setSelectedStudentId(s.id); setSelectedVersionId(null); }}
                    >
                      <p className="font-medium">{s.name}</p>
                      <span className="text-xs text-muted-foreground">{s.grade || ''} · {cnt}개 퀴즈 배포</span>
                    </div>
                  );
                })}
              </div>

              {/* Student detail */}
              <div className="md:col-span-2">
                {selectedStudent ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <h3 className="font-semibold flex items-center gap-2">
                        <User className="w-4 h-4" />
                        {selectedStudent.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{selectedStudent.grade} · 총 {studentAssignments.length}개 퀴즈 배포</p>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2">퀴즈</th>
                            <th className="text-left px-3 py-2">버전</th>
                            <th className="text-left px-3 py-2">배포일</th>
                            <th className="text-left px-3 py-2">상태</th>
                            <th className="text-left px-3 py-2">점수</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentAssignments.map(a => {
                            const ver = versions.find(v => v.id === a.quiz_id);
                            const sub = studentSubmissions.find(s => s.quiz_id === a.quiz_id);
                            const pct = sub?.ai_total_score != null && sub?.ai_total_questions
                              ? Math.round((sub.ai_total_score / sub.ai_total_questions) * 100) : null;
                            return (
                              <tr key={a.id} className="border-t">
                                <td className="px-3 py-2">{ver?.math_concepts?.title || '퀴즈'}</td>
                                <td className="px-3 py-2">
                                  <Badge variant="secondary" className="text-xs">V{ver?.version_number || '?'}</Badge>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{new Date(a.assigned_at).toLocaleDateString('ko-KR')}</td>
                                <td className="px-3 py-2">
                                  {sub ? (
                                    <Badge variant="secondary" className="text-xs">{sub.status === 'graded' ? '채점완료' : '제출'}</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">미제출</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">{pct != null ? `${pct}%` : '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                    <User className="w-5 h-5 mr-2" />
                    왼쪽에서 학생을 선택하세요
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
