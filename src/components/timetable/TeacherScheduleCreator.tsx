import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2, Plus, Trash2, Clock, Users, FolderOpen, Save, AlertTriangle, Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DAYS_OF_WEEK = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
];

const SUBJECTS: string[] = ['수학', '영어', '국어', '과학'];

interface GroupInfo {
  id: string;
  name: string;
  members: { id: string; name: string }[];
}

interface NewScheduleEntry {
  id: string; // temp id for UI
  className: string;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  groupId: string;
  classroomId: string;
}

interface Classroom {
  id: string;
  name: string;
  manager_name: string;
  capacity: number;
}

interface ConflictInfo {
  studentName: string;
  conflictClassName: string;
  conflictTime: string;
}

export function TeacherScheduleCreator() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [existingSchedules, setExistingSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New schedule form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entry, setEntry] = useState<NewScheduleEntry>({
    id: '',
    className: '',
    subject: SUBJECTS[0],
    dayOfWeek: 1,
    startTime: '16:00',
    endTime: '19:00',
    groupId: '',
    classroomId: '',
  });

  // Pending entries to create
  const [pendingEntries, setPendingEntries] = useState<NewScheduleEntry[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [groupsRes, membersRes, classroomsRes, schedulesRes] = await Promise.all([
        supabase.from('student_groups').select('id, name').order('name'),
        supabase.from('student_group_members').select('group_id, student_id'),
        supabase.from('classrooms').select('id, name, manager_name, capacity').eq('is_active', true).order('sort_order'),
        // Fetch existing schedules for this teacher
        supabase.from('class_schedules')
          .select('id, class_id, day_of_week, start_time, end_time, classroom_id, classes(name, subject, teacher_id)')
          .eq('is_active', true) as any,
      ]);

      // Build student lookup
      const studentIds = [...new Set((membersRes.data || []).map((m: any) => m.student_id))];
      let studentMap: Record<string, string> = {};
      if (studentIds.length > 0) {
        const { data: studData } = await supabase.from('students').select('id, name').in('id', studentIds);
        (studData || []).forEach((s: any) => { studentMap[s.id] = s.name; });
      }

      const membersMap: Record<string, { id: string; name: string }[]> = {};
      (membersRes.data || []).forEach((m: any) => {
        if (!membersMap[m.group_id]) membersMap[m.group_id] = [];
        if (studentMap[m.student_id]) {
          membersMap[m.group_id].push({ id: m.student_id, name: studentMap[m.student_id] });
        }
      });

      setGroups((groupsRes.data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        members: (membersMap[g.id] || []).sort((a, b) => a.name.localeCompare(b.name)),
      })));

      setClassrooms(classroomsRes.data || []);
      setExistingSchedules(schedulesRes.data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  // Detect conflicts for a pending entry
  function getConflicts(entry: NewScheduleEntry): ConflictInfo[] {
    if (!entry.groupId) return [];
    const group = groups.find(g => g.id === entry.groupId);
    if (!group) return [];

    const conflicts: ConflictInfo[] = [];
    for (const member of group.members) {
      for (const sched of existingSchedules) {
        if (sched.day_of_week !== entry.dayOfWeek) continue;
        // Check time overlap
        const existStart = sched.start_time.slice(0, 5);
        const existEnd = sched.end_time.slice(0, 5);
        if (entry.startTime < existEnd && existStart < entry.endTime) {
          // Check if student is in that class
          // We'd need class_students data, but for simplicity check the classroom schedule
          conflicts.push({
            studentName: member.name,
            conflictClassName: sched.classes?.name || '?',
            conflictTime: `${DAYS_OF_WEEK.find(d => d.value === sched.day_of_week)?.label} ${existStart}-${existEnd}`,
          });
        }
      }
    }
    return conflicts;
  }

  function addEntry() {
    if (!entry.className.trim()) {
      toast({ title: '수업명을 입력해주세요', variant: 'destructive' });
      return;
    }
    setPendingEntries(prev => [...prev, { ...entry, id: crypto.randomUUID() }]);
    setDialogOpen(false);
    setEntry({
      id: '',
      className: '',
      subject: SUBJECTS[0],
      dayOfWeek: 1,
      startTime: '16:00',
      endTime: '19:00',
      groupId: '',
      classroomId: '',
    });
  }

  function removeEntry(id: string) {
    setPendingEntries(prev => prev.filter(e => e.id !== id));
  }

  async function handleSaveAll() {
    if (pendingEntries.length === 0) {
      toast({ title: '추가할 수업이 없습니다', variant: 'destructive' });
      return;
    }
    if (!user?.id) return;

    setSaving(true);
    try {
      for (const pe of pendingEntries) {
        // 1. Create or find class
        let classId: string;
        const { data: existingClass } = await supabase
          .from('classes')
          .select('id')
          .eq('name', pe.className)
          .eq('teacher_id', user.id)
          .eq('subject', pe.subject as any)
          .maybeSingle();

        if (existingClass) {
          classId = existingClass.id;
        } else {
          const { data: newClass, error: classErr } = await supabase
            .from('classes')
            .insert({ name: pe.className, subject: pe.subject as any, teacher_id: user.id })
            .select('id')
            .single();
          if (classErr) throw classErr;
          classId = newClass.id;
        }

        // 2. Create schedule
        const { error: schedErr } = await supabase
          .from('class_schedules')
          .insert({
            class_id: classId,
            day_of_week: pe.dayOfWeek,
            start_time: pe.startTime,
            end_time: pe.endTime,
            teacher_id: user.id,
            classroom_id: pe.classroomId || null,
          });
        if (schedErr) throw schedErr;

        // 3. If group selected, add members to class
        if (pe.groupId) {
          const group = groups.find(g => g.id === pe.groupId);
          if (group && group.members.length > 0) {
            const inserts = group.members.map(m => ({
              class_id: classId,
              student_id: m.id,
            }));
            await supabase
              .from('class_students')
              .upsert(inserts, { onConflict: 'class_id,student_id', ignoreDuplicates: true });

            // Also create schedule_group_assignment
            const { data: schedData } = await supabase
              .from('class_schedules')
              .select('id')
              .eq('class_id', classId)
              .eq('day_of_week', pe.dayOfWeek)
              .eq('start_time', pe.startTime)
              .single();

            if (schedData) {
              await supabase
                .from('schedule_group_assignments')
                .upsert(
                  { schedule_id: schedData.id, group_id: pe.groupId },
                  { onConflict: 'schedule_id,group_id', ignoreDuplicates: true }
                );
            }
          }
        }
      }

      toast({ title: `${pendingEntries.length}개 수업 일정 생성 완료` });
      setPendingEntries([]);
      fetchData();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">내 수업 일정 만들기</span>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3 h-3 mr-1" />
          수업 추가
        </Button>
      </div>

      {/* Pending entries */}
      {pendingEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">추가 대기 중 ({pendingEntries.length}개)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingEntries.map(pe => {
              const group = groups.find(g => g.id === pe.groupId);
              const dayLabel = DAYS_OF_WEEK.find(d => d.value === pe.dayOfWeek)?.label;
              const classroom = classrooms.find(c => c.id === pe.classroomId);

              return (
                <div key={pe.id} className="border rounded-lg p-3 bg-muted/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge>{pe.subject}</Badge>
                      <span className="font-medium text-sm">{pe.className}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeEntry(pe.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {dayLabel} {pe.startTime}~{pe.endTime}
                    </span>
                    {group && (
                      <span className="flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" />
                        {group.name} ({group.members.length}명)
                      </span>
                    )}
                    {classroom && (
                      <span className="flex items-center gap-1">
                        🏫 {classroom.name}
                      </span>
                    )}
                  </div>
                  {group && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {group.members.slice(0, 10).map(m => (
                        <span key={m.id} className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{m.name}</span>
                      ))}
                      {group.members.length > 10 && (
                        <span className="text-[11px] text-muted-foreground">+{group.members.length - 10}명</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <Button className="w-full" onClick={handleSaveAll} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {pendingEntries.length}개 수업 일정 저장
            </Button>
          </CardContent>
        </Card>
      )}

      {pendingEntries.length === 0 && (
        <Card className="p-8 text-center">
          <Calendar className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            [수업 추가] 버튼을 눌러 그룹별 수업 시간표를 만들어보세요.
          </p>
        </Card>
      )}

      {/* Add Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>수업 일정 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>수업명 *</Label>
              <Input
                placeholder="예: 고2 수학 A반"
                value={entry.className}
                onChange={e => setEntry({ ...entry, className: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>과목</Label>
                <Select value={entry.subject} onValueChange={v => setEntry({ ...entry, subject: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>요일</Label>
                <Select value={String(entry.dayOfWeek)} onValueChange={v => setEntry({ ...entry, dayOfWeek: Number(v) })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}요일</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>시작 시간</Label>
                <Input type="time" value={entry.startTime} onChange={e => setEntry({ ...entry, startTime: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-2">
                <Label>종료 시간</Label>
                <Input type="time" value={entry.endTime} onChange={e => setEntry({ ...entry, endTime: e.target.value })} className="h-9" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>그룹(반) 배정</Label>
              <Select value={entry.groupId} onValueChange={v => setEntry({ ...entry, groupId: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="그룹 선택 (선택)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">그룹 없음</SelectItem>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name} ({g.members.length}명)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {entry.groupId && entry.groupId !== 'none' && (() => {
                const group = groups.find(g => g.id === entry.groupId);
                if (!group) return null;
                return (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {group.members.map(m => (
                      <span key={m.id} className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{m.name}</span>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="space-y-2">
              <Label>강의실</Label>
              <Select value={entry.classroomId} onValueChange={v => setEntry({ ...entry, classroomId: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="강의실 선택 (선택)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">미정</SelectItem>
                  {classrooms.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.manager_name}, 정원 {c.capacity})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={addEntry} disabled={!entry.className.trim()}>
                <Plus className="w-4 h-4 mr-1" />추가
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
