 // STUDENT-APP-V1: Mobile-optimized layout for student app
 import { ReactNode, useEffect, useState } from 'react';
 import { useNavigate, useLocation, Link } from 'react-router-dom';
 import { useStudentAuth } from '@/lib/studentAuth';
 import { supabase } from '@/integrations/supabase/client';
 import { 
   Home, 
   Upload, 
   Star, 
   Calendar, 
   BookOpen,
   LogOut,
   User,
   Languages,
  Calculator,
  ClipboardCheck
 } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
 } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { BrandFooter } from '@/components/layout/BrandFooter';
import { PublicAnnouncementBar } from '@/components/layout/PublicAnnouncementBar';
 
 interface StudentLayoutProps {
   children: ReactNode;
 }
 
const NAV_ITEMS = [
  { path: '/student', icon: Home, label: '홈' },
  { path: '/student/homework', icon: Upload, label: '숙제' },
  { path: '/student/study', icon: BookOpen, label: '자습' },
  { path: '/student/vocab', icon: Languages, label: '단어' },
  { path: '/student/math-quiz', icon: Calculator, label: '수학' },
  { path: '/student/exam-review', icon: ClipboardCheck, label: '리뷰' },
  { path: '/student/points', icon: Star, label: '포인트' },
  { path: '/student/schedule', icon: Calendar, label: '일정' },
];
 
 export function StudentLayout({ children }: StudentLayoutProps) {
   const { student, isLoading, logout } = useStudentAuth();
   const navigate = useNavigate();
   const location = useLocation();
   const [newAnswerCount, setNewAnswerCount] = useState(0);
 
   useEffect(() => {
     if (!isLoading && !student) {
       navigate('/student/login', { replace: true });
     }
   }, [isLoading, student, navigate]);

   // Realtime badge: listen for new answers on student's questions
   useEffect(() => {
     if (!student?.id) return;

     const channel = supabase
       .channel('student-answer-badge')
       .on(
         'postgres_changes',
         {
           event: 'INSERT',
           schema: 'public',
           table: 'math_answers',
         },
         () => {
           setNewAnswerCount(prev => prev + 1);
         }
       )
       .subscribe();

     return () => {
       supabase.removeChannel(channel);
     };
   }, [student?.id]);

   // Clear badge when visiting schedule page
   useEffect(() => {
     if (location.pathname === '/student/schedule') {
       setNewAnswerCount(0);
     }
   }, [location.pathname]);
 
   if (isLoading) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background">
         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
       </div>
     );
   }
 
   if (!student) {
     return null;
   }
 
   const handleLogout = () => {
     logout();
     navigate('/student/login', { replace: true });
   };
 
   return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Public Announcements */}
      <PublicAnnouncementBar />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border">
         <div className="flex items-center justify-between px-4 h-14">
           <Link to="/student" className="flex items-center gap-2.5">
             <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-sm">
               <span className="text-primary-foreground font-bold text-sm">M</span>
             </div>
             <span className="font-semibold text-sm text-foreground tracking-tight">더멘토 학생</span>
           </Link>
           
           <DropdownMenu>
             <DropdownMenuTrigger asChild>
               <Button variant="ghost" size="sm" className="gap-2 text-foreground">
                 <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                   <User className="w-3.5 h-3.5 text-primary" />
                 </div>
                 <span className="text-sm font-medium">{student.name}</span>
               </Button>
             </DropdownMenuTrigger>
             <DropdownMenuContent align="end">
               <DropdownMenuItem disabled>
                 <span className="text-xs text-muted-foreground">
                   {student.student_code}
                 </span>
               </DropdownMenuItem>
               <DropdownMenuSeparator />
               <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                 <LogOut className="w-4 h-4 mr-2" />
                 로그아웃
               </DropdownMenuItem>
             </DropdownMenuContent>
           </DropdownMenu>
         </div>
       </header>
 
        {/* Main Content */}
        <main className="flex-1 px-4 py-5 overflow-auto">
          {children}
        </main>

        <BrandFooter />
 
       {/* Bottom Navigation */}
       <nav className="sticky bottom-0 bg-card/95 backdrop-blur-xl border-t border-border safe-area-inset-bottom">
         <div className="flex items-center justify-around h-16">
           {NAV_ITEMS.map((item) => {
             const isActive = location.pathname === item.path || 
               (item.path !== '/student' && location.pathname.startsWith(item.path));
             
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex flex-col items-center justify-center w-16 h-full transition-all relative",
                    isActive 
                      ? 'text-primary' 
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive && 'stroke-[2.5px]')} />
                  <span className={cn("text-[10px] mt-1 font-medium", isActive && "font-semibold")}>{item.label}</span>
                  {item.path === '/student/schedule' && newAnswerCount > 0 && (
                    <span className="absolute top-1 right-2 w-4 h-4 bg-destructive text-destructive-foreground text-[9px] rounded-full flex items-center justify-center font-bold animate-pulse">
                      {newAnswerCount > 9 ? '9+' : newAnswerCount}
                    </span>
                  )}
                </Link>
             );
           })}
         </div>
       </nav>
     </div>
   );
 }
