 // STUDENT-APP-V1: Student main dashboard
 import { useEffect, useState } from 'react';
 import { useStudentAuth } from '@/lib/studentAuth';
 import { supabase } from '@/integrations/supabase/client';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { 
   BookOpen, 
   Star, 
   Calendar, 
   ClipboardCheck,
   ChevronRight,
   Upload,
   Clock
 } from 'lucide-react';
 import { Link } from 'react-router-dom';
 import { format } from 'date-fns';
 import { ko } from 'date-fns/locale';
 
 interface HomeworkItem {
   id: string;
   content: string;
   subject: string;
   assigned_date: string;
   check_status: string;
 }
 
 interface UpcomingClass {
   class_name: string;
   subject: string;
   day_of_week: number;
   start_time: string;
   end_time: string;
 }
 
 export default function StudentDashboard() {
   const { student } = useStudentAuth();
   const [totalPoints, setTotalPoints] = useState(0);
   const [pendingHomework, setPendingHomework] = useState<HomeworkItem[]>([]);
   const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
   const [isLoading, setIsLoading] = useState(true);
 
   useEffect(() => {
     if (student?.id) {
       fetchDashboardData();
     }
   }, [student?.id]);
 
   async function fetchDashboardData() {
     if (!student?.id) return;
     
     setIsLoading(true);
     try {
       // Fetch student points
       const { data: studentData } = await supabase
         .from('students')
         .select('total_points')
         .eq('id', student.id)
         .single();
       
       setTotalPoints(studentData?.total_points || 0);
 
       // Fetch pending homework (last 14 days, unchecked)
       const twoWeeksAgo = new Date();
       twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
       
       const { data: homeworkData } = await supabase
         .from('homework_assignments')
         .select('id, content, subject, assigned_date, check_status')
         .eq('student_id', student.id)
         .gte('assigned_date', twoWeeksAgo.toISOString().split('T')[0])
         .eq('check_status', 'unchecked')
         .order('assigned_date', { ascending: false })
         .limit(5);
       
       setPendingHomework(homeworkData || []);
 
       // Fetch upcoming classes
       const today = new Date();
       const dow = today.getDay();
       
       const { data: classData } = await supabase
         .from('class_students')
         .select(`
           class_id,
           classes!inner (
             name,
             subject,
             class_schedules!inner (
               day_of_week,
               start_time,
               end_time,
               is_active
             )
           )
         `)
         .eq('student_id', student.id);
 
       // Process class schedule data
       const classes: UpcomingClass[] = [];
       if (classData) {
         for (const cs of classData) {
           const classInfo = cs.classes as any;
           if (classInfo?.class_schedules) {
             for (const schedule of classInfo.class_schedules) {
               if (schedule.is_active) {
                 classes.push({
                   class_name: classInfo.name,
                   subject: classInfo.subject,
                   day_of_week: schedule.day_of_week,
                   start_time: schedule.start_time,
                   end_time: schedule.end_time,
                 });
               }
             }
           }
         }
       }
       
       // Sort by day of week relative to today
       classes.sort((a, b) => {
         const aDays = (a.day_of_week - dow + 7) % 7;
         const bDays = (b.day_of_week - dow + 7) % 7;
         return aDays - bDays;
       });
       
       setUpcomingClasses(classes.slice(0, 3));
       
     } catch (error) {
       console.error('Dashboard data fetch error:', error);
     } finally {
       setIsLoading(false);
     }
   }
 
   const getDayName = (dow: number) => {
     const days = ['일', '월', '화', '수', '목', '금', '토'];
     return days[dow];
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
 
   if (isLoading) {
     return (
       <div className="flex items-center justify-center min-h-[60vh]">
         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
       </div>
     );
   }
 
   return (
     <div className="space-y-6 pb-20">
       {/* Header */}
       <div className="text-center pt-2">
         <h1 className="text-xl font-bold">
           안녕하세요, {student?.name}님! 👋
         </h1>
         <p className="text-sm text-muted-foreground mt-1">
           {format(new Date(), 'M월 d일 EEEE', { locale: ko })}
         </p>
       </div>
 
       {/* Points Card */}
       <Card className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
         <CardContent className="p-4">
           <div className="flex items-center justify-between">
             <div>
               <p className="text-white/80 text-sm">내 포인트</p>
               <p className="text-3xl font-bold">{totalPoints.toLocaleString()}</p>
             </div>
             <Star className="w-12 h-12 text-white/30" />
           </div>
           <Link to="/student/points">
             <Button 
               variant="secondary" 
               size="sm" 
               className="mt-3 bg-white/20 hover:bg-white/30 text-white border-0"
             >
               포인트 내역 보기
               <ChevronRight className="w-4 h-4 ml-1" />
             </Button>
           </Link>
         </CardContent>
       </Card>
 
       {/* Quick Actions */}
       <div className="grid grid-cols-2 gap-3">
         <Link to="/student/homework">
           <Card className="hover:bg-accent transition-colors cursor-pointer">
             <CardContent className="p-4 flex flex-col items-center text-center">
               <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                 <Upload className="w-6 h-6 text-primary" />
               </div>
               <p className="font-medium text-sm">숙제 제출</p>
               {pendingHomework.length > 0 && (
                 <Badge variant="destructive" className="mt-1">
                   {pendingHomework.length}개 대기
                 </Badge>
               )}
             </CardContent>
           </Card>
         </Link>
         
         <Link to="/student/schedule">
           <Card className="hover:bg-accent transition-colors cursor-pointer">
             <CardContent className="p-4 flex flex-col items-center text-center">
               <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-2">
                 <Calendar className="w-6 h-6 text-secondary-foreground" />
               </div>
               <p className="font-medium text-sm">수업 일정</p>
             </CardContent>
           </Card>
         </Link>
       </div>
 
       {/* Pending Homework */}
       {pendingHomework.length > 0 && (
         <Card>
           <CardHeader className="pb-2">
             <CardTitle className="text-base flex items-center gap-2">
               <ClipboardCheck className="w-5 h-5" />
               제출할 숙제
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-2">
             {pendingHomework.map((hw) => (
               <Link 
                 key={hw.id} 
                 to={`/student/homework/${hw.id}`}
                 className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
               >
                 <div className="flex items-center gap-3">
                   <Badge className={getSubjectColor(hw.subject)}>
                     {hw.subject}
                   </Badge>
                   <span className="text-sm line-clamp-1">{hw.content}</span>
                 </div>
                 <ChevronRight className="w-4 h-4 text-muted-foreground" />
               </Link>
             ))}
             
             {pendingHomework.length >= 5 && (
               <Link to="/student/homework">
                 <Button variant="ghost" className="w-full mt-2" size="sm">
                   전체 보기
                 </Button>
               </Link>
             )}
           </CardContent>
         </Card>
       )}
 
       {/* Upcoming Classes */}
       {upcomingClasses.length > 0 && (
         <Card>
           <CardHeader className="pb-2">
             <CardTitle className="text-base flex items-center gap-2">
               <Clock className="w-5 h-5" />
               다가오는 수업
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-2">
             {upcomingClasses.map((cls, idx) => (
               <div 
                 key={idx}
                 className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
               >
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                     <span className="text-sm font-bold text-primary">
                       {getDayName(cls.day_of_week)}
                     </span>
                   </div>
                   <div>
                     <p className="text-sm font-medium">{cls.class_name}</p>
                     <p className="text-xs text-muted-foreground">
                       {cls.start_time?.slice(0, 5)} - {cls.end_time?.slice(0, 5)}
                     </p>
                   </div>
                 </div>
                 <Badge className={getSubjectColor(cls.subject)}>
                   {cls.subject}
                 </Badge>
               </div>
             ))}
           </CardContent>
         </Card>
       )}
 
       {/* Recent Feedback Link */}
       <Link to="/student/feedback">
         <Card className="hover:bg-accent transition-colors cursor-pointer">
           <CardContent className="p-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <BookOpen className="w-5 h-5 text-muted-foreground" />
               <span className="font-medium">수업 피드백 보기</span>
             </div>
             <ChevronRight className="w-5 h-5 text-muted-foreground" />
           </CardContent>
         </Card>
       </Link>
     </div>
   );
 }