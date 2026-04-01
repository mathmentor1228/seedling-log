// STUDY-SESSION-V1: Student self-study/clinic/test session page
import { useState, useEffect, useCallback } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardCheck, Clock, Play, Square, CheckCircle2, Circle, BookOpen, AlertTriangle, Languages, Printer, Monitor,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SessionTask {
  id: string;
  content: string;
  is_completed: boolean;
  completed_at: string | null;
  sort_order: number;
}

interface StudySessionInfo {
  id: string;
  session_type: string;
  session_date: string;
  start_time: string;
  end_time: string;
  subject: string;
  supervisor_name: string | null;
  notes: string | null;
  status: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  tasks: SessionTask[];
}

interface VocabAssignment {
  id: string;
  status: string;
  test_mode: string; // 'web' | 'print'
  test_level: number;
  test_time_limit: number | null;
  test_direction: string;
  due_date: string | null;
  notes: string | null;
  assigned_at: string;
  word_set_ids: string[];
  word_sets: { id: string; title: string; round_number: number }[];
}

export default function StudentStudySession() {
  const { student } = useStudentAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<StudySessionInfo[]>([]);
  const [vocabAssignments, setVocabAssignments] = useState<VocabAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<Record<string, number>>({});

  const fetchSessions = useCallback(async () => {
    if (!student) return;
    setLoading(true);
    const { data, error } = await studentApi.getStudySessions();
    if (!error && data) {
      setSessions(data.sessions || []);
      setVocabAssignments(data.vocab_assignments || []);
    }
    setLoading(false);
  }, [student]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Timer for in_progress sessions
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const updates: Record<string, number> = {};
      for (const s of sessions) {
        if (s.status === 'in_progress' && s.actual_start_at) {
          updates[s.id] = Math.floor((now - new Date(s.actual_start_at).getTime()) / 1000);
        }
      }
      setElapsed(updates);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessions]);

  const handleStartStudy = async (sessionId: string) => {
    setActionLoading(sessionId);
    const { error } = await studentApi.startStudySession(sessionId);
    if (!error) {
      setSessions(prev => prev.map(s => s.id === sessionId
        ? { ...s, status: 'in_progress', actual_start_at: new Date().toISOString() }
        : s
      ));
    }
    setActionLoading(null);
  };

  const handleEndStudy = async (sessionId: string) => {
    setActionLoading(sessionId);
    const { error } = await studentApi.endStudySession(sessionId);
    if (!error) {
      setSessions(prev => prev.map(s => s.id === sessionId
        ? { ...s, status: 'completed', actual_end_at: new Date().toISOString() }
        : s
      ));
    }
    setActionLoading(null);
  };

  const handleToggleTask = async (sessionId: string, taskId: string, currentState: boolean) => {
    setActionLoading(taskId);
    const { error } = await studentApi.toggleStudyTask(sessionId, taskId, !currentState);
    if (!error) {
      setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          tasks: s.tasks.map(t => t.id === taskId
            ? { ...t, is_completed: !currentState, completed_at: !currentState ? new Date().toISOString() : null }
            : t
          ),
        };
      }));
    }
    setActionLoading(null);
  };

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const hasContent = sessions.length > 0 || vocabAssignments.length > 0;

  return (
    <div className="space-y-4 pb-20">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <ClipboardCheck className="w-6 h-6" /> 자습/테스트
      </h1>

      {/* Vocab Test Assignments */}
      {vocabAssignments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 text-primary">
            <Languages className="w-4 h-4" /> 단어 테스트 배정
          </h2>
          {vocabAssignments.map(va => (
            <Card key={va.id} className="border-primary/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {va.test_mode === 'web' ? (
                      <Badge className="gap-1 text-xs">
                        <Monitor className="w-3 h-3" /> 웹 테스트
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Printer className="w-3 h-3" /> 인쇄 테스트
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      Lv.{va.test_level}
                    </Badge>
                  </div>
                  {va.due_date && (
                    <span className="text-xs text-muted-foreground">
                      마감: {va.due_date}
                    </span>
                  )}
                </div>

                {/* Word sets */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">범위</p>
                  <div className="flex flex-wrap gap-1">
                    {va.word_sets.map(ws => (
                      <Badge key={ws.id} variant="outline" className="text-xs">
                        {ws.title}
                      </Badge>
                    ))}
                  </div>
                </div>

                {va.test_time_limit && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> 제한시간: {va.test_time_limit}초
                  </p>
                )}

                {va.notes && (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">{va.notes}</p>
                )}

                {/* Action */}
                {va.test_mode === 'web' && (
                  <Button
                    className="w-full gap-2"
                    onClick={() => navigate('/student/vocab')}
                  >
                    <Play className="w-4 h-4" /> 단어 테스트 시작하기
                  </Button>
                )}
                {va.test_mode === 'print' && (
                  <div className="text-center text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                    📄 인쇄 시험지를 선생님께 받아 응시하세요
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Study Sessions */}
      {sessions.length > 0 && sessions.map(session => {
        const completedTasks = session.tasks.filter(t => t.is_completed).length;
        const totalTasks = session.tasks.length;
        const allDone = totalTasks > 0 && completedTasks === totalTasks;
        const elapsedSecs = elapsed[session.id] || 0;
        const isInProgress = session.status === 'in_progress';
        const isCompleted = session.status === 'completed';
        const isScheduled = session.status === 'scheduled';

        return (
          <Card key={session.id} className={isInProgress ? 'ring-2 ring-primary' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={session.session_type === '테스트' ? 'destructive' : 'default'}>
                    {session.session_type}
                  </Badge>
                  <Badge variant="outline">{session.subject}</Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  {session.start_time?.slice(0, 5)} - {session.end_time?.slice(0, 5)}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {session.supervisor_name && (
                <p className="text-xs text-muted-foreground">담당: {session.supervisor_name}</p>
              )}

              {isInProgress && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">학습 경과 시간</p>
                  <p className="text-3xl font-mono font-bold text-primary">{formatElapsed(elapsedSecs)}</p>
                </div>
              )}

              {isCompleted && session.actual_start_at && session.actual_end_at && (
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">학습 기록</p>
                  <p className="text-sm font-medium">
                    {new Date(session.actual_start_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    {' ~ '}
                    {new Date(session.actual_end_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    {' '}
                    ({(() => {
                      const mins = Math.round((new Date(session.actual_end_at).getTime() - new Date(session.actual_start_at).getTime()) / 60000);
                      return `${Math.floor(mins / 60)}시간 ${mins % 60}분`;
                    })()})
                  </p>
                </div>
              )}

              {totalTasks > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" /> 오늘 할 일
                    </p>
                    <Badge variant={allDone ? 'default' : 'secondary'} className="text-[10px]">
                      {completedTasks}/{totalTasks}
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {session.tasks.sort((a, b) => a.sort_order - b.sort_order).map((task, idx) => (
                      <div
                        key={task.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          task.is_completed
                            ? 'bg-muted/50 border-muted'
                            : 'bg-card hover:bg-muted/30 border-border'
                        }`}
                        onClick={() => {
                          if (!isCompleted && (isInProgress || isScheduled)) {
                            handleToggleTask(session.id, task.id, task.is_completed);
                          }
                        }}
                      >
                        {actionLoading === task.id ? (
                          <div className="w-5 h-5 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
                        ) : task.is_completed ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                        )}
                        <span className={`text-sm flex-1 ${task.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                          {idx + 1}. {task.content}
                        </span>
                        {task.completed_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(task.completed_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {session.notes && (
                <div className="bg-muted/30 rounded-lg p-2.5 text-xs text-muted-foreground">
                  {session.notes}
                </div>
              )}

              <div className="pt-1">
                {isScheduled && (
                  <Button
                    className="w-full gap-2"
                    onClick={() => handleStartStudy(session.id)}
                    disabled={actionLoading === session.id}
                  >
                    <Play className="w-4 h-4" /> 학습 시작
                  </Button>
                )}
                {isInProgress && (
                  <Button
                    className="w-full gap-2"
                    variant="destructive"
                    onClick={() => handleEndStudy(session.id)}
                    disabled={actionLoading === session.id}
                  >
                    <Square className="w-4 h-4" /> 학습 종료
                  </Button>
                )}
                {isCompleted && (
                  <div className="text-center">
                    <Badge className="text-sm py-1 px-3">
                      <CheckCircle2 className="w-4 h-4 mr-1" /> 완료
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!hasContent && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>오늘 예정된 자습/테스트가 없습니다.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
