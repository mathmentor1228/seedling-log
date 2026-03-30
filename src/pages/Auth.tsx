import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sprout } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, '이름은 2자 이상이어야 합니다'),
});

/** Map role to the correct dashboard path */
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
          toast({
            title: '로그인 성공',
            description: '환영합니다!',
          });
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
            toast({
              title: '회원가입 실패',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: '계정이 생성되었습니다!',
            description: '관리자에게 역할 배정을 요청해주세요.',
          });
          setIsLogin(true);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-3">
            <Sprout className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-bold text-foreground">SeedlingLog</h1>
          <p className="text-xs text-muted-foreground mt-0.5">학원 출결 관리 시스템</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">{isLogin ? '로그인' : '회원가입'}</CardTitle>
            <CardDescription className="text-xs">
              {isLogin 
                ? '이메일과 비밀번호를 입력하세요' 
                : '새 계정을 생성합니다'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-xs">이름</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="홍길동"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={isSubmitting}
                  />
                  {errors.fullName && (
                    <p className="text-xs text-destructive">{errors.fullName}</p>
                  )}
                </div>
              )}
              
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
              </div>

              <Button type="submit" className="w-full" size="sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isLogin ? '로그인 중...' : '계정 생성 중...'}
                  </>
                ) : (
                  isLogin ? '로그인' : '회원가입'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrors({});
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isLogin 
                  ? '계정이 없으신가요? 회원가입' 
                  : '이미 계정이 있으신가요? 로그인'}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
