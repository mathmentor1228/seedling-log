import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Copy, ChevronDown, AlertCircle } from 'lucide-react';

interface UnvisitedStudent {
  id: string;
  name: string;
  grade: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_token: string | null;
}

export function UnvisitedParentsList() {
  const [students, setStudents] = useState<UnvisitedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchUnvisited();
  }, []);

  async function fetchUnvisited() {
    // 1. Get all active students with parent_token
    const { data: allStudents } = await supabase
      .from('students')
      .select('id, name, grade, parent_name, parent_phone, parent_token')
      .in('enrollment_status', ['재학'])
      .not('parent_token', 'is', null);

    if (!allStudents || allStudents.length === 0) {
      setLoading(false);
      return;
    }

    // 2. Get distinct student_ids that have visits
    const { data: visits } = await supabase
      .from('parent_portal_visits')
      .select('student_id');

    const visitedIds = new Set((visits || []).map((v: any) => v.student_id));

    // 3. Filter unvisited
    const unvisited = allStudents.filter(s => !visitedIds.has(s.id));
    setStudents(unvisited);
    setLoading(false);
  }

  function handleCopyLink(student: UnvisitedStudent) {
    if (!student.parent_token) {
      toast.error('학부모 토큰이 없습니다');
      return;
    }
    const url = `https://seedling-log.lovable.app/parent?token=${student.parent_token}`;
    navigator.clipboard.writeText(url);
    toast.success(`${student.name} 학부모 링크가 복사되었습니다`);
  }

  function handleCopyMsg(student: UnvisitedStudent) {
    const parentLabel = student.parent_name || '**';
    const name = student.name || '***';
    const url = student.parent_token
      ? `https://seedling-log.lovable.app/parent?token=${student.parent_token}`
      : '(링크 미생성)';
    const msg = `안녕하세요 ${name} ${parentLabel}어머님, 
${name} 실시간 및 주간학습상황을 좀 더 직관적으로 받아보실 수 있도록원내 시스템을 안내드립니다.

${url}

공유드린 위 주소로 언제든 클릭해보시면 학습상황에대해 안내 받아보실 수 있으며. 주간코멘트 역시 받아보실 수 있습니다.
다만 해당 시스템은 저장용량관계로 최근 2주까지 저장되고 공유됨을 알려드립니다. 
확인해보시고 혹시라도  궁금하신 점은 언제든 이야기 부탁드립니다.학부모와 아이의 입장에서 생각하여 함께하겠습니다. 감사합니다^^`;
    navigator.clipboard.writeText(msg);
    toast.success(`${student.name} 웹페이지 안내 문구가 복사되었습니다`);
  }

  if (loading) return null;
  if (students.length === 0) return null;

  return (
    <Card className="border-orange-500/20 bg-orange-500/[0.02]">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-500" />
                학부모 웹페이지 미열람 목록
                <Badge variant="secondary" className="text-xs bg-orange-500/15 text-orange-600 border-orange-500/30">
                  {students.length}명
                </Badge>
              </CardTitle>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0">
            <p className="text-xs text-muted-foreground mb-3">
              학부모 포털 링크가 발급되었으나 한 번도 접속하지 않은 학부모 목록입니다.
            </p>
            <div className="space-y-1.5">
              {students.map(student => (
                <div
                  key={student.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 bg-card"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{student.name}</span>
                    {student.grade && (
                      <Badge variant="outline" className="text-[10px]">{student.grade}</Badge>
                    )}
                    {student.parent_name && (
                      <span className="text-xs text-muted-foreground">({student.parent_name})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-0.5 text-primary hover:text-primary"
                      onClick={() => handleCopyLink(student)}
                    >
                      <Copy className="w-3 h-3" />
                      링크
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-0.5 text-primary hover:text-primary"
                      onClick={() => handleCopyMsg(student)}
                    >
                      <Copy className="w-3 h-3" />
                      안내문구
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
