import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Users, Loader2, AlertTriangle, FolderOpen, Trash2, UserMinus } from 'lucide-react';
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

interface ConflictDetail {
  studentId: string;
  studentName: string;
  conflictClassName: string;
  conflictTime: string;
  conflictDay: string;
}

interface AssignedGroup {
  assignmentId: string;
  group: GroupInfo;
  exceptions: string[]; // excluded student IDs
}

interface TeacherGroupAssignmentProps {
  classId: string;
  className: string;
  onDataChange?: () => void;
}

export function TeacherGroupAssignment({ classId, className, onDataChange }: TeacherGroupAssignmentProps) {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [assignedGroups, setAssignedGroups] = useState<AssignedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const { toast } = useToast();

  // For conflict detection
  const [classSchedules, setClassSchedules] = useState<{
    scheduleId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }[]>([]);
  const [allStudentSchedules, setAllStudentSchedules] = useState<{
    studentId: string;
    className: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }[]>([]);

  useEffect(() => {
    fetchData();
  }, [classId]);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Get all groups with members
      const [groupsRes, membersRes] = await Promise.all([
        supabase.from('student_groups').select('id, name').order('name'),
        supabase.from('student_group_members').select('group_id, student_id'),
      ]);

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

      // 2. Get schedules for this class (for conflict detection)
      const { data: schedData } = await supabase
        .from('class_schedules')
        .select('id, day_of_week, start_time, end_time')
        .eq('class_id', classId)
        .eq('is_active', true);

      const parsedClassSchedules = (schedData || []).map((s: any) => ({
        scheduleId: s.id,
        dayOfWeek: s.day_of_week,
        startTime: s.start_time,
        endTime: s.end_time,
      }));
      setClassSchedules(parsedClassSchedules);

      // 3. Get existing group assignments for this class's schedules
      const scheduleIds = parsedClassSchedules.map(s => s.scheduleId);
      let assignedGroupsList: AssignedGroup[] = [];

      if (scheduleIds.length > 0) {
        const { data: sgaData } = await supabase
          .from('schedule_group_assignments')
          .select('id, schedule_id, group_id')
          .in('schedule_id', scheduleIds);

        const assignedGroupIds = [...new Set((sgaData || []).map((a: any) => a.group_id))];
        
        // Get exceptions
        const { data: excData } = await supabase
          .from('schedule_group_exceptions')
          .select('schedule_id, group_id, student_id')
          .in('schedule_id', scheduleIds);

        const excMap: Record<string, string[]> = {};
        (excData || []).forEach((e: any) => {
          const key = `${e.schedule_id}_${e.group_id}`;
          if (!excMap[key]) excMap[key] = [];
          excMap[key].push(e.student_id);
        });

        (sgaData || []).forEach((a: any) => {
          const gInfo = (groupsRes.data || []).find((g: any) => g.id === a.group_id);
          if (!gInfo) return;
          const key = `${a.schedule_id}_${a.group_id}`;
          assignedGroupsList.push({
            assignmentId: a.id,
            group: {
              id: gInfo.id,
              name: gInfo.name,
              members: membersMap[gInfo.id] || [],
            },
            exceptions: excMap[key] || [],
          });
        });
      }
      setAssignedGroups(assignedGroupsList);

      // 4. Fetch all student schedules for conflict detection
      if (studentIds.length > 0) {
        const { data: csData } = await supabase
          .from('class_students')
          .select('student_id, class_id')
          .in('student_id', studentIds);

        const classIdsAll = [...new Set((csData || []).map((cs: any) => cs.class_id))];
        
        if (classIdsAll.length > 0) {
          const { data: allScheds } = await supabase
            .from('class_schedules')
            .select('class_id, day_of_week, start_time, end_time, classes(name)')
            .eq('is_active', true)
            .in('class_id', classIdsAll);

          const classStudentMap: Record<string, string[]> = {};
          (csData || []).forEach((cs: any) => {
            if (!classStudentMap[cs.class_id]) classStudentMap[cs.class_id] = [];
            classStudentMap[cs.class_id].push(cs.student_id);
          });

          const result: typeof allStudentSchedules = [];
          (allScheds || []).forEach((s: any) => {
            const students = classStudentMap[s.class_id] || [];
            students.forEach(sid => {
              result.push({
                studentId: sid,
                className: (s as any).classes?.name || '',
                dayOfWeek: s.day_of_week,
                startTime: s.start_time,
                endTime: s.end_time,
              });
            });
          });
          setAllStudentSchedules(result);
        }
      }
    } catch (error) {
      console.error('Error fetching group data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Detect conflicts for selected group
  const conflicts = useMemo<ConflictDetail[]>(() => {
    if (!selectedGroupId) return [];
    const group = groups.find(g => g.id === selectedGroupId);
    if (!group || classSchedules.length === 0) return [];

    const result: ConflictDetail[] = [];

    for (const member of group.members) {
      for (const targetSched of classSchedules) {
        const targetDay = targetSched.dayOfWeek;
        const targetStart = targetSched.startTime.slice(0, 5);
        const targetEnd = targetSched.endTime.slice(0, 5);

        const existingScheds = allStudentSchedules.filter(s => s.studentId === member.id);
        for (const existing of existingScheds) {
          if (existing.className === className) continue; // same class
          if (
            existing.dayOfWeek === targetDay &&
            targetStart < existing.endTime.slice(0, 5) &&
            existing.startTime.slice(0, 5) < targetEnd
          ) {
            const dayLabel = DAYS_OF_WEEK.find(d => d.value === existing.dayOfWeek)?.label || '';
            result.push({
              studentId: member.id,
              studentName: member.name,
              conflictClassName: existing.className,
              conflictTime: `${dayLabel} ${existing.startTime.slice(0, 5)}–${existing.endTime.slice(0, 5)}`,
              conflictDay: dayLabel,
            });
          }
        }
      }
    }

    return result;
  }, [selectedGroupId, groups, classSchedules, allStudentSchedules, className]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const alreadyAssignedGroupIds = new Set(assignedGroups.map(ag => ag.group.id));
  const availableGroups = groups.filter(g => !alreadyAssignedGroupIds.has(g.id));

  async function handleAssign() {
    if (!selectedGroupId || classSchedules.length === 0) return;

    if (conflicts.length > 0) {
      const uniqueStudents = [...new Set(conflicts.map(c => c.studentName))];
      const msg = `${uniqueStudents.join(', ')} 학생이 같은 시간대에 다른 수업이 있습니다. 그래도 배정하시겠습니까?`;
      if (!confirm(msg)) return;
    }

    setSaving(true);
    try {
      const group = groups.find(g => g.id === selectedGroupId);
      if (!group) throw new Error('그룹을 찾을 수 없습니다');

      // Assign to all schedules of this class
      for (const sched of classSchedules) {
        await supabase
          .from('schedule_group_assignments')
          .upsert(
            { schedule_id: sched.scheduleId, group_id: selectedGroupId },
            { onConflict: 'schedule_id,group_id', ignoreDuplicates: true }
          );
      }

      // Add members to class_students
      if (group.members.length > 0) {
        const inserts = group.members.map(m => ({
          class_id: classId,
          student_id: m.id,
        }));
        await supabase.from('class_students').upsert(inserts, { onConflict: 'class_id,student_id', ignoreDuplicates: true });
      }

      toast({ title: '그룹 배정 완료', description: `${group.name} → ${className}` });
      setSelectedGroupId('');
      fetchData();
      onDataChange?.();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveGroup(ag: AssignedGroup) {
    if (!confirm(`${ag.group.name} 그룹을 이 수업에서 해제하시겠습니까?`)) return;
    setSaving(true);
    try {
      // Remove all schedule_group_assignments for this class
      for (const sched of classSchedules) {
        await supabase.from('schedule_group_assignments')
          .delete()
          .eq('schedule_id', sched.scheduleId)
          .eq('group_id', ag.group.id);
        
        await supabase.from('schedule_group_exceptions')
          .delete()
          .eq('schedule_id', sched.scheduleId)
          .eq('group_id', ag.group.id);
      }

      // Remove members from class_students
      for (const member of ag.group.members) {
        if (!ag.exceptions.includes(member.id)) {
          await supabase.from('class_students')
            .delete()
            .eq('class_id', classId)
            .eq('student_id', member.id);
        }
      }

      toast({ title: '그룹 해제 완료' });
      fetchData();
      onDataChange?.();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">그룹(반) 배정</span>
      </div>

      {/* Currently assigned groups */}
      {assignedGroups.length > 0 && (
        <div className="space-y-2">
          {assignedGroups.map(ag => (
            <div key={ag.assignmentId} className="border rounded-lg p-2.5 bg-muted/30">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                    <FolderOpen className="w-3 h-3 mr-1" />
                    {ag.group.name}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {ag.group.members.length - ag.exceptions.length}명
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => handleRemoveGroup(ag)}
                  disabled={saving}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {ag.group.members.map(m => (
                  <span
                    key={m.id}
                    className={cn(
                      'text-[11px] px-1.5 py-0.5 rounded',
                      ag.exceptions.includes(m.id)
                        ? 'bg-destructive/10 text-destructive line-through'
                        : 'bg-muted text-foreground'
                    )}
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add group */}
      {availableGroups.length > 0 ? (
        <div className="space-y-2">
          <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="그룹 선택..." />
            </SelectTrigger>
            <SelectContent>
              {availableGroups.map(g => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name} ({g.members.length}명)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Group member preview */}
          {selectedGroup && (
            <div className="border rounded-md p-2 bg-muted/20">
              <div className="text-xs font-medium mb-1.5 text-muted-foreground">
                멤버 ({selectedGroup.members.length}명)
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedGroup.members.map(m => {
                  const hasConflict = conflicts.some(c => c.studentId === m.id);
                  return (
                    <span
                      key={m.id}
                      className={cn(
                        'text-[11px] px-1.5 py-0.5 rounded',
                        hasConflict ? 'bg-destructive/10 text-destructive font-medium' : 'bg-muted'
                      )}
                    >
                      {hasConflict && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
                      {m.name}
                    </span>
                  );
                })}
              </div>

              {/* Conflict warnings */}
              {conflicts.length > 0 && (
                <div className="bg-destructive/5 border border-destructive/20 rounded p-2 mb-2">
                  <div className="flex items-center gap-1 text-xs font-medium text-destructive mb-1">
                    <AlertTriangle className="w-3 h-3" />
                    시간 충돌 감지 ({new Set(conflicts.map(c => c.studentId)).size}명)
                  </div>
                  <div className="space-y-0.5">
                    {conflicts.map((c, i) => (
                      <div key={i} className="text-[11px] text-destructive/80">
                        · {c.studentName}: {c.conflictClassName} ({c.conflictTime})
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                size="sm"
                className="w-full h-7 text-xs"
                variant={conflicts.length > 0 ? 'destructive' : 'default'}
                onClick={handleAssign}
                disabled={saving}
              >
                {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                {conflicts.length > 0 ? '충돌 무시하고 배정' : '그룹 배정'}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {groups.length === 0 ? '등록된 그룹이 없습니다' : '모든 그룹이 이미 배정되어 있습니다'}
        </p>
      )}
    </div>
  );
}
