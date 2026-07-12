// STUDENT-APP-V1: Student lesson feedback page
import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface LessonFeedback {
  id: string;
  lesson_date: string;
  subject: string;
  lesson_range: string;
  understanding_score: number | null;
  next_lesson_goal: string | null;
  notes: string | null;
  learning_issues: string[] | null;
  teacher_name: string | null;
  // PLAN-LESSON-SYNC-V1: 수업 중 본 테스트 내용·결과도 학습일지에 표기
  test_title: string | null;
  test_result_text: string | null;
}

export default function StudentFeedback() {
  const { student } = useStudentAuth();
  const [feedback, setFeedback] = useState<LessonFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (student?.id) {
      fetchFeedback();
    }
  }, [student?.id]);

  async function fetchFeedback() {
    if (!student?.id) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await studentApi.getFeedback();
      
      if (error) {
        console.error('Feedback fetch error:', error);
        return;
      }

      if (data) {
        setFeedback(data.feedback);
      }
    } catch (error) {
      console.error('Fetch feedback error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getSubjectColor = (subject: string) => {
    switch (subject) {
      case '수학': return 'bg-blue-500/10 text-blue-600';
      case '영어': return 'bg-green-500/10 text-green-600';
      case '국어': return 'bg-purple-500/10 text-purple-600';
      case '과학': return 'bg-orange-500/10 text-orange-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const renderStars = (score: number | null) => {
    if (!score) return null;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={`w-4 h-4 ${
              s <= score ? 'fill-amber-400 text-amber-400' : 'text-muted'
            }`}
          />
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <BookOpen className="w-6 h-6" />
        수업 피드백
      </h1>

      {feedback.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>아직 수업 피드백이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {feedback.map((fb) => (
            <Collapsible
              key={fb.id}
              open={expandedIds.has(fb.id)}
              onOpenChange={() => toggleExpanded(fb.id)}
            >
              <Card>
                <CollapsibleTrigger className="w-full text-left">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={getSubjectColor(fb.subject)}>
                            {fb.subject}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(fb.lesson_date), 'M월 d일', { locale: ko })}
                          </span>
                        </div>
                        <p className="text-sm font-medium line-clamp-1">
                          {fb.lesson_range}
                        </p>
                        {fb.understanding_score && (
                          <div className="mt-1">
                            {renderStars(fb.understanding_score)}
                          </div>
                        )}
                      </div>
                      {expandedIds.has(fb.id) ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardContent>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 px-4 pb-4 space-y-3">
                    {fb.teacher_name && (
                      <p className="text-xs text-muted-foreground">
                        담당: {fb.teacher_name} 선생님
                      </p>
                    )}
                    
                    {fb.notes && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">수업 메모</p>
                        <p className="text-sm whitespace-pre-wrap">{fb.notes}</p>
                      </div>
                    )}
                    
                    {fb.test_title && (
                      <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <p className="text-xs text-muted-foreground mb-1">📝 테스트</p>
                        <p className="text-sm font-medium">{fb.test_title}</p>
                        {fb.test_result_text && (
                          <p className="text-sm mt-0.5">{fb.test_result_text}</p>
                        )}
                      </div>
                    )}

                    {fb.learning_issues && fb.learning_issues.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">학습 포인트</p>
                        <div className="flex flex-wrap gap-1">
                          {fb.learning_issues.map((issue, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {issue}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {fb.next_lesson_goal && (
                      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="text-xs text-muted-foreground mb-1">다음 수업 목표</p>
                        <p className="text-sm">{fb.next_lesson_goal}</p>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
