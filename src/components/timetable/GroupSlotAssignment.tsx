import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Users,
  Loader2,
  ArrowRight,
  AlertTriangle,
  UserMinus,
  Plus,
  Clock,
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

interface GroupInfo {
  id: string;
  name: string;
  members: { id: string; name: string }[];
}

interface ScheduleSlot {
  id: string;
  classId: string;
  className: string;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  teacherId: string;
  teacherName: string;
}

interface GroupAssignment {
  id: string;
  scheduleId: string;
  groupId: string;
}

interface GroupException {
  id: string;
  scheduleId: string;
  groupId: string;
  studentId: string;
  reason: string | null;
}

interface TeacherInfo {
  id: string;
  name: string;
}

interface ConflictDetail {
  studentId: string;
  studentName: string;
  conflictSlot: ScheduleSlot;
}

interface GroupSlotAssignmentProps {
  onDataChange?: () => void;
}

export function GroupSlotAssignment({ onDataChange }: GroupSlotAssignmentProps) {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [schedules, setSchedules] = useState<ScheduleSlot[]>([]);
  const [assignments, setAssignments] = useState<GroupAssignment[]>([]);
  const [exceptions, setExceptions] = useState<GroupException[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // All student assignments (for conflict detection)
  const [allStudentAssignments, setAllStudentAssignments] = useState<
    { studentId: string; classId: string; scheduleId: string }[]
  >([]);

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('all');
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [includedMemberIds, setIncludedMemberIds] = useState<Set<string>>(new Set());

  // Move dialog
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveAssignment, setMoveAssignment] = useState<GroupAssignment | null>(null);
  const [moveTargetScheduleId, setMoveTargetScheduleId] = useState<string>('');

  // Exception dialog
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [exceptionAssignment, setExceptionAssignment] = useState<GroupAssignment | null>(null);
  const [excludedStudentIds, setExcludedStudentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [groupsRes, membersRes, schedulesRes, assignmentsRes, exceptionsRes] = await Promise.all([
        supabase.from('student_groups').select('id, name').order('name'),
        supabase.from('student_group_members').select('group_id, student_id'),
        supabase.from('class_schedules').select(`
          id, class_id, day_of_week, start_time, end_time, teacher_id,
          classes (id, name, subject, teacher_id)
        `).eq('is_active', true).order('day_of_week').order('start_time'),
        supabase.from('schedule_group_assignments').select('id, schedule_id, group_id'),
        supabase.from('schedule_group_exceptions').select('id, schedule_id, group_id, student_id, reason'),
      ]);

      // Fetch student names
      const studentIds = [...new Set((membersRes.data || []).map((m: any) => m.student_id))];
      let studentMap: Record<string, string> = {};
      if (studentIds.length > 0) {
        const { data: studData } = await supabase.from('students').select('id, name').in('id', studentIds);
        (studData || []).forEach((s: any) => { studentMap[s.id] = s.name; });
      }

      // Build groups with members
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
        members: (membersMap[g.id] || []).sort((a: any, b: any) => a.name.localeCompare(b.name)),
      })));

      // Fetch teacher names
      const teacherIds = [...new Set((schedulesRes.data || []).map((s: any) => s.teacher_id).filter(Boolean))];
      let teacherMap: Record<string, string> = {};
      if (teacherIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', teacherIds);
        (profiles || []).forEach((p: any) => { teacherMap[p.id] = p.full_name; });
      }

      const parsedSchedules = (schedulesRes.data || []).map((s: any) => ({
        id: s.id,
        classId: s.class_id,
        className: s.classes?.name || '',
        subject: s.classes?.subject || '',
        dayOfWeek: s.day_of_week,
        startTime: s.start_time,
        endTime: s.end_time,
        teacherId: s.teacher_id || '',
        teacherName: teacherMap[s.teacher_id] || '미배정',
      }));

      setSchedules(parsedSchedules);

      setAssignments((assignmentsRes.data || []).map((a: any) => ({
        id: a.id,
        scheduleId: a.schedule_id,
        groupId: a.group_id,
      })));

      setExceptions((exceptionsRes.data || []).map((e: any) => ({
        id: e.id,
        scheduleId: e.schedule_id,
        groupId: e.group_id,
        studentId: e.student_id,
        reason: e.reason,
      })));

      // Fetch all class_students for conflict detection
      if (studentIds.length > 0) {
        const { data: csData } = await supabase
          .from('class_students')
          .select('student_id, class_id')
          .in('student_id', studentIds);
        
        // Map class_id to schedule_id
        const classToSchedules: Record<string, string[]> = {};
        parsedSchedules.forEach(s => {
          if (!classToSchedules[s.classId]) classToSchedules[s.classId] = [];
          classToSchedules[s.classId].push(s.id);
        });

        const studentAssignments: { studentId: string; classId: string; scheduleId: string }[] = [];
        (csData || []).forEach((cs: any) => {
          const schedIds = classToSchedules[cs.class_id] || [];
          schedIds.forEach(sid => {
            studentAssignments.push({ studentId: cs.student_id, classId: cs.class_id, scheduleId: sid });
          });
        });
        setAllStudentAssignments(studentAssignments);
      }
    } catch (error) {
      console.error('Error fetching group assignment data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Detect conflicts for a group being assigned to a target schedule
  const conflicts = useMemo<ConflictDetail[]>(() => {
    if (!selectedGroupId || !selectedScheduleId) return [];
    const group = groups.find(g => g.id === selectedGroupId);
    const targetSchedule = schedules.find(s => s.id === selectedScheduleId);
    if (!group || !targetSchedule) return [];

    const targetDay = targetSchedule.dayOfWeek;
    const targetStart = targetSchedule.startTime.slice(0, 5);
    const targetEnd = targetSchedule.endTime.slice(0, 5);

    const result: ConflictDetail[] = [];

    for (const member of group.members) {
      // Find all schedules this student is already in
      const memberScheduleIds = allStudentAssignments
        .filter(a => a.studentId === member.id)
        .map(a => a.scheduleId);

      for (const sid of memberScheduleIds) {
        if (sid === selectedScheduleId) continue; // skip same slot
        const existingSlot = schedules.find(s => s.id === sid);
        if (!existingSlot) continue;

        // Check same day + time overlap
        if (
          existingSlot.dayOfWeek === targetDay &&
          targetStart < existingSlot.endTime.slice(0, 5) &&
          existingSlot.startTime.slice(0, 5) < targetEnd
        ) {
          result.push({
            studentId: member.id,
            studentName: member.name,
            conflictSlot: existingSlot,
          });
        }
      }
    }

    return result;
  }, [selectedGroupId, selectedScheduleId, groups, schedules, allStudentAssignments]);

  // Teachers list derived from schedules
  const availableTeachers = useMemo<TeacherInfo[]>(() => {
    const map = new Map<string, string>();
    schedules.forEach(s => {
      if (s.teacherId) map.set(s.teacherId, s.teacherName);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [schedules]);

  // Filtered schedules by teacher
  const filteredSchedules = useMemo(() => {
    if (selectedTeacherId === 'all') return schedules;
    return schedules.filter(s => s.teacherId === selectedTeacherId);
  }, [schedules, selectedTeacherId]);

  // Assign group to schedule
  async function handleAssign() {
    if (!selectedGroupId || !selectedScheduleId) return;

    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) return;

    const includedMembers = group.members.filter(m => includedMemberIds.has(m.id));
    const excludedMembers = group.members.filter(m => !includedMemberIds.has(m.id));

    if (includedMembers.length === 0) {
      toast({ title: '학생을 1명 이상 선택해주세요', variant: 'destructive' });
      return;
    }

    // Warn about conflicts (only for included members)
    const includedConflicts = conflicts.filter(c => includedMemberIds.has(c.studentId));
    if (includedConflicts.length > 0) {
      const uniqueStudents = [...new Set(includedConflicts.map(c => c.studentName))];
      const msg = `${uniqueStudents.join(', ')} 학생이 같은 시간대에 이미 다른 수업이 있습니다. 그래도 배정하시겠습니까?`;
      if (!confirm(msg)) return;
    }

    setSaving(true);
    try {
      const { data: assignRow, error: assignErr } = await supabase
        .from('schedule_group_assignments')
        .insert({ schedule_id: selectedScheduleId, group_id: selectedGroupId })
        .select('id')
        .single();
      if (assignErr) {
        if (assignErr.code === '23505') {
          toast({ title: '이미 배정됨', description: '이 그룹은 이미 해당 슬롯에 배정되어 있습니다.', variant: 'destructive' });
          setSaving(false);
          return;
        }
        throw assignErr;
      }

      const schedule = schedules.find(s => s.id === selectedScheduleId);

      // Save exceptions for excluded members
      if (excludedMembers.length > 0) {
        const excInserts = excludedMembers.map(m => ({
          schedule_id: selectedScheduleId,
          group_id: selectedGroupId,
          student_id: m.id,
          reason: '슬롯 배정 시 제외',
        }));
        await supabase.from('schedule_group_exceptions').insert(excInserts);
      }

      // Only enroll included members in class_students
      if (schedule && includedMembers.length > 0) {
        const inserts = includedMembers.map(m => ({
          class_id: schedule.classId,
          student_id: m.id,
        }));
        await supabase.from('class_students').upsert(inserts, { onConflict: 'class_id,student_id', ignoreDuplicates: true });
      }

      toast({
        title: '그룹 배정 완료',
        description: `${group.name} → ${schedule?.className} (${includedMembers.length}명${excludedMembers.length > 0 ? `, ${excludedMembers.length}명 제외` : ''})`,
      });
      setAssignDialogOpen(false);
      setSelectedGroupId('');
      setSelectedScheduleId('');
      setSelectedTeacherId('all');
      setIncludedMemberIds(new Set());
      fetchAll();
      onDataChange?.();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // Remove group from schedule
  async function handleRemoveAssignment(assignment: GroupAssignment) {
    if (!confirm('이 그룹의 슬롯 배정을 해제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('schedule_group_assignments').delete().eq('id', assignment.id);
      if (error) throw error;

      await supabase.from('schedule_group_exceptions')
        .delete()
        .eq('schedule_id', assignment.scheduleId)
        .eq('group_id', assignment.groupId);

      toast({ title: '배정 해제 완료' });
      fetchAll();
      onDataChange?.();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    }
  }

  // Move group to different schedule
  async function handleMove() {
    if (!moveAssignment || !moveTargetScheduleId) return;
    setSaving(true);
    try {
      const group = groups.find(g => g.id === moveAssignment.groupId);
      const oldSchedule = schedules.find(s => s.id === moveAssignment.scheduleId);
      const newSchedule = schedules.find(s => s.id === moveTargetScheduleId);

      if (!group || !oldSchedule || !newSchedule) throw new Error('데이터를 찾을 수 없습니다');

      const activeExceptions = exceptions.filter(
        e => e.scheduleId === moveAssignment.scheduleId && e.groupId === moveAssignment.groupId
      );
      const excludedIds = new Set(activeExceptions.map(e => e.studentId));
      const activeMembers = group.members.filter(m => !excludedIds.has(m.id));

      for (const member of activeMembers) {
        await supabase.from('class_students').delete()
          .eq('class_id', oldSchedule.classId)
          .eq('student_id', member.id);
      }

      const { error: updateErr } = await supabase
        .from('schedule_group_assignments')
        .update({ schedule_id: moveTargetScheduleId })
        .eq('id', moveAssignment.id);
      if (updateErr) throw updateErr;

      const newInserts = activeMembers.map(m => ({
        class_id: newSchedule.classId,
        student_id: m.id,
      }));
      if (newInserts.length > 0) {
        await supabase.from('class_students').upsert(newInserts, { onConflict: 'class_id,student_id', ignoreDuplicates: true });
      }

      if (activeExceptions.length > 0) {
        for (const exc of activeExceptions) {
          await supabase.from('schedule_group_exceptions')
            .update({ schedule_id: moveTargetScheduleId })
            .eq('id', exc.id);
        }
      }

      toast({ title: '그룹 이동 완료', description: `${group.name}: ${oldSchedule.className} → ${newSchedule.className}` });
      setMoveDialogOpen(false);
      setMoveAssignment(null);
      setMoveTargetScheduleId('');
      fetchAll();
      onDataChange?.();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // Save exceptions
  async function handleSaveExceptions() {
    if (!exceptionAssignment) return;
    setSaving(true);
    try {
      const { scheduleId, groupId } = exceptionAssignment;

      await supabase.from('schedule_group_exceptions')
        .delete()
        .eq('schedule_id', scheduleId)
        .eq('group_id', groupId);

      if (excludedStudentIds.size > 0) {
        const inserts = [...excludedStudentIds].map(sid => ({
          schedule_id: scheduleId,
          group_id: groupId,
          student_id: sid,
        }));
        const { error } = await supabase.from('schedule_group_exceptions').insert(inserts);
        if (error) throw error;
      }

      const group = groups.find(g => g.id === groupId);
      const schedule = schedules.find(s => s.id === scheduleId);
      if (group && schedule) {
        for (const sid of excludedStudentIds) {
          await supabase.from('class_students').delete()
            .eq('class_id', schedule.classId)
            .eq('student_id', sid);
        }
        const nonExcluded = group.members.filter(m => !excludedStudentIds.has(m.id));
        if (nonExcluded.length > 0) {
          await supabase.from('class_students').upsert(
            nonExcluded.map(m => ({ class_id: schedule.classId, student_id: m.id })),
            { onConflict: 'class_id,student_id', ignoreDuplicates: true }
          );
        }
      }

      toast({ title: '예외 설정 저장 완료' });
      setExceptionDialogOpen(false);
      fetchAll();
      onDataChange?.();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function formatSlotLabel(s: ScheduleSlot) {
    const day = DAYS_OF_WEEK.find(d => d.value === s.dayOfWeek)?.label || '';
    return `${day} ${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)} ${s.className} (${s.teacherName})`;
  }

  // Current assignments grouped by group
  const assignmentsByGroup = useMemo(() => {
    const map: Record<string, { group: GroupInfo; slots: { assignment: GroupAssignment; schedule: ScheduleSlot; exceptions: GroupException[] }[] }> = {};
    assignments.forEach(a => {
      const group = groups.find(g => g.id === a.groupId);
      const schedule = schedules.find(s => s.id === a.scheduleId);
      if (!group || !schedule) return;
      if (!map[a.groupId]) map[a.groupId] = { group, slots: [] };
      const slotExceptions = exceptions.filter(e => e.scheduleId === a.scheduleId && e.groupId === a.groupId);
      map[a.groupId].slots.push({ assignment: a, schedule, exceptions: slotExceptions });
    });
    return map;
  }, [assignments, groups, schedules, exceptions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">그룹 ↔ 슬롯 배정</span>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setSelectedGroupId('');
            setSelectedTeacherId('all');
            setSelectedScheduleId('');
            setAssignDialogOpen(true);
          }}
          disabled={groups.length === 0}
        >
          <Plus className="w-3 h-3 mr-1" />
          그룹 배정
        </Button>
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          먼저 그룹을 생성해주세요.
        </p>
      )}

      {Object.entries(assignmentsByGroup).length === 0 && groups.length > 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          배정된 그룹이 없습니다. 위 버튼으로 그룹을 슬롯에 배정하세요.
        </p>
      )}

      {Object.entries(assignmentsByGroup).map(([groupId, { group, slots }]) => (
        <div key={groupId} className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{group.name}</span>
            <Badge variant="outline" className="text-xs">{group.members.length}명</Badge>
          </div>
          <div className="p-3 space-y-2">
            {slots.map(({ assignment, schedule, exceptions: slotExceptions }) => (
              <div key={assignment.id} className="flex items-center justify-between gap-2 p-2 bg-card rounded border">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs truncate">{formatSlotLabel(schedule)}</span>
                  {slotExceptions.length > 0 && (
                    <Badge variant="outline" className="text-xs shrink-0 text-amber-600">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {slotExceptions.length}명 예외
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setExceptionAssignment(assignment);
                      setExcludedStudentIds(new Set(slotExceptions.map(e => e.studentId)));
                      setExceptionDialogOpen(true);
                    }}
                    title="예외 설정"
                  >
                    <UserMinus className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setMoveAssignment(assignment);
                      setMoveTargetScheduleId('');
                      setMoveDialogOpen(true);
                    }}
                    title="다른 슬롯으로 이동"
                  >
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive"
                    onClick={() => handleRemoveAssignment(assignment)}
                    title="배정 해제"
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Assign dialog - with teacher filter & conflict detection */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>그룹 슬롯 배정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Group selection */}
            <div className="space-y-2">
              <Label>그룹 선택</Label>
              <Select value={selectedGroupId} onValueChange={(v) => { setSelectedGroupId(v); setSelectedScheduleId(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="그룹 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({g.members.length}명)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedGroupId && (() => {
                const group = groups.find(g => g.id === selectedGroupId);
                if (!group) return null;
                return (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {group.members.slice(0, 10).map(m => (
                      <span key={m.id} className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.name}</span>
                    ))}
                    {group.members.length > 10 && (
                      <span className="text-xs text-muted-foreground">+{group.members.length - 10}명</span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Teacher filter */}
            <div className="space-y-2">
              <Label>선생님 필터</Label>
              <Select value={selectedTeacherId} onValueChange={(v) => { setSelectedTeacherId(v); setSelectedScheduleId(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="선생님 선택..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 선생님</SelectItem>
                  {availableTeachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Slot selection */}
            <div className="space-y-2">
              <Label>슬롯 선택</Label>
              <Select value={selectedScheduleId} onValueChange={setSelectedScheduleId}>
                <SelectTrigger>
                  <SelectValue placeholder="슬롯 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredSchedules.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatSlotLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conflict warnings */}
            {conflicts.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  시간표 충돌 감지 ({[...new Set(conflicts.map(c => c.studentId))].length}명)
                </div>
                <div className="space-y-1 max-h-[150px] overflow-y-auto">
                  {conflicts.map((c, i) => {
                    const day = DAYS_OF_WEEK.find(d => d.value === c.conflictSlot.dayOfWeek)?.label || '';
                    return (
                      <div key={i} className="text-xs text-destructive/80">
                        <span className="font-medium">{c.studentName}</span>
                        {' → '}
                        {c.conflictSlot.className} ({day} {c.conflictSlot.startTime.slice(0, 5)}–{c.conflictSlot.endTime.slice(0, 5)})
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>취소</Button>
              <Button
                onClick={handleAssign}
                disabled={saving || !selectedGroupId || !selectedScheduleId}
                variant={conflicts.length > 0 ? 'destructive' : 'default'}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {conflicts.length > 0 ? '충돌 무시 배정' : '배정'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>그룹 일괄 이동</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {moveAssignment && (
              <div className="text-sm text-muted-foreground">
                <strong>{groups.find(g => g.id === moveAssignment.groupId)?.name}</strong>을(를)
                다른 슬롯으로 이동합니다. 모든 멤버의 시간표가 함께 변경됩니다.
              </div>
            )}
            <div className="space-y-2">
              <Label>이동할 슬롯</Label>
              <Select value={moveTargetScheduleId} onValueChange={setMoveTargetScheduleId}>
                <SelectTrigger>
                  <SelectValue placeholder="슬롯 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {schedules
                    .filter(s => s.id !== moveAssignment?.scheduleId)
                    .map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {formatSlotLabel(s)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>취소</Button>
              <Button onClick={handleMove} disabled={saving || !moveTargetScheduleId}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                이동
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Exception dialog */}
      <Dialog open={exceptionDialogOpen} onOpenChange={setExceptionDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="w-5 h-5" />
              개별 예외 설정
            </DialogTitle>
          </DialogHeader>
          {exceptionAssignment && (() => {
            const group = groups.find(g => g.id === exceptionAssignment.groupId);
            const schedule = schedules.find(s => s.id === exceptionAssignment.scheduleId);
            return (
              <div className="space-y-4 mt-2">
                <div className="text-sm text-muted-foreground">
                  <strong>{group?.name}</strong> — {schedule && formatSlotLabel(schedule)}
                </div>
                <p className="text-xs text-muted-foreground">
                  체크한 학생은 이 시간대에서 제외됩니다.
                </p>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {group?.members.map(m => {
                    const isExcluded = excludedStudentIds.has(m.id);
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted/50',
                          isExcluded && 'bg-destructive/5 border border-destructive/20'
                        )}
                        onClick={() => {
                          setExcludedStudentIds(prev => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          });
                        }}
                      >
                        <Checkbox checked={isExcluded} />
                        <span className={cn('text-sm', isExcluded && 'line-through text-muted-foreground')}>
                          {m.name}
                        </span>
                        {isExcluded && (
                          <Badge variant="outline" className="text-xs text-destructive ml-auto">제외</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={() => setExceptionDialogOpen(false)}>취소</Button>
                  <Button onClick={handleSaveExceptions} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    저장
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
