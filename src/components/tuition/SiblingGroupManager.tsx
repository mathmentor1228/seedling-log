import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, X, Link2, Unlink, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { ACTIVE_STUDENT_STATUSES } from '@/lib/constants';

interface Student {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
  enrollment_status: string | null;
  sibling_group_id: number | null;
}

const SIBLING_DISCOUNT = 10000;

export function SiblingGroupManager() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [picker, setPicker] = useState<{ groupId: number | 'new' } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('students')
      .select('id, name, school, grade, enrollment_status, sibling_group_id')
      .order('sibling_group_id', { ascending: true, nullsFirst: false })
      .order('name');
    if (error) toast.error('불러오기 실패');
    setStudents((data || []) as Student[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Group existing siblings
  const groups = useMemo(() => {
    const map = new Map<number, Student[]>();
    students.forEach(s => {
      if (s.sibling_group_id != null) {
        if (!map.has(s.sibling_group_id)) map.set(s.sibling_group_id, []);
        map.get(s.sibling_group_id)!.push(s);
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([id, members]) => ({ id, members }));
  }, [students]);

  const ungrouped = useMemo(() => {
    return students
      .filter(s => s.sibling_group_id == null)
      .filter(s => ACTIVE_STUDENT_STATUSES.includes(s.enrollment_status as any))
      .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.school || '').toLowerCase().includes(search.toLowerCase()));
  }, [students, search]);

  const filteredPickerCandidates = useMemo(() => {
    if (!picker) return [];
    return students
      .filter(s => s.sibling_group_id == null)
      .filter(s => ACTIVE_STUDENT_STATUSES.includes(s.enrollment_status as any))
      .filter(s => !pickerSearch || s.name.toLowerCase().includes(pickerSearch.toLowerCase()));
  }, [students, picker, pickerSearch]);

  const nextGroupId = useMemo(() => {
    const max = students.reduce((m, s) => Math.max(m, s.sibling_group_id || 1000), 1000);
    return max + 1;
  }, [students]);

  const addToGroup = async (studentId: string, groupId: number) => {
    const { error } = await supabase
      .from('students')
      .update({ sibling_group_id: groupId } as any)
      .eq('id', studentId);
    if (error) { toast.error('연결 실패'); return; }
    toast.success('형제 그룹에 연결되었습니다');
    setPicker(null);
    setPickerSearch('');
    load();
  };

  const removeFromGroup = async (studentId: string) => {
    if (!confirm('이 학생을 형제 그룹에서 제외하시겠습니까?')) return;
    const { error } = await supabase
      .from('students')
      .update({ sibling_group_id: null } as any)
      .eq('id', studentId);
    if (error) { toast.error('제외 실패'); return; }
    toast.success('그룹에서 제외되었습니다');
    load();
  };

  const dissolveGroup = async (groupId: number) => {
    if (!confirm('이 형제 그룹을 해체하시겠습니까? (모든 멤버 연결 해제)')) return;
    const { error } = await supabase
      .from('students')
      .update({ sibling_group_id: null } as any)
      .eq('sibling_group_id', groupId);
    if (error) { toast.error('해체 실패'); return; }
    toast.success('그룹이 해체되었습니다');
    load();
  };

  const startNewGroup = (firstStudentId: string) => {
    addToGroup(firstStudentId, nextGroupId);
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      {/* Intro / policy */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">형제·자매·남매 할인 정책</p>
              <p className="text-muted-foreground mt-1">
                같은 형제 그룹으로 연결된 학생은 1인당 <strong className="text-primary">매월 {SIBLING_DISCOUNT.toLocaleString()}원 할인</strong>이 자동 적용됩니다.
                (그룹 멤버가 2명 이상일 때 적용)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing groups */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">형제 그룹 ({groups.length}그룹)</h3>
        </div>
        {groups.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">아직 등록된 형제 그룹이 없습니다.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {groups.map(({ id, members }) => (
              <Card key={id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <Link2 className="w-3 h-3" />그룹 #{id}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{members.length}명 · 인당 -{SIBLING_DISCOUNT.toLocaleString()}원/월</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setPicker({ groupId: id })}>
                        <Plus className="w-3 h-3" />멤버 추가
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive gap-1" onClick={() => dissolveGroup(id)}>
                        <Unlink className="w-3 h-3" />해체
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2 py-1 text-xs">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-muted-foreground">{m.school || '-'} {m.grade || ''}</span>
                        {!ACTIVE_STUDENT_STATUSES.includes(m.enrollment_status as any) && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1">{m.enrollment_status}</Badge>
                        )}
                        <button onClick={() => removeFromGroup(m.id)} className="text-muted-foreground hover:text-destructive ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create new group from ungrouped students */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-foreground">미연결 학생 ({ungrouped.length}명)</h3>
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="이름/학교 검색"
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-2">학생을 클릭하면 새 형제 그룹이 생성되며, 이후 다른 학생을 추가할 수 있습니다.</p>
        <Card>
          <CardContent className="p-3">
            {ungrouped.length === 0 ? (
              <p className="text-center text-muted-foreground py-3 text-sm">조회된 학생이 없습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-[320px] overflow-y-auto">
                {ungrouped.map(s => (
                  <Button
                    key={s.id}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => startNewGroup(s.id)}
                  >
                    <Plus className="w-3 h-3" />
                    {s.name}
                    <span className="text-muted-foreground">({s.school || '-'} {s.grade || ''})</span>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Member picker overlay */}
      {picker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPicker(null)}>
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">그룹 #{picker.groupId} 에 추가할 학생 선택</h4>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPicker(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Input
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="이름 검색"
                className="h-8 text-sm"
                autoFocus
              />
              <div className="max-h-[360px] overflow-y-auto flex flex-wrap gap-1.5">
                {filteredPickerCandidates.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-4 w-full">조회 결과 없음</p>
                ) : filteredPickerCandidates.map(s => (
                  <Button
                    key={s.id}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => addToGroup(s.id, picker.groupId as number)}
                  >
                    {s.name} <span className="text-muted-foreground ml-1">({s.school || '-'} {s.grade || ''})</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
