 // STUDENT-APP-V1: Student login page
 import { useState } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { useStudentAuth } from '@/lib/studentAuth';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { useToast } from '@/hooks/use-toast';
 import { Loader2, GraduationCap } from 'lucide-react';
 
 export default function StudentLogin() {
   const [studentCode, setStudentCode] = useState('');
   const [pin, setPin] = useState('');
   const [isSubmitting, setIsSubmitting] = useState(false);
   
   const { login } = useStudentAuth();
   const navigate = useNavigate();
   const { toast } = useToast();

   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     
     if (!studentCode.trim() || !pin.trim()) {
       toast({
         title: '입력 오류',
         description: '학생 코드와 PIN을 모두 입력해주세요.',
         variant: 'destructive',
       });
       return;
     }

     setIsSubmitting(true);

     try {
       const result = await login(studentCode.trim(), pin.trim());
       
       if (result.error) {
         toast({
           title: '로그인 실패',
           description: result.error,
           variant: 'destructive',
         });
       } else {
         toast({
           title: '로그인 성공',
           description: '환영합니다!',
         });
         navigate('/student', { replace: true });
       }
     } finally {
       setIsSubmitting(false);
     }
   };

   return (
     <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background px-4">
       <div className="w-full max-w-sm animate-fade-in">
         <div className="flex flex-col items-center mb-8">
           <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4 shadow-elevated">
             <GraduationCap className="w-8 h-8 text-primary-foreground" />
           </div>
           <h1 className="text-xl font-extrabold text-foreground tracking-tight">더멘토 학생</h1>
           <p className="text-sm text-muted-foreground mt-1">숙제 제출 & 학습 현황</p>
         </div>

         <Card className="shadow-elevated border-0">
           <CardHeader className="pb-4 text-center">
             <CardTitle className="text-lg">로그인</CardTitle>
             <CardDescription>
               학생 코드와 PIN을 입력하세요
             </CardDescription>
           </CardHeader>
           <CardContent>
             <form onSubmit={handleSubmit} className="space-y-4">
               <div className="space-y-2">
                 <Label htmlFor="studentCode">학생 코드</Label>
                 <Input
                   id="studentCode"
                   type="text"
                   placeholder="예: STU-ABC123"
                   value={studentCode}
                   onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                   disabled={isSubmitting}
                   className="text-center text-lg tracking-wider h-12"
                   autoComplete="username"
                 />
               </div>

               <div className="space-y-2">
                 <Label htmlFor="pin">PIN</Label>
                 <Input
                   id="pin"
                   type="password"
                   inputMode="numeric"
                   pattern="[0-9]*"
                   maxLength={6}
                   placeholder="••••"
                   value={pin}
                   onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                   disabled={isSubmitting}
                   className="text-center text-2xl tracking-[0.5em] h-12"
                   autoComplete="current-password"
                 />
               </div>

               <Button 
                 type="submit" 
                 className="w-full h-12 text-base font-semibold" 
                 disabled={isSubmitting}
               >
                 {isSubmitting ? (
                   <>
                     <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                     로그인 중...
                   </>
                 ) : (
                   '로그인'
                 )}
               </Button>
             </form>

             <p className="mt-6 text-center text-xs text-muted-foreground">
               PIN을 모르시나요? 선생님께 문의하세요.
             </p>
           </CardContent>
         </Card>
       </div>
     </div>
   );
 }
