// LEARNING-ANALYSIS-V1: Student learning progress analysis widget for teacher dashboard
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Loader2,
  AlertTriangle,
  BookOpen,
  Search,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UnitDwell {
  unit_key: string;
  unit_title: string;
  lesson_count: number;
  avg_score: number | null;
}

interface SubjectSummary {
  subject: string;
  course: string | null;
  total_lessons: number;
  avg_score: number | null;
  trend: 'up' | 'down' | 'stable' | null;
  score_history: { date: string; score: number }[];
  unit_dwell: UnitDwell[];
  recent_topics: { date: string; range: string }[];
  last_lesson_date: string;
}

interface StudentSummary {
  student_id: string;
  student_name: string;
  grade: string;
  subjects: SubjectSummary[];
}

const subjectColors: Record<string, string> = {
  '수학': 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  '영어': 'bg-green-500/10 text-green-600 border-green-500/30',
  '국어': 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  '과학': 'bg-orange-500/10 text-orange-600 border-orange-500/30',
};

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' | null }) {
  if (trend === 'up') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
  if (trend === 'stable') return <Minus className="w-4 h-4 text-muted-foreground" />;
  return null;
}

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground">-</span>;
  const pct = (score / 5) * 100;
  const color = score >= 4 ? 'bg-emerald-500' : score >= 3 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-medium">{score}</span>
    </div>
  );
}

function MiniScoreChart({ history }: { history: { date: string; score: number }[] }) {
  if (history.length < 2) return null;
  const max = 5;
  const h = 32;
  const w = Math.min(history.length * 16, 160);
  const stepX = w / (history.length - 1);

  const points = history.map((p, i) => `${i * stepX},${h - (p.score / max) * h}`).join(' ');

  return (
    <svg width={w} height={h} className="mt-1">
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {history.map((p, i) => (
        <circle
          key={i}
          cx={i * stepX}
          cy={h - (p.score / max) * h}
          r="2"
          fill="hsl(var(--primary))"
        />
      ))}
    </svg>
  );
}

export default function StudentProgressWidget() {
  const { toast } = useToast();
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [aiComments, setAiComments] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('student-progress-analysis', {
        body: { action: 'teacher_overview' },
      });

      if (fnError) throw fnError;
      setStudents(data?.students || []);
    } catch (e) {
      console.error('Progress fetch error:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleStudent = (id: string) => {
    setExpandedStudents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const requestAiComment = async (studentId: string) => {
    setAiLoading(prev => ({ ...prev, [studentId]: true }));
    try {
      const { data, error: fnError } = await supabase.functions.invoke('student-progress-analysis', {
        body: { action: 'ai_comment', student_id: studentId },
      });
      if (fnError) throw fnError;
      setAiComments(prev => ({ ...prev, [studentId]: data?.comment || '분석 결과 없음' }));
    } catch (e: any) {
      console.error('AI comment error:', e);
      toast({ title: 'AI 분석 실패', description: e?.message || '잠시 후 다시 시도해주세요.', variant: 'destructive' });
    } finally {
      setAiLoading(prev => ({ ...prev, [studentId]: false }));
    }
  };

  const filtered = students.filter(s =>
    !search || s.student_name.includes(search) || s.grade.includes(search)
  );

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">학습 분석 데이터를 불러올 수 없습니다</p>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> 다시 시도
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <BookOpen className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">최근 60일간 수업 기록이 없습니다</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            학생별 학습 분석
            <Badge variant="secondary" className="text-[10px]">{students.length}명</Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchData} className="h-7 w-7 p-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        {students.length > 5 && (
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="학생 이름 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5 max-h-[600px] overflow-y-auto">
        {filtered.map(student => {
          const isExpanded = expandedStudents.has(student.student_id);
          // Determine if any subject needs attention (low score or downward trend)
          const hasWarning = student.subjects.some(s =>
            s.trend === 'down' || (s.avg_score != null && s.avg_score < 3)
          );

          return (
            <Collapsible
              key={student.student_id}
              open={isExpanded}
              onOpenChange={() => toggleStudent(student.student_id)}
            >
              <CollapsibleTrigger className="w-full">
                <div className={`flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors text-left ${hasWarning ? 'bg-red-500/5' : 'bg-muted/30'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                    <span className="font-medium text-sm truncate">{student.student_name}</span>
                    {student.grade && (
                      <Badge variant="outline" className="text-[10px] shrink-0">{student.grade}</Badge>
                    )}
                    {hasWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {student.subjects.map(s => (
                      <div key={s.subject} className="flex items-center gap-1">
                        <Badge className={`text-[10px] ${subjectColors[s.subject] || 'bg-muted text-muted-foreground'}`}>
                          {s.subject}
                        </Badge>
                        <TrendIcon trend={s.trend} />
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="pl-6 pr-2 py-2 space-y-3">
                  {student.subjects.map(subj => (
                    <div key={subj.subject} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={subjectColors[subj.subject] || 'bg-muted'}>{subj.subject}</Badge>
                          {subj.course && <span className="text-xs text-muted-foreground">{subj.course}</span>}
                          <span className="text-xs text-muted-foreground">({subj.total_lessons}회)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ScoreBar score={subj.avg_score} />
                          <TrendIcon trend={subj.trend} />
                        </div>
                      </div>

                      {/* Score trend mini chart */}
                      {subj.score_history.length >= 2 && (
                        <MiniScoreChart history={subj.score_history} />
                      )}

                      {/* Unit dwell for math */}
                      {subj.unit_dwell.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-muted-foreground">단원별 수업 횟수</p>
                          {subj.unit_dwell.map(u => (
                            <div key={u.unit_key} className="flex items-center justify-between text-xs">
                              <span className="truncate max-w-[180px]">
                                {u.lesson_count >= 4 && <AlertTriangle className="w-3 h-3 inline text-amber-500 mr-1" />}
                                {u.unit_title}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className={`font-mono ${u.lesson_count >= 4 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}`}>
                                  {u.lesson_count}회
                                </span>
                                <ScoreBar score={u.avg_score} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Recent topics for non-math */}
                      {subj.recent_topics.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-muted-foreground">최근 수업 범위</p>
                          {subj.recent_topics.map((t, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground font-mono">{t.date.slice(5)}</span>
                              <span className="truncate">{t.range}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* AI Analysis button */}
                  <div className="pt-1">
                    {aiComments[student.student_id] ? (
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-sm whitespace-pre-wrap">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-semibold text-primary">AI 학습 분석</span>
                        </div>
                        {aiComments[student.student_id]}
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestAiComment(student.student_id);
                        }}
                        disabled={aiLoading[student.student_id]}
                      >
                        {aiLoading[student.student_id] ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> AI 분석 중...</>
                        ) : (
                          <><Sparkles className="w-3.5 h-3.5" /> AI 학습 분석 요청</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}
