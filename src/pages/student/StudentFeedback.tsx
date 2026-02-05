 // STUDENT-APP-V1: Student lesson feedback page
 import { useEffect, useState } from 'react';
 import { useStudentAuth } from '@/lib/studentAuth';
 import { supabase } from '@/integrations/supabase/client';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
       // Fetch recent submitted lessons
       const thirtyDaysAgo = new Date();
       thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
       
       const { data, error } = await supabase
         .from('lesson_records')
         .select('id, lesson_date, subject, lesson_range, understanding_score, next_lesson_goal, notes, learning_issues, teacher_id')
         .eq('student_id', student.id)
         .eq('submitted', true)
         .gte('lesson_date', thirtyDaysAgo.toISOString().split('T')[0])
         .order('lesson_date', { ascending: false })
         .limit(30);
 
       if (error) throw error;
 
       // Fetch teacher names
       const teacherIds = [...new Set((data || []).map(d => d.teacher_id).filter(Boolean))];
       let teacherMap: Record<string, string> = {};
       
       if (teacherIds.length > 0) {
         const { data: profiles } = await supabase
           .from('profiles')
           .select('id, full_name')
           .in('id', teacherIds);
         
         teacherMap = (profiles || []).reduce((acc, p) => {
           acc[p.id] = p.full_name;
           return acc;
         }, {} as Record<string, string>);
       }
 
       const feedbackData: LessonFeedback[] = (data || []).map(d => ({
         id: d.id,
         lesson_date: d.lesson_date,
         subject: d.subject,
         lesson_range: d.lesson_range,
         understanding_score: d.understanding_score,
         next_lesson_goal: d.next_lesson_goal,
         notes: d.notes,
         learning_issues: d.learning_issues,
         teacher_name: d.teacher_id ? teacherMap[d.teacher_id] || null : null,
       }));
 
       setFeedback(feedbackData);
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