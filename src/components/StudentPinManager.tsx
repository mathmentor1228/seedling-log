// STUDENT-PIN-MANAGER-V1: Admin component for managing student PIN and viewing student code
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Key, Copy, Check, AlertCircle, User } from 'lucide-react';

interface StudentPinManagerProps {
  studentId: string;
  studentName: string;
  studentCode: string | null;
}

interface StudentAccount {
  id: string;
  pin_hash: string;
  last_login_at: string | null;
  created_at: string;
}

export default function StudentPinManager({ studentId, studentName, studentCode }: StudentPinManagerProps) {
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAccount();
  }, [studentId]);

  async function fetchAccount() {
    try {
      const { data, error } = await supabase
        .from('student_accounts')
        .select('*')
        .eq('student_id', studentId)
        .maybeSingle();

      if (error) throw error;
      setAccount(data);
    } catch (error) {
      console.error('Error fetching student account:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleCopyCode = async () => {
    if (studentCode) {
      await navigator.clipboard.writeText(studentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: '복사됨',
        description: '학생 코드가 클립보드에 복사되었습니다.',
      });
    }
  };

  const handleSetPin = async () => {
    // Validate PIN
    if (!newPin || !/^\d{4,6}$/.test(newPin)) {
      toast({
        title: '유효하지 않은 PIN',
        description: 'PIN은 4-6자리 숫자여야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    if (newPin !== confirmPin) {
      toast({
        title: 'PIN 불일치',
        description: 'PIN과 확인 PIN이 일치하지 않습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!studentCode) {
      toast({
        title: '학생 코드 없음',
        description: '이 학생에게 학생 코드가 설정되어 있지 않습니다. 먼저 학생 정보를 수정해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('student-auth', {
        body: {
          action: 'reset_pin',
          student_id: studentId,
          pin: newPin,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: '성공',
        description: account ? 'PIN이 재설정되었습니다.' : 'PIN이 설정되었습니다.',
      });

      setNewPin('');
      setConfirmPin('');
      fetchAccount();
    } catch (error: any) {
      console.error('Error setting PIN:', error);
      toast({
        title: 'Error',
        description: error.message || 'PIN 설정에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Student Code Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            학생 코드
          </CardTitle>
          <CardDescription>
            학생이 앱에 로그인할 때 사용하는 고유 코드입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {studentCode ? (
            <div className="flex items-center gap-3">
              <code className="bg-muted px-4 py-2 rounded-md text-lg font-mono font-bold">
                {studentCode}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyCode}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-2 text-primary" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? '복사됨' : '복사'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                학생 코드가 설정되어 있지 않습니다. 학생 정보 편집에서 학생 전화번호를 입력하면 자동 생성됩니다.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Status Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" />
            학생 앱 계정
          </CardTitle>
          <CardDescription>
            학생 앱 로그인을 위한 PIN 설정을 관리합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Account Status */}
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">계정 상태:</Label>
            {account ? (
              <Badge variant="default">
                활성화됨
              </Badge>
            ) : (
              <Badge variant="secondary">
                미설정
              </Badge>
            )}
          </div>

          {account && account.last_login_at && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>마지막 로그인:</span>
              <span>{new Date(account.last_login_at).toLocaleString('ko-KR')}</span>
            </div>
          )}

          {/* PIN Setup/Reset Form */}
          <div className="border-t pt-4 mt-4">
            <h4 className="font-medium mb-3">
              {account ? 'PIN 재설정' : 'PIN 설정'}
            </h4>
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="newPin">새 PIN (4-6자리 숫자)</Label>
                <Input
                  id="newPin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="****"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPin">PIN 확인</Label>
                <Input
                  id="confirmPin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="****"
                />
              </div>
              <Button
                onClick={handleSetPin}
                disabled={isSubmitting || !newPin || !confirmPin || !studentCode}
                className="w-full sm:w-auto"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {account ? 'PIN 재설정' : 'PIN 설정'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <h4 className="font-medium mb-2">학생 앱 로그인 안내</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>학생 앱 주소: <code className="bg-background px-1 rounded">/student</code></li>
            <li>학생 코드: <strong>{studentCode || '(미설정)'}</strong></li>
            <li>설정한 PIN 번호로 로그인</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
