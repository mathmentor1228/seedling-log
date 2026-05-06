import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Plus, Trash2, Clock, Users, FolderOpen, Save, AlertTriangle, Calendar,
  Pencil, UserPlus, Search,
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
  description: string | null;
  members: { id: string; name: string }[];
}

interface NewScheduleEntry {
  id: string;
  className: string;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  groupId: string;
  classroomId: string;
  studentIds: string[];
  studentNames: string[];
  assignMode: 'group' | 'students';
}

interface Classroom {
  id: string;
  name: string;
  manager_name: string;
  capacity: number;
}

interface StudentItem {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
}

export function TeacherScheduleCreator() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [existingSchedules, setExistingSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teacherName, setTeacherName] = useState('');
  const [matchedClassroom, setMatchedClassroom] = useState<Classroom | null>(null);

  // Schedule form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entry, setEntry] = useState<NewScheduleEntry>({
    id: '', className: '', subject: SUBJECTS[0], dayOfWeek: 1,
    startTime: '16:00', endTime: '19:00', groupId: '', classroomId: '',
  });
  const [pendingEntries, setPendingEntries] = useState<NewScheduleEntry[]>([]);

  // Group management
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupInfo | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);

  // Member management
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [allStudents, setAllStudents] = useState<StudentItem[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [currentMembers, setCurrentMembers] = useState<Set<string>>(new Set());
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<string>('schedule');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch teacher profile name for classroom matching
      let tName = '';
      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        tName = profile?.full_name || '';
        setTeacherName(tName);
      }

      const [groupsRes, membersRes, classroomsRes, schedulesRes] = await Promise.all([
        supabase.from('student_groups').select('id, name, description').order('name'),
        supabase.from('student_group_members').select('group_id, student_id'),
        supabase.from('classrooms').select('id, name, manager_name, capacity').eq('is_active', true).order('sort_order'),
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

      const groupsList = (groupsRes.data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        members: (membersMap[g.id] || []).sort((a, b) => a.name.localeCompare(b.name)),
      }));
      setGroups(groupsList);

      const classroomsList: Classroom[] = classroomsRes.data || [];
      setClassrooms(classroomsList);
      setExistingSchedules(schedulesRes.data || []);

      // Auto-match classroom by teacher name
      if (tName) {
        const matched = classroomsList.find(c =>
          c.manager_name && tName.includes(c.manager_name.replace(/\s/g, ''))
        );
        setMatchedClassroom(matched || null);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  // ── Schedule Logic ──
  function openAddDialog() {
    setEntry({
      id: '', className: '', subject: SUBJECTS[0], dayOfWeek: 1,
      startTime: '16:00', endTime: '19:00', groupId: '',
      classroomId: matchedClassroom?.id || '',
    });
    setDialogOpen(true);
  }

  function addEntry() {
    if (!entry.className.trim()) {
      toast({ title: '수업명을 입력해주세요', variant: 'destructive' });
      return;
    }
    setPendingEntries(prev => [...prev, { ...entry, id: crypto.randomUUID() }]);
    setDialogOpen(false);
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
        let classId: string;
        const { data: existingClass } = await supabase
          .from('classes').select('id')
          .eq('name', pe.className).eq('teacher_id', user.id)
          .eq('subject', pe.subject as any).maybeSingle();

        if (existingClass) {
          classId = existingClass.id;
        } else {
          const { data: newClass, error: classErr } = await supabase
            .from('classes')
            .insert({ name: pe.className, subject: pe.subject as any, teacher_id: user.id })
            .select('id').single();
          if (classErr) throw classErr;
          classId = newClass.id;
        }

        const cId = pe.classroomId && pe.classroomId !== 'none' ? pe.classroomId : null;
        const { error: schedErr } = await supabase.from('class_schedules').insert({
          class_id: classId, day_of_week: pe.dayOfWeek,
          start_time: pe.startTime, end_time: pe.endTime,
          teacher_id: user.id, classroom_id: cId,
        });
        if (schedErr) throw schedErr;

        if (pe.groupId && pe.groupId !== 'none') {
          const group = groups.find(g => g.id === pe.groupId);
          if (group && group.members.length > 0) {
            const inserts = group.members.map(m => ({ class_id: classId, student_id: m.id }));
            await supabase.from('class_students')
              .upsert(inserts, { onConflict: 'class_id,student_id', ignoreDuplicates: true });

            const { data: schedData } = await supabase.from('class_schedules')
              .select('id').eq('class_id', classId)
              .eq('day_of_week', pe.dayOfWeek).eq('start_time', pe.startTime).single();

            if (schedData) {
              await supabase.from('schedule_group_assignments')
                .upsert({ schedule_id: schedData.id, group_id: pe.groupId },
                  { onConflict: 'schedule_id,group_id', ignoreDuplicates: true });
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

  // ── Group Logic ──
  async function handleSaveGroup() {
    if (!groupName.trim()) return;
    setGroupSaving(true);
    try {
      if (editingGroup) {
        const { error } = await supabase.from('student_groups')
          .update({ name: groupName.trim(), description: groupDesc.trim() || null, updated_at: new Date().toISOString() })
          .eq('id', editingGroup.id);
        if (error) throw error;
        toast({ title: '그룹 수정 완료' });
      } else {
        const { error } = await supabase.from('student_groups')
          .insert({ name: groupName.trim(), description: groupDesc.trim() || null });
        if (error) throw error;
        toast({ title: '그룹 생성 완료' });
      }
      setGroupDialogOpen(false);
      setEditingGroup(null);
      setGroupName('');
      setGroupDesc('');
      fetchData();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setGroupSaving(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm('이 그룹을 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('student_groups').delete().eq('id', groupId);
      if (error) throw error;
      toast({ title: '그룹 삭제 완료' });
      fetchData();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    }
  }

  async function openMemberDialog(group: GroupInfo) {
    setActiveGroupId(group.id);
    setCurrentMembers(new Set(group.members.map(m => m.id)));
    setSelectedStudentIds(new Set(group.members.map(m => m.id)));
    setMemberDialogOpen(true);
    setStudentSearch('');
    setStudentsLoading(true);
    try {
      const { data } = await supabase.from('students')
        .select('id, name, school, grade').neq('enrollment_status', '퇴원').order('name');
      setAllStudents(data || []);
    } catch (e) { console.error(e); }
    finally { setStudentsLoading(false); }
  }

  async function handleSaveMembers() {
    if (!activeGroupId) return;
    setMemberSaving(true);
    try {
      const toAdd = [...selectedStudentIds].filter(id => !currentMembers.has(id));
      const toRemove = [...currentMembers].filter(id => !selectedStudentIds.has(id));
      if (toRemove.length > 0) {
        await supabase.from('student_group_members').delete()
          .eq('group_id', activeGroupId).in('student_id', toRemove);
      }
      if (toAdd.length > 0) {
        await supabase.from('student_group_members')
          .insert(toAdd.map(sid => ({ group_id: activeGroupId, student_id: sid })));
      }
      toast({ title: '멤버 저장 완료', description: `추가 ${toAdd.length}명, 제거 ${toRemove.length}명` });
      setMemberDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setMemberSaving(false);
    }
  }

  const filteredStudents = allStudents.filter(s =>
    !studentSearch.trim() || s.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 h-9">
          <TabsTrigger value="schedule" className="text-xs">
            <Calendar className="w-3 h-3 mr-1" />수업 일정
          </TabsTrigger>
          <TabsTrigger value="groups" className="text-xs">
            <FolderOpen className="w-3 h-3 mr-1" />그룹(반) 관리
          </TabsTrigger>
        </TabsList>

        {/* ── 수업 일정 탭 ── */}
        <TabsContent value="schedule" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">내 수업 일정 만들기</span>
            </div>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="w-3 h-3 mr-1" />수업 추가
            </Button>
          </div>

          {/* Auto-matched classroom info */}
          {matchedClassroom && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
              🏫 담당 강의실: <Badge variant="secondary" className="text-xs">{matchedClassroom.name}</Badge>
              <span>({matchedClassroom.manager_name}, 정원 {matchedClassroom.capacity}명)</span>
            </div>
          )}

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
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeEntry(pe.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{dayLabel} {pe.startTime}~{pe.endTime}</span>
                        {group && <span className="flex items-center gap-1"><FolderOpen className="w-3 h-3" />{group.name} ({group.members.length}명)</span>}
                        {classroom && <span className="flex items-center gap-1">🏫 {classroom.name}</span>}
                      </div>
                      {group && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {group.members.slice(0, 10).map(m => (
                            <span key={m.id} className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{m.name}</span>
                          ))}
                          {group.members.length > 10 && <span className="text-[11px] text-muted-foreground">+{group.members.length - 10}명</span>}
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
        </TabsContent>

        {/* ── 그룹(반) 관리 탭 ── */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">그룹(반) 관리</span>
              <Badge variant="outline" className="text-xs">{groups.length}개</Badge>
            </div>
            <Button size="sm" onClick={() => {
              setEditingGroup(null); setGroupName(''); setGroupDesc('');
              setGroupDialogOpen(true);
            }}>
              <Plus className="w-3 h-3 mr-1" />그룹 생성
            </Button>
          </div>

          {groups.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              그룹이 없습니다. 학생들을 묶어 반을 만들어보세요.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map(group => (
                <div key={group.id} className="border rounded-lg p-3 bg-card hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="text-sm font-semibold">{group.name}</h4>
                      {group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => {
                        setEditingGroup(group); setGroupName(group.name);
                        setGroupDesc(group.description || ''); setGroupDialogOpen(true);
                      }} className="p-1 rounded hover:bg-muted text-muted-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteGroup(group.id)} className="p-1 rounded hover:bg-muted text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary" className="text-xs">
                      <Users className="w-3 h-3 mr-1" />{group.members.length}명
                    </Badge>
                    <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => openMemberDialog(group)}>
                      <UserPlus className="w-3 h-3 mr-1" />멤버 관리
                    </Button>
                  </div>
                  {group.members.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {group.members.slice(0, 8).map(m => (
                        <span key={m.id} className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.name}</span>
                      ))}
                      {group.members.length > 8 && <span className="text-xs text-muted-foreground">+{group.members.length - 8}명</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add Schedule Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>수업 일정 추가</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>수업명 *</Label>
              <Input placeholder="예: 고2 수학 A반" value={entry.className}
                onChange={e => setEntry({ ...entry, className: e.target.value })} />
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
              <Select value={entry.groupId || 'none'} onValueChange={v => setEntry({ ...entry, groupId: v === 'none' ? '' : v })}>
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

            {/* Classroom - auto-filled */}
            <div className="space-y-2">
              <Label>강의실</Label>
              {matchedClassroom ? (
                <div className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-muted/30">
                  🏫 <span className="font-medium">{matchedClassroom.name}</span>
                  <span className="text-xs text-muted-foreground">({matchedClassroom.manager_name}, 정원 {matchedClassroom.capacity}명)</span>
                </div>
              ) : (
                <Select value={entry.classroomId || 'none'} onValueChange={v => setEntry({ ...entry, classroomId: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="강의실 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">미정</SelectItem>
                    {classrooms.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name} ({c.manager_name}, 정원 {c.capacity})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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

      {/* ── Group Create/Edit Dialog ── */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingGroup ? '그룹 수정' : '새 그룹 생성'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>그룹명 *</Label>
              <Input placeholder="예: 고2 수능반, 중1 기초반" value={groupName}
                onChange={e => setGroupName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>설명 (선택)</Label>
              <Input placeholder="그룹 설명" value={groupDesc}
                onChange={e => setGroupDesc(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>취소</Button>
              <Button onClick={handleSaveGroup} disabled={groupSaving || !groupName.trim()}>
                {groupSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingGroup ? '수정' : '생성'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Member Management Dialog ── */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              멤버 관리 — {groups.find(g => g.id === activeGroupId)?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="text-xs text-muted-foreground">선택된 학생: {selectedStudentIds.size}명</div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="학생 검색..." value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)} className="pl-10" />
            </div>
            {studentsLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                {filteredStudents.map(student => {
                  const isSelected = selectedStudentIds.has(student.id);
                  return (
                    <div key={student.id}
                      className={cn('flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50',
                        isSelected && 'bg-primary/5 border border-primary/20')}
                      onClick={() => {
                        setSelectedStudentIds(prev => {
                          const next = new Set(prev);
                          if (next.has(student.id)) next.delete(student.id);
                          else next.add(student.id);
                          return next;
                        });
                      }}>
                      <Checkbox checked={isSelected} />
                      <div className="flex-1">
                        <span className="text-sm font-medium">{student.name}</span>
                        {(student.school || student.grade) && (
                          <span className="text-xs text-muted-foreground ml-2">
                            {[student.school, student.grade].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>취소</Button>
              <Button onClick={handleSaveMembers} disabled={memberSaving}>
                {memberSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
