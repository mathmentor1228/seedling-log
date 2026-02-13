import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Clock, BookOpen, Users, BarChart3, CheckCircle2 } from 'lucide-react';

const signupSchema = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요'),
  password: z.string().min(6, '비밀번호는 최소 6자 이상이어야 합니다'),
  fullName: z.string().min(2, '이름은 최소 2자 이상이어야 합니다'),
});

const FEATURES = [
  { icon: BookOpen, label: '수업일지 작성 및 관리' },
  { icon: Users, label: '학생 관리 및 숙제 배정' },
  { icon: BarChart3, label: '학습 현황 대시보드' },
  { icon: Clock, label: '시간표 및 일정 관리' },
];

export default function TrialSignup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const navigate = useNavigate();
  const { toast } = useToast();

  const validateForm = () => {
    try {
      signupSchema.parse({ email, password, fullName });
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            full_name: fullName,
            is_trial: true,
          },
        },
      });

      if (error) {
        if (error.message.includes('already registered')) {
          toast({
            title: '이미 등록된 이메일',
            description: '해당 이메일로 이미 가입되어 있습니다. 로그인을 이용해주세요.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: '가입 실패',
            description: error.message,
            variant: 'destructive',
          });
        }
        return;
      }

      setIsComplete(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md animate-fade-in">
          <Card>
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">체험판 가입 완료!</h2>
              <p className="text-sm text-muted-foreground">
                입력하신 이메일로 인증 링크를 발송했습니다.<br />
                이메일을 확인하고 링크를 클릭하면 로그인할 수 있습니다.
              </p>
              <div className="pt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  📌 체험 기간: 가입일로부터 <strong className="text-foreground">7일</strong>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/auth')}
                  className="mt-4"
                >
                  로그인 페이지로 이동
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 bg-primary rounded flex items-center justify-center mb-3">
            <span className="text-primary-foreground font-bold text-lg">M</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">MENTOR LOG</h1>
          <p className="text-xs text-muted-foreground mt-0.5">학습·운영 관리 시스템 체험판</p>
        </div>

        {/* Feature highlights */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">7일 무료 체험</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {FEATURES.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Signup form */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">체험판 가입</CardTitle>
            <CardDescription className="text-xs">
              이메일과 비밀번호를 입력하여 7일 체험을 시작하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    가입 중...
                  </>
                ) : (
                  '체험판 시작하기'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                이미 계정이 있으신가요? 로그인
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
