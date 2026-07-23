import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getDefaultDashboardPath, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, GraduationCap } from 'lucide-react';
import { PageTransition } from '@/components/ui/page-transition';

// AUTH-INVITE-ONLY-V1: 공개 회원가입 제거 — 계정은 관리자가 사용자 관리에서 생성해 전달한다.
const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
});

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn, user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user && role) {
      navigate(getDefaultDashboardPath(role), { replace: true });
    }
  }, [user, role, navigate]);

  const validateForm = () => {
    try {
      loginSchema.parse({ email, password });
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
            <CardTitle className="text-base text-foreground">로그인</CardTitle>
            <CardDescription className="text-xs">
              이메일과 비밀번호를 입력하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />로그인 중...</>
                ) : (
                  '로그인'
                )}
              </Button>
            </form>

            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              계정은 관리자가 발급합니다. 필요하시면 학원에 문의해주세요.
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-white/30 mt-6">© {new Date().getFullYear()} THE Mentor. All rights reserved.</p>
      </PageTransition>
    </div>
  );
}
