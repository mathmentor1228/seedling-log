import { useEffect, useMemo, useState } from 'react';
import { Download, MessageCircle, RefreshCw, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

interface UnvisitedParent {
  id: string;
  name: string;
  grade: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_token: string | null;
  parent_last_visited: string | null;
  teacher_name?: string;
}

interface ParentPortalVisit {
  student_id: string;
  visited_at: string;
}

interface StudentTeacherMap {
  student_id: string;
  teacher_id: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
}

const DAY_MS = 1000 * 60 * 60 * 24;

function getDaysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS));
}

function buildParentMessage(student: UnvisitedParent) {
  const parentLabel = student.parent_name ? `${student.parent_name} 학부모님` : '학부모님';
  const url = student.parent_token ? `https://seedling-log.lovable.app/parent?token=${student.parent_token}` : '';

  return `안녕하세요, ${student.name} ${parentLabel}.

더멘토 학부모 웹페이지에서 최근 학습상황과 주간 코멘트를 확인하실 수 있어 안내드립니다.

${url || '(학부모 링크 미생성)'}

위 주소로 접속하시면 최근 학습상황을 확인하실 수 있습니다. 궁금하신 점은 언제든 편하게 문의 부탁드립니다.`;
}

export function ParentUnvisitedNotifier() {
  const { toast } = useToast();
  const [unvisited, setUnvisited] = useState<UnvisitedParent[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const selectedParents = useMemo(
    () => unvisited.filter((parent) => selected.includes(parent.id)),
    [selected, unvisited],
  );

  useEffect(() => {
    fetchUnvisitedParents();
  }, []);

  async function fetchUnvisitedParents() {
    setLoading(true);
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [studentsRes, visitsRes, mappingsRes, profilesRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, name, grade, parent_name, parent_phone, parent_token')
          .eq('enrollment_status', '재학')
          .not('parent_token', 'is', null)
          .order('name'),
        supabase
          .from('parent_portal_visits')
          .select('student_id, visited_at')
          .order('visited_at', { ascending: false })
          .limit(5000),
        supabase
          .from('student_subject_teachers')
          .select('student_id, teacher_id'),
        supabase
          .from('profiles')
          .select('id, full_name'),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (visitsRes.error) throw visitsRes.error;
      if (mappingsRes.error) throw mappingsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const latestVisitByStudent = new Map<string, string>();
      ((visitsRes.data ?? []) as ParentPortalVisit[]).forEach((visit) => {
        if (!latestVisitByStudent.has(visit.student_id)) {
          latestVisitByStudent.set(visit.student_id, visit.visited_at);
        }
      });

      const teacherNamesById = new Map(
        ((profilesRes.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile.full_name || '알 수 없음']),
      );
      const teacherNamesByStudent = new Map<string, Set<string>>();
      ((mappingsRes.data ?? []) as StudentTeacherMap[]).forEach((mapping) => {
        const teacherName = teacherNamesById.get(mapping.teacher_id);
        if (!teacherName) return;
        if (!teacherNamesByStudent.has(mapping.student_id)) teacherNamesByStudent.set(mapping.student_id, new Set());
        teacherNamesByStudent.get(mapping.student_id)!.add(teacherName);
      });

      const rows = ((studentsRes.data ?? []) as Omit<UnvisitedParent, 'parent_last_visited' | 'teacher_name'>[])
        .map((student) => ({
          ...student,
          parent_last_visited: latestVisitByStudent.get(student.id) ?? null,
          teacher_name: [...(teacherNamesByStudent.get(student.id) ?? [])].join(', '),
        }))
        .filter((student) => {
          if (!student.parent_last_visited) return true;
          return new Date(student.parent_last_visited) < sevenDaysAgo;
        })
        .sort((a, b) => {
          if (!a.parent_last_visited) return -1;
          if (!b.parent_last_visited) return 1;
          return new Date(a.parent_last_visited).getTime() - new Date(b.parent_last_visited).getTime();
        });

      setUnvisited(rows);
      setSelected((prev) => prev.filter((id) => rows.some((row) => row.id === id)));
    } catch (error) {
      console.error('Error fetching unvisited parents:', error);
      toast({ title: '미접속 학부모 목록을 불러오지 못했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? unvisited.map((parent) => parent.id) : []);
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((selectedId) => selectedId !== id)));
  }

  async function handleSendKakao() {
    if (selectedParents.length === 0) return;

    setSending(true);
    try {
      const messages = selectedParents.map(buildParentMessage).join('\n\n━━━━━━━━━━\n\n');
      await navigator.clipboard.writeText(messages);
      toast({ title: `${selectedParents.length}명 안내 문구가 복사되었습니다.` });

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) window.location.href = 'kakaotalk://launch';
      else window.open('https://accounts.kakao.com/login?continue=https://e.kakao.com/', '_blank');
    } catch (error) {
      console.error('Error preparing Kakao message:', error);
      toast({ title: '카카오톡 발송 준비에 실패했습니다.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  function downloadExcel() {
    const rows = unvisited.map((student) => ({
      학생명: student.name,
      학년: student.grade ? `${student.grade}학년` : '',
      담당선생님: student.teacher_name || '',
      학부모명: student.parent_name || '',
      연락처: student.parent_phone || '',
      마지막접속: student.parent_last_visited ? new Date(student.parent_last_visited).toLocaleDateString('ko-KR') : '기록없음',
    }));

    import('xlsx').then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '미접속학부모');
      XLSX.writeFile(wb, `미접속학부모_${new Date().toLocaleDateString('ko-KR')}.xlsx`);
    });
  }

  const allSelected = unvisited.length > 0 && selected.length === unvisited.length;

  return (
    <Card className="border-warning/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-warning" />
            미접속 학부모 알림 발송
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchUnvisitedParents} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg bg-destructive/10 px-5 py-3 text-center">
            <p className="text-2xl font-bold text-destructive">{unvisited.length}</p>
            <p className="text-xs text-destructive/80">7일 이상 미접속</p>
          </div>
          <div className="rounded-lg bg-warning/15 px-5 py-3 text-center">
            <p className="text-2xl font-bold text-warning">{selected.length}</p>
            <p className="text-xs text-warning/80">선택된 학부모</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={allSelected} onCheckedChange={(checked) => toggleAll(checked === true)} />
            전체 선택 ({unvisited.length}명)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={downloadExcel} disabled={unvisited.length === 0}>
              <Download className="h-4 w-4" />
              엑셀 다운로드
            </Button>
            <Button onClick={handleSendKakao} disabled={selected.length === 0 || sending} className="bg-warning text-warning-foreground hover:bg-warning/90">
              <MessageCircle className="h-4 w-4" />
              카카오톡 발송 ({selected.length}명)
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : unvisited.length === 0 ? (
          <div className="py-14 text-center text-muted-foreground">
            <Users className="mx-auto mb-3 h-8 w-8 text-success" />
            <p className="text-sm font-semibold text-foreground">7일 이상 미접속 학부모가 없어요</p>
            <p className="mt-1 text-xs">모든 학부모가 최근에 웹페이지를 확인했습니다</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60">
                <TableHead className="w-10"></TableHead>
                <TableHead>학생</TableHead>
                <TableHead>학년</TableHead>
                <TableHead>담당선생님</TableHead>
                <TableHead>학부모</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead>마지막 접속</TableHead>
                <TableHead>미접속</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unvisited.map((student) => {
                const days = getDaysSince(student.parent_last_visited);
                const isLongUnvisited = days === null || days >= 30;
                return (
                  <TableRow key={student.id}>
                    <TableCell>
                      <Checkbox checked={selected.includes(student.id)} onCheckedChange={(checked) => toggleOne(student.id, checked === true)} />
                    </TableCell>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell className="text-muted-foreground">{student.grade ? `${student.grade}학년` : '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{student.teacher_name || '-'}</TableCell>
                    <TableCell>{student.parent_name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{student.parent_phone || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {student.parent_last_visited ? new Date(student.parent_last_visited).toLocaleDateString('ko-KR') : '접속 기록 없음'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isLongUnvisited ? 'destructive' : 'secondary'}>
                        {days === null ? '미접속' : `${days}일 전`}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}