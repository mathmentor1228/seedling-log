 // STUDENT-APP-V1: Mobile-optimized layout for student app
 import { ReactNode, useEffect } from 'react';
 import { useNavigate, useLocation, Link } from 'react-router-dom';
 import { useStudentAuth } from '@/lib/studentAuth';
 import { 
   Home, 
   Upload, 
   Star, 
   Calendar, 
   BookOpen,
   LogOut,
   User,
   Languages
 } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
 } from '@/components/ui/dropdown-menu';
 
 interface StudentLayoutProps {
   children: ReactNode;
 }
 
 const NAV_ITEMS = [
   { path: '/student', icon: Home, label: '홈' },
   { path: '/student/homework', icon: Upload, label: '숙제' },
   { path: '/student/points', icon: Star, label: '포인트' },
   { path: '/student/schedule', icon: Calendar, label: '일정' },
   { path: '/student/feedback', icon: BookOpen, label: '피드백' },
 ];
 
 export function StudentLayout({ children }: StudentLayoutProps) {
   const { student, isLoading, logout } = useStudentAuth();
   const navigate = useNavigate();
   const location = useLocation();
 
   useEffect(() => {
     if (!isLoading && !student) {
       navigate('/student/login', { replace: true });
     }
   }, [isLoading, student, navigate]);
 
   if (isLoading) {
     return (
       <div className="min-h-screen flex items-center justify-center">
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
       {/* Header */}
       <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
         <div className="flex items-center justify-between px-4 h-14">
           <Link to="/student" className="flex items-center gap-2">
             <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
               <span className="text-primary-foreground font-bold text-sm">M</span>
             </div>
             <span className="font-semibold text-sm">더멘토 학생</span>
           </Link>
           
           <DropdownMenu>
             <DropdownMenuTrigger asChild>
               <Button variant="ghost" size="sm" className="gap-2">
                 <User className="w-4 h-4" />
                 <span className="text-sm">{student.name}</span>
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
       <main className="flex-1 px-4 py-4 overflow-auto">
         {children}
       </main>
 
       {/* Bottom Navigation */}
       <nav className="sticky bottom-0 bg-background border-t safe-area-inset-bottom">
         <div className="flex items-center justify-around h-16">
           {NAV_ITEMS.map((item) => {
             const isActive = location.pathname === item.path || 
               (item.path !== '/student' && location.pathname.startsWith(item.path));
             
             return (
               <Link
                 key={item.path}
                 to={item.path}
                 className={`flex flex-col items-center justify-center w-16 h-full transition-colors ${
                   isActive 
                     ? 'text-primary' 
                     : 'text-muted-foreground hover:text-foreground'
                 }`}
               >
                 <item.icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                 <span className="text-[10px] mt-1">{item.label}</span>
               </Link>
             );
           })}
         </div>
       </nav>
     </div>
   );
 }