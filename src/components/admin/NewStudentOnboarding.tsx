import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Copy, ChevronDown, UserPlus, CheckCircle2, Sparkles } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface NewStudent {
  id: string;
  name: string;
  parent_name: string | null;
  parent_phone: string | null;
  parent_token: string | null;
  created_at: string;
  grade: string | null;
}

interface OnboardingCheck {
  student_id: string;
  check_key: string;
  checked: boolean;
}

const CHECKLIST_ITEMS = [
  { key: 'registration_msg', label: '입회/등록안내문자', icon: '📋' },
  { key: 'channel_guide_msg', label: '원내 채널안내문자', icon: '💬' },
  { key: 'channel_confirm', label: '원내 채널등록확인', icon: '✅' },
  { key: 'webapp_guide_msg', label: '학생관리 웹페이지 안내문자', icon: '🌐' },
];

function buildRegistrationMsg(student: NewStudent): string {
  const name = student.name || '***';
  return `[더,멘토 등록안내]
안녕하세요. 더멘토입니다.
${name}은 *월 *일 (*)부터
수업 예정입니다.

📍수업시간안내

**영어(*층, *강의실)

**수학(*층, *강의실)

월 **만원

계좌
신한 110-265-698329
황은지결제는 앱카드 혹은 학원오셔서
키오스크, 카드결제도 가능하십니다.
귀한자녀 믿고 맡겨주신만큼
신경 써 지도하겠습니다.
감사합니다.`;
}

function buildChannelGuideMsg(student: NewStudent): string {
  const parentLabel = student.parent_name || '';
  const name = student.name || '***';
  const greeting = parentLabel ? `${name} ${parentLabel}어머님` : `${name} 어머님`;
  return `안녕하세요. ${greeting}, 멘토입니다 ^^ 앞으로는 아이 학습에 대한 직접적인 소통 창구 안내드립니다.  아래 주소 클릭하시고 '${name} 학부모입니다' 라고, 메시지'를 보내주시면 감사하겠습니다.

http://pf.kakao.com/_ScZhb 채널추가하기.
원활한 학습을 위해 바로 추가 부탁드립니다.`;
}

function buildWebappGuideMsg(student: NewStudent): string {
  const parentLabel = student.parent_name || '';
  const name = student.name || '***';
  const parentUrl = student.parent_token
    ? `https://seedling-log.lovable.app/parent?token=${student.parent_token}`
    : '(학부모 링크 미생성)';
  const greeting = parentLabel ? `${name} ${parentLabel}어머님` : `${name} 어머님`;
  return `안녕하세요 ${greeting}, 
${name} 실시간 및 주간학습상황을 좀 더 직관적으로 받아보실 수 있도록원내 시스템을 안내드립니다.

${parentUrl}

공유드린 위 주소로 언제든 클릭해보시면 학습상황에대해 안내 받아보실 수 있으며. 주간코멘트 역시 받아보실 수 있습니다.
다만 해당 시스템은 저장용량관계로 최근 2주까지 저장되고 공유됨을 알려드립니다. 
확인해보시고 혹시라도  궁금하신 점은 언제든 이야기 부탁드립니다.학부모와 아이의 입장에서 생각하여 함께하겠습니다. 감사합니다^^`;
}

export function NewStudentOnboarding() {
  const { user } = useAuth();
  const [students, setStudents] = useState<NewStudent[]>([]);
  const [checks, setChecks] = useState<OnboardingCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [userName, setUserName] = useState('');

  const fetchData = useCallback(async () => {
    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

    const [studentsRes, checksRes] = await Promise.all([
      supabase
        .from('students')
        .select('id, name, parent_name, parent_phone, parent_token, created_at, grade')
        .eq('enrollment_status', '재원')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false }),
      supabase
        .from('student_onboarding_checks')
        .select('student_id, check_key, checked'),
    ]);

    if (studentsRes.data) setStudents(studentsRes.data);
    if (checksRes.data) setChecks(checksRes.data as OnboardingCheck[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => setUserName((data as any)?.full_name || ''));
    }
  }, [user]);

  const isChecked = (studentId: string, key: string) =>
    checks.some(c => c.student_id === studentId && c.check_key === key && c.checked);

  const handleToggle = async (studentId: string, key: string, current: boolean) => {
    const newVal = !current;
    // Optimistic update
    setChecks(prev => {
      const existing = prev.find(c => c.student_id === studentId && c.check_key === key);
      if (existing) return prev.map(c => c.student_id === studentId && c.check_key === key ? { ...c, checked: newVal } : c);
      return [...prev, { student_id: studentId, check_key: key, checked: newVal }];
    });

    const { error } = await supabase
      .from('student_onboarding_checks')
      .upsert({
        student_id: studentId,
        check_key: key,
        checked: newVal,
        checked_at: newVal ? new Date().toISOString() : null,
        checked_by: user?.id || null,
        checked_by_name: userName || null,
      } as any, { onConflict: 'student_id,check_key' });

    if (error) {
      toast.error('저장 실패');
      fetchData();
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} 문구가 복사되었습니다`);
  };

  const getMessageForKey = (key: string, student: NewStudent): string => {
    switch (key) {
      case 'registration_msg': return buildRegistrationMsg(student);
      case 'channel_guide_msg': return buildChannelGuideMsg(student);
      case 'webapp_guide_msg': return buildWebappGuideMsg(student);
      default: return '';
    }
  };

  if (loading) return null;
  if (students.length === 0) return null;

  const completedCount = students.filter(s =>
    CHECKLIST_ITEMS.every(item => isChecked(s.id, item.key))
  ).length;

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                신규 등록 안내 체크리스트
                <Badge variant="secondary" className="text-xs">
                  최근 1개월 · {students.length}명
                </Badge>
                {completedCount === students.length && students.length > 0 && (
                  <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs gap-1">
                    <CheckCircle2 className="w-3 h-3" /> 전원 완료
                  </Badge>
                )}
              </CardTitle>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            {students.map(student => {
              const allDone = CHECKLIST_ITEMS.every(item => isChecked(student.id, item.key));
              const doneCount = CHECKLIST_ITEMS.filter(item => isChecked(student.id, item.key)).length;
              return (
                <div
                  key={student.id}
                  className={`rounded-lg border p-3 space-y-2 transition-colors ${allDone ? 'bg-green-500/5 border-green-500/20' : 'bg-card border-border'}`}
                >
                  {/* Student header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{student.name}</span>
                      {student.grade && (
                        <Badge variant="outline" className="text-[10px]">{student.grade}</Badge>
                      )}
                      {student.parent_name && (
                        <span className="text-xs text-muted-foreground">({student.parent_name})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        등록 {format(new Date(student.created_at), 'M/d')}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${allDone ? 'bg-green-500/15 text-green-600 border-green-500/30' : 'text-muted-foreground'}`}
                      >
                        {doneCount}/{CHECKLIST_ITEMS.length}
                      </Badge>
                    </div>
                  </div>

                  {/* Checklist items */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {CHECKLIST_ITEMS.map(item => {
                      const checked = isChecked(student.id, item.key);
                      const hasTemplate = item.key !== 'channel_confirm';
                      return (
                        <div
                          key={item.key}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${checked ? 'bg-green-500/10' : 'bg-muted/30'}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => handleToggle(student.id, item.key, checked)}
                            className="h-3.5 w-3.5"
                          />
                          <span className={`flex-1 ${checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {item.icon} {item.label}
                          </span>
                          {hasTemplate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px] gap-0.5 text-primary hover:text-primary"
                              onClick={() => handleCopy(getMessageForKey(item.key, student), item.label)}
                            >
                              <Copy className="w-3 h-3" />
                              복사
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
