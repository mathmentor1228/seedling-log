 // STUDENT-APP-V1: Student points history page
 import { useEffect, useState } from 'react';
 import { useStudentAuth } from '@/lib/studentAuth';
 import { supabase } from '@/integrations/supabase/client';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
 import { Star, TrendingUp, TrendingDown, Gift } from 'lucide-react';
 import { format } from 'date-fns';
 import { ko } from 'date-fns/locale';
 
 interface PointHistoryItem {
   id: string;
   points: number;
   reason: string;
   created_at: string;
 }
 
 export default function StudentPoints() {
   const { student } = useStudentAuth();
   const [totalPoints, setTotalPoints] = useState(0);
   const [history, setHistory] = useState<PointHistoryItem[]>([]);
   const [isLoading, setIsLoading] = useState(true);
 
   useEffect(() => {
     if (student?.id) {
       fetchData();
     }
   }, [student?.id]);
 
   async function fetchData() {
     if (!student?.id) return;
     
     setIsLoading(true);
     try {
       // Fetch current total points
       const { data: studentData } = await supabase
         .from('students')
         .select('total_points')
         .eq('id', student.id)
         .single();
       
       setTotalPoints(studentData?.total_points || 0);
 
       // Fetch point history
       const { data: historyData } = await supabase
         .from('student_point_history')
         .select('id, points, reason, created_at')
         .eq('student_id', student.id)
         .order('created_at', { ascending: false })
         .limit(50);
       
       setHistory(historyData || []);
     } catch (error) {
       console.error('Fetch points error:', error);
     } finally {
       setIsLoading(false);
     }
   }
 
   if (isLoading) {
     return (
       <div className="flex items-center justify-center min-h-[60vh]">
         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
       </div>
     );
   }
 
   // Calculate stats
   const earnedThisMonth = history
     .filter(h => {
       const date = new Date(h.created_at);
       const now = new Date();
       return date.getMonth() === now.getMonth() && 
              date.getFullYear() === now.getFullYear() &&
              h.points > 0;
     })
     .reduce((sum, h) => sum + h.points, 0);
 
   return (
     <div className="space-y-6 pb-20">
       <h1 className="text-xl font-bold">내 포인트</h1>
 
       {/* Total Points Card */}
       <Card className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
         <CardContent className="p-6">
           <div className="flex items-center justify-between">
             <div>
               <p className="text-white/80 text-sm">총 포인트</p>
               <p className="text-4xl font-bold">{totalPoints.toLocaleString()}</p>
             </div>
             <Star className="w-16 h-16 text-white/30" />
           </div>
         </CardContent>
       </Card>
 
       {/* Stats Cards */}
       <div className="grid grid-cols-2 gap-3">
         <Card>
           <CardContent className="p-4">
             <div className="flex items-center gap-2 text-green-600 mb-1">
               <TrendingUp className="w-4 h-4" />
               <span className="text-xs">이번 달 획득</span>
             </div>
             <p className="text-xl font-bold">+{earnedThisMonth.toLocaleString()}</p>
           </CardContent>
         </Card>
         
         <Card>
           <CardContent className="p-4">
             <div className="flex items-center gap-2 text-muted-foreground mb-1">
               <Gift className="w-4 h-4" />
               <span className="text-xs">포인트 사용</span>
             </div>
             <p className="text-sm text-muted-foreground">준비 중</p>
           </CardContent>
         </Card>
       </div>
 
       {/* History */}
       <Card>
         <CardHeader className="pb-2">
           <CardTitle className="text-base">포인트 내역</CardTitle>
         </CardHeader>
         <CardContent>
           {history.length === 0 ? (
             <p className="text-center text-muted-foreground py-8">
               포인트 내역이 없습니다.
             </p>
           ) : (
             <div className="space-y-3">
               {history.map((item) => (
                 <div 
                   key={item.id}
                   className="flex items-center justify-between py-2 border-b last:border-0"
                 >
                   <div>
                     <p className="text-sm">{item.reason}</p>
                     <p className="text-xs text-muted-foreground">
                       {format(new Date(item.created_at), 'M월 d일 HH:mm', { locale: ko })}
                     </p>
                   </div>
                   <Badge 
                     className={
                       item.points > 0 
                         ? 'bg-green-500/10 text-green-600' 
                         : 'bg-red-500/10 text-red-600'
                     }
                   >
                     {item.points > 0 ? '+' : ''}{item.points}
                   </Badge>
                 </div>
               ))}
             </div>
           )}
         </CardContent>
       </Card>
     </div>
   );
 }