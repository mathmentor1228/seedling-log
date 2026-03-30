import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, GraduationCap } from 'lucide-react';
import { PageTransition } from '@/components/ui/page-transition';

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, '이름은 2자 이상이어야 합니다'),
});

function getRoleDashboard(role: string | null): string {
  switch (role) {
    case 'admin': return '/principal';
    case 'teacher': return '/teacher';
    case 'assistant': return '/assistant';
    default: return '/dashboard';
  }
}

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { signIn, signUp, user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user && role) {
      navigate(getRoleDashboard(role), { replace: true });
    }
  }, [user, role, navigate]);

  const validateForm = () => {
    try {
      if (isLogin) {
        loginSchema.parse({ email, password });
      } else {
        signupSchema.parse({ email, password, fullName });
      }
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast({
            title: '로그인 실패',
            description: error.message === 'Invalid login credentials' 
              ? '이메일 또는 비밀번호가 올바르지 않습니다' 
              : error.message,
            variant: 'destructive',
          });
        } else {
          toast({ title: '로그인 성공', description: '환영합니다!' });
        }
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              title: '이미 등록된 계정',
              description: '이 이메일은 이미 등록되어 있습니다. 로그인을 시도해주세요.',
              variant: 'destructive',
            });
          } else {
            toast({ title: '회원가입 실패', description: error.message, variant: 'destructive' });
          }
        } else {
          toast({ title: '계정이 생성되었습니다!', description: '관리자에게 역할 배정을 요청해주세요.' });
          setIsLogin(true);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dark min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, hsl(239 84% 67%) 0%, hsl(263 70% 58%) 50%, hsl(239 84% 67%) 100%)' }}
    >
      {/* Decorative blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, hsl(185 84% 42%) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-15%] right-[-10%] w-[400px] h-[400px] rounded-full opacity-15"
        style={{ background: 'radial-gradient(circle, hsl(263 70% 58%) 0%, transparent 70%)' }} />

      <PageTransition className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg border border-white/20"
            style={{ background: 'linear-gradient(135deg, hsl(239 84% 67%), hsl(263 70% 58%))' }}
          >
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">THE Mentor</h1>
          <p className="text-xs text-white/70 mt-1.5 tracking-wide">스마트 학원 관리 시스템</p>
        </div>

        <Card className="border-white/10 shadow-2xl backdrop-blur-sm"
          style={{ borderRadius: '16px', background: 'hsl(240 33% 5% / 0.85)' }}
        >
          <CardHeader className="pb-4">
            <CardTitle className="text-base text-foreground">{isLogin ? '로그인' : '회원가입'}</CardTitle>
            <CardDescription className="text-xs">
              {isLogin ? '이메일과 비밀번호를 입력하세요' : '새 계정을 생성합니다'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-xs">이름</Label>
                  <Input id="fullName" type="text" placeholder="홍길동" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={isSubmitting} className="border-white/10 bg-white/5 focus:border-primary" />
                  {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
                </div>
              )}
              
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">이메일</Label>
                <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSubmitting} className="border-white/10 bg-white/5 focus:border-primary" />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">비밀번호</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting} className="border-white/10 bg-white/5 focus:border-primary" />
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              <Button type="submit" className="w-full transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]" size="sm" disabled={isSubmitting}
                style={{ background: 'linear-gradient(135deg, hsl(239 84% 67%), hsl(263 70% 58%))', borderRadius: '10px' }}
              >
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{isLogin ? '로그인 중...' : '계정 생성 중...'}</>
                ) : (
                  isLogin ? '로그인' : '회원가입'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setErrors({}); }}
                className="text-xs text-muted-foreground hover:text-white transition-colors duration-200"
              >
                {isLogin ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-white/30 mt-6">© {new Date().getFullYear()} THE Mentor. All rights reserved.</p>
      </PageTransition>
    </div>
  );
}
