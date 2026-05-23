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
  teacher_id: string | null;
  teacher_name?: string | null;
  members: { id: string; name: string }[];
}

interface TeacherOpt { id: string; name: string }

interface NewScheduleEntry {
  id: string;
  className: string;
  subject: string;
  dayOfWeek: number;
  dayOfWeeks: number[];
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
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdminUser = role === 'admin';

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
    id: '', className: '', subject: SUBJECTS[0], dayOfWeek: 1, dayOfWeeks: [1],
    startTime: '16:00', endTime: '19:00', groupId: '', classroomId: '',
    studentIds: [], studentNames: [], assignMode: 'students',
  });
  const [pendingEntries, setPendingEntries] = useState<NewScheduleEntry[]>([]);

  // Student picker (for direct assignment in entry dialog)
  const [entryStudentSearch, setEntryStudentSearch] = useState('');
  const [myStudents, setMyStudents] = useState<StudentItem[]>([]);
  const [myStudentsLoading, setMyStudentsLoading] = useState(false);

  // Group management
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupInfo | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupTeacherId, setGroupTeacherId] = useState<string>('');
  const [teacherOptions, setTeacherOptions] = useState<TeacherOpt[]>([]);

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

      // TEACHER-OWN-GROUPS-V4: 그룹에 명시적 teacher_id를 지정. 비관리자는 본인 담당 그룹 +
      // 아직 담당자가 지정되지 않은 그룹(NULL)을 함께 표시(레거시 호환).
      const [groupsRes, membersRes, classroomsRes, schedulesRes, teachersRes] = await Promise.all([
        supabase.from('student_groups').select('id, name, description, created_by, teacher_id').order('name'),
        supabase.from('student_group_members').select('group_id, student_id'),
        supabase.from('classrooms').select('id, name, manager_name, capacity').eq('is_active', true).order('sort_order'),
        supabase.from('class_schedules')
          .select('id, class_id, day_of_week, start_time, end_time, classroom_id, classes(name, subject, teacher_id)')
          .eq('is_active', true) as any,
        supabase.from('user_roles').select('user_id, role').eq('role', 'teacher' as any),
      ]);

      // Build teacher options (id → name) from profiles for teacher-roled users
      const teacherIds: string[] = Array.from(new Set(((teachersRes as any).data || []).map((r: any) => String(r.user_id))));
      let teacherNameMap: Record<string, string> = {};
      if (teacherIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', teacherIds);
        (profs || []).forEach((p: any) => { teacherNameMap[p.id] = p.full_name || ''; });
      }
      const tOptions: TeacherOpt[] = teacherIds
        .map((id) => ({ id, name: teacherNameMap[id] || '이름없음' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setTeacherOptions(tOptions);

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

      let groupsList: GroupInfo[] = (groupsRes.data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        teacher_id: g.teacher_id || null,
        teacher_name: g.teacher_id ? (teacherNameMap[g.teacher_id] || null) : null,
        members: (membersMap[g.id] || []).sort((a, b) => a.name.localeCompare(b.name)),
      }));

      // Filter: non-admin → groups assigned to me, or unassigned (legacy)
      if (!isAdminUser && user?.id) {
        groupsList = groupsList.filter((g) => g.teacher_id === user.id || g.teacher_id === null);
      }
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
  async function loadMyStudents() {
    if (!user?.id || myStudents.length > 0) return;
    setMyStudentsLoading(true);
    try {
      // Fetch students taught by this teacher (via teacher_student_links + class_students of own classes)
      const { data: ownClasses } = await supabase
        .from('classes').select('id').eq('teacher_id', user.id);
      const classIds = (ownClasses || []).map((c: any) => c.id);

      const studentIdSet = new Set<string>();
      if (classIds.length > 0) {
        const { data: cs } = await supabase
          .from('class_students').select('student_id').in('class_id', classIds);
        (cs || []).forEach((r: any) => studentIdSet.add(r.student_id));
      }
      const { data: links } = await supabase
        .from('teacher_student_links').select('student_id').eq('teacher_id', user.id);
      (links || []).forEach((r: any) => studentIdSet.add(r.student_id));

      let list: StudentItem[] = [];
      if (studentIdSet.size > 0) {
        const { data: studs } = await supabase
          .from('students').select('id, name, school, grade')
          .in('id', Array.from(studentIdSet))
          .neq('enrollment_status', '퇴원')
          .order('name');
        list = (studs || []) as StudentItem[];
      }
      // Fallback: if teacher has no links yet, show all active students so they can pick
      if (list.length === 0) {
        const { data: studs } = await supabase
          .from('students').select('id, name, school, grade')
          .neq('enrollment_status', '퇴원').order('name');
        list = (studs || []) as StudentItem[];
      }
      setMyStudents(list);
    } catch (e) { console.error(e); }
    finally { setMyStudentsLoading(false); }
  }

  function openAddDialog() {
    setEntry({
      id: '', className: '', subject: SUBJECTS[0], dayOfWeek: 1, dayOfWeeks: [1],
      startTime: '16:00', endTime: '19:00', groupId: '',
      classroomId: matchedClassroom?.id || '',
      studentIds: [], studentNames: [], assignMode: 'students',
    });
    setEntryStudentSearch('');
    void loadMyStudents();
    setDialogOpen(true);
  }

  async function addEntry() {
    if (!entry.className.trim()) {
      toast({ title: '수업명을 입력해주세요', variant: 'destructive' });
      return;
    }
    const days = entry.dayOfWeeks.length > 0 ? entry.dayOfWeeks : [entry.dayOfWeek];
    if (days.length === 0) {
      toast({ title: '요일을 1개 이상 선택해주세요', variant: 'destructive' });
      return;
    }
    if (!user?.id) {
      toast({ title: '로그인 정보를 확인할 수 없습니다', variant: 'destructive' });
      return;
    }

    // Resolve student list for this entry
    let targetStudentIds: string[] = [];
    let targetStudentNames: Record<string, string> = {};
    if (entry.assignMode === 'group' && entry.groupId && entry.groupId !== 'none') {
      const g = groups.find((x) => x.id === entry.groupId);
      if (g) {
        targetStudentIds = g.members.map((m) => m.id);
        g.members.forEach((m) => { targetStudentNames[m.id] = m.name; });
      }
    } else if (entry.assignMode === 'students') {
      targetStudentIds = entry.studentIds;
      entry.studentIds.forEach((sid, i) => { targetStudentNames[sid] = entry.studentNames[i] || ''; });
    }

    // SCHEDULE-CONFLICT-CHECK-V2: 학생별 시간 겹침 검사 (중복 시 저장 차단)
    if (targetStudentIds.length > 0) {
      try {
        const { data: csRows } = await supabase
          .from('class_students')
          .select('student_id, class_id, classes(subject, name)')
          .in('student_id', targetStudentIds);
        const studentClassMap = new Map<string, { class_id: string; subject: string; name: string }[]>();
        (csRows || []).forEach((r: any) => {
          const arr = studentClassMap.get(r.student_id) || [];
          arr.push({ class_id: r.class_id, subject: r.classes?.subject || '', name: r.classes?.name || '' });
          studentClassMap.set(r.student_id, arr);
        });

        const conflicts: string[] = [];
        for (const d of days) {
          const overlapping = existingSchedules.filter((s: any) => {
            if (s.day_of_week !== d) return false;
            const sStart = (s.start_time || '').slice(0, 5);
            const sEnd = (s.end_time || '').slice(0, 5);
            return entry.startTime < sEnd && sStart < entry.endTime;
          });
          for (const sid of targetStudentIds) {
            const studentClasses = studentClassMap.get(sid) || [];
            for (const sch of overlapping) {
              const match = studentClasses.find((c) => c.class_id === sch.class_id);
              if (!match) continue;
              const dayLabel = DAYS_OF_WEEK.find((x) => x.value === d)?.label || '';
              const tag = match.subject === entry.subject ? '[동일과목 선배정]' : `[${match.subject}]`;
              conflicts.push(
                `• ${targetStudentNames[sid] || sid} — ${dayLabel} ${sch.start_time?.slice(0, 5)}–${sch.end_time?.slice(0, 5)} ${tag} ${match.name}`,
              );
            }
          }
        }

        if (conflicts.length > 0) {
          const preview = conflicts.slice(0, 10).join('\n');
          const more = conflicts.length > 10 ? `\n외 ${conflicts.length - 10}건` : '';
          window.alert(
            `⚠️ 시간표 중복 감지 — 저장이 취소되었습니다.\n\n다음 학생이 이미 같은 시간대에 배정되어 있습니다:\n\n${preview}${more}\n\n시간이나 학생 구성을 변경한 뒤 다시 시도해주세요.`,
          );
          toast({
            title: '시간표 중복으로 저장이 취소되었습니다',
            description: `${conflicts.length}건의 충돌이 있습니다.`,
            variant: 'destructive',
          });
          return;
        }
      } catch (e) {
        console.warn('conflict check failed', e);
      }
    }

    const newEntries = days.map(d => ({
      ...entry,
      id: crypto.randomUUID(),
      dayOfWeek: d,
      dayOfWeeks: [d],
    }));

    // 즉시 DB에 저장 (대기 목록 단계 제거)
    setSaving(true);
    try {
      for (const pe of newEntries) {
        const { data: newClass, error: classErr } = await supabase
          .from('classes')
          .insert({ name: pe.className, subject: pe.subject as any, teacher_id: user.id })
          .select('id').single();
        if (classErr) throw classErr;
        const classId = newClass.id;

        const cId = pe.classroomId && pe.classroomId !== 'none' ? pe.classroomId : null;
        const { data: schedData, error: schedErr } = await supabase.from('class_schedules').insert({
          class_id: classId, day_of_week: pe.dayOfWeek,
          start_time: pe.startTime, end_time: pe.endTime,
          teacher_id: user.id, classroom_id: cId,
        }).select('id').single();
        if (schedErr) throw schedErr;

        if (pe.assignMode === 'group' && pe.groupId && pe.groupId !== 'none') {
          const group = groups.find(g => g.id === pe.groupId);
          if (group && group.members.length > 0) {
            const inserts = group.members.map(m => ({ class_id: classId, student_id: m.id }));
            await supabase.from('class_students')
              .upsert(inserts, { onConflict: 'class_id,student_id', ignoreDuplicates: true });
            if (schedData) {
              await supabase.from('schedule_group_assignments')
                .upsert({ schedule_id: schedData.id, group_id: pe.groupId },
                  { onConflict: 'schedule_id,group_id', ignoreDuplicates: true });
            }
          }
        } else if (pe.assignMode === 'students' && pe.studentIds.length > 0) {
          const inserts = pe.studentIds.map(sid => ({ class_id: classId, student_id: sid }));
          await supabase.from('class_students')
            .upsert(inserts, { onConflict: 'class_id,student_id', ignoreDuplicates: true });
        }
      }

      toast({ title: `${newEntries.length}개 수업 일정 저장 완료` });
      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('수업 저장 오류:', error);
      toast({
        title: '저장 실패',
        description: error?.message || '알 수 없는 오류가 발생했습니다',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
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
        const { data: newClass, error: classErr } = await supabase
          .from('classes')
          .insert({ name: pe.className, subject: pe.subject as any, teacher_id: user.id })
          .select('id').single();
        if (classErr) throw classErr;
        const classId = newClass.id;

        const cId = pe.classroomId && pe.classroomId !== 'none' ? pe.classroomId : null;
        const { data: schedData, error: schedErr } = await supabase.from('class_schedules').insert({
          class_id: classId, day_of_week: pe.dayOfWeek,
          start_time: pe.startTime, end_time: pe.endTime,
          teacher_id: user.id, classroom_id: cId,
        }).select('id').single();
        if (schedErr) throw schedErr;

        // Assign students: either by group or by direct selection
        if (pe.assignMode === 'group' && pe.groupId && pe.groupId !== 'none') {
          const group = groups.find(g => g.id === pe.groupId);
          if (group && group.members.length > 0) {
            const inserts = group.members.map(m => ({ class_id: classId, student_id: m.id }));
            await supabase.from('class_students')
              .upsert(inserts, { onConflict: 'class_id,student_id', ignoreDuplicates: true });

            if (schedData) {
              await supabase.from('schedule_group_assignments')
                .upsert({ schedule_id: schedData.id, group_id: pe.groupId },
                  { onConflict: 'schedule_id,group_id', ignoreDuplicates: true });
            }
          }
        } else if (pe.assignMode === 'students' && pe.studentIds.length > 0) {
          const inserts = pe.studentIds.map(sid => ({ class_id: classId, student_id: sid }));
          await supabase.from('class_students')
            .upsert(inserts, { onConflict: 'class_id,student_id', ignoreDuplicates: true });
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
      const teacherIdToSave = isAdminUser
        ? (groupTeacherId || null)
        : (user?.id ?? null); // 비관리자는 항상 본인으로 고정
      if (editingGroup) {
        const { error } = await supabase.from('student_groups')
          .update({
            name: groupName.trim(),
            description: groupDesc.trim() || null,
            teacher_id: teacherIdToSave,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingGroup.id);
        if (error) throw error;
        toast({ title: '그룹 수정 완료' });
      } else {
        const { error } = await supabase.from('student_groups')
          .insert({
            name: groupName.trim(),
            description: groupDesc.trim() || null,
            created_by: user?.id ?? null,
            teacher_id: teacherIdToSave,
          });
        if (error) throw error;
        toast({ title: '그룹 생성 완료' });
      }
      setGroupDialogOpen(false);
      setEditingGroup(null);
      setGroupName('');
      setGroupDesc('');
      setGroupTeacherId('');
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
                        {pe.assignMode === 'group' && group && <span className="flex items-center gap-1"><FolderOpen className="w-3 h-3" />{group.name} ({group.members.length}명)</span>}
                        {pe.assignMode === 'students' && pe.studentIds.length > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" />학생 {pe.studentIds.length}명</span>}
                        {classroom && <span className="flex items-center gap-1">🏫 {classroom.name}</span>}
                      </div>
                      {pe.assignMode === 'group' && group && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {group.members.slice(0, 10).map(m => (
                            <span key={m.id} className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{m.name}</span>
                          ))}
                          {group.members.length > 10 && <span className="text-[11px] text-muted-foreground">+{group.members.length - 10}명</span>}
                        </div>
                      )}
                      {pe.assignMode === 'students' && pe.studentNames.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {pe.studentNames.slice(0, 10).map((n, i) => (
                            <span key={i} className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{n}</span>
                          ))}
                          {pe.studentNames.length > 10 && <span className="text-[11px] text-muted-foreground">+{pe.studentNames.length - 10}명</span>}
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
              setGroupTeacherId(isAdminUser ? '' : (user?.id ?? ''));
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
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold truncate">{group.name}</h4>
                      {group.teacher_name ? (
                        <p className="text-[11px] text-primary">담당: {group.teacher_name}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground/70">담당 미지정</p>
                      )}
                      {group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => {
                        setEditingGroup(group); setGroupName(group.name);
                        setGroupDesc(group.description || '');
                        setGroupTeacherId(group.teacher_id || (isAdminUser ? '' : (user?.id ?? '')));
                        setGroupDialogOpen(true);
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
              <Label>요일 (여러 개 선택 가능)</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_OF_WEEK.map(d => {
                  const checked = entry.dayOfWeeks.includes(d.value);
                  return (
                    <button
                      key={d.value} type="button"
                      onClick={() => {
                        const next = checked
                          ? entry.dayOfWeeks.filter(x => x !== d.value)
                          : [...entry.dayOfWeeks, d.value].sort((a, b) => a - b);
                        setEntry({ ...entry, dayOfWeeks: next, dayOfWeek: next[0] ?? 1 });
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs border transition-colors',
                        checked
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted border-input'
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              {entry.dayOfWeeks.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  선택한 {entry.dayOfWeeks.length}개 요일에 동일한 수업이 각각 추가됩니다.
                </p>
              )}
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
              <Label>학생 배정 방식</Label>
              <div className="flex gap-2">
                <Button
                  type="button" variant={entry.assignMode === 'students' ? 'default' : 'outline'}
                  size="sm" className="flex-1 h-8 text-xs"
                  onClick={() => setEntry({ ...entry, assignMode: 'students' })}
                >
                  <Users className="w-3 h-3 mr-1" />학생 직접 선택
                </Button>
                <Button
                  type="button" variant={entry.assignMode === 'group' ? 'default' : 'outline'}
                  size="sm" className="flex-1 h-8 text-xs"
                  onClick={() => setEntry({ ...entry, assignMode: 'group' })}
                >
                  <FolderOpen className="w-3 h-3 mr-1" />그룹(반)으로 배정
                </Button>
              </div>
            </div>

            {entry.assignMode === 'group' ? (
              <div className="space-y-2">
                <Label>그룹(반) 선택</Label>
                <Select value={entry.groupId || 'none'} onValueChange={v => setEntry({ ...entry, groupId: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="그룹 선택" /></SelectTrigger>
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
            ) : (
              <div className="space-y-2">
                <Label>담당 학생 선택 ({entry.studentIds.length}명)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="학생 이름 검색..."
                    value={entryStudentSearch}
                    onChange={e => setEntryStudentSearch(e.target.value)}
                    className="pl-10 h-9"
                  />
                </div>
                {entry.studentIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {entry.studentNames.map((n, i) => (
                      <button
                        key={entry.studentIds[i]} type="button"
                        onClick={() => {
                          const sid = entry.studentIds[i];
                          setEntry({
                            ...entry,
                            studentIds: entry.studentIds.filter(x => x !== sid),
                            studentNames: entry.studentNames.filter((_, idx) => idx !== i),
                          });
                        }}
                        className="text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded hover:bg-primary/20"
                      >
                        {n} ✕
                      </button>
                    ))}
                  </div>
                )}
                <div className="max-h-[180px] overflow-y-auto border rounded-md divide-y">
                  {myStudentsLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
                  ) : (
                    myStudents
                      .filter(s => !entryStudentSearch.trim() || s.name.toLowerCase().includes(entryStudentSearch.toLowerCase()))
                      .slice(0, 50)
                      .map(s => {
                        const selected = entry.studentIds.includes(s.id);
                        return (
                          <button
                            key={s.id} type="button"
                            onClick={() => {
                              if (selected) {
                                setEntry({
                                  ...entry,
                                  studentIds: entry.studentIds.filter(x => x !== s.id),
                                  studentNames: entry.studentNames.filter((_, i) => entry.studentIds[i] !== s.id),
                                });
                              } else {
                                setEntry({
                                  ...entry,
                                  studentIds: [...entry.studentIds, s.id],
                                  studentNames: [...entry.studentNames, s.name],
                                });
                              }
                            }}
                            className={cn(
                              'w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 flex items-center justify-between',
                              selected && 'bg-primary/5'
                            )}
                          >
                            <span>{s.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {[s.school, s.grade].filter(Boolean).join(' · ')}
                            </span>
                          </button>
                        );
                      })
                  )}
                </div>
              </div>
            )}

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
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>취소</Button>
              <Button onClick={addEntry} disabled={!entry.className.trim() || saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                {saving ? '저장 중...' : '저장'}
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
              <Label>담당 선생님 {isAdminUser ? '(선택)' : ''}</Label>
              {isAdminUser ? (
                <Select value={groupTeacherId || 'none'} onValueChange={(v) => setGroupTeacherId(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="담당 선생님 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">미지정</SelectItem>
                    {teacherOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-xs text-muted-foreground px-1">
                  {teacherName || '본인'} 선생님으로 자동 지정됩니다.
                </div>
              )}
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
