import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Plus,
  Trash2,
  Pencil,
  Users,
  Search,
  Loader2,
  FolderOpen,
  X,
  UserPlus,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudentGroup {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  members: { id: string; name: string }[];
}

interface Student {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
}

export function StudentGroupManager() {
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StudentGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Member management
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [currentMembers, setCurrentMembers] = useState<Set<string>>(new Set());
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    fetchGroups();
  }, []);

  async function fetchGroups() {
    setLoading(true);
    try {
      const { data: groupsData, error } = await supabase
        .from('student_groups')
        .select('id, name, description')
        .order('name');
      if (error) throw error;

      const groupIds = (groupsData || []).map((g: any) => g.id);
      let membersMap: Record<string, { id: string; name: string }[]> = {};

      if (groupIds.length > 0) {
        const { data: membersData } = await supabase
          .from('student_group_members')
          .select('group_id, student_id')
          .in('group_id', groupIds);

        const studentIds = [...new Set((membersData || []).map((m: any) => m.student_id))];
        let studentMap: Record<string, string> = {};
        if (studentIds.length > 0) {
          const { data: studentsData } = await supabase
            .from('students')
            .select('id, name')
            .in('id', studentIds);
          (studentsData || []).forEach((s: any) => { studentMap[s.id] = s.name; });
        }

        (membersData || []).forEach((m: any) => {
          if (!membersMap[m.group_id]) membersMap[m.group_id] = [];
          if (studentMap[m.student_id]) {
            membersMap[m.group_id].push({ id: m.student_id, name: studentMap[m.student_id] });
          }
        });

        Object.values(membersMap).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
      }

      setGroups(
        (groupsData || []).map((g: any) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          memberCount: (membersMap[g.id] || []).length,
          members: membersMap[g.id] || [],
        }))
      );
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveGroup() {
    if (!groupName.trim()) return;
    setSaving(true);
    try {
      if (editingGroup) {
        const { error } = await supabase
          .from('student_groups')
          .update({ name: groupName.trim(), description: groupDesc.trim() || null, updated_at: new Date().toISOString() })
          .eq('id', editingGroup.id);
        if (error) throw error;
        toast({ title: '그룹 수정 완료' });
      } else {
        const { error } = await supabase
          .from('student_groups')
          .insert({ name: groupName.trim(), description: groupDesc.trim() || null });
        if (error) throw error;
        toast({ title: '그룹 생성 완료' });
      }
      setDialogOpen(false);
      setEditingGroup(null);
      setGroupName('');
      setGroupDesc('');
      fetchGroups();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm('이 그룹을 삭제하시겠습니까? 그룹에 속한 학생 배정은 유지됩니다.')) return;
    try {
      const { error } = await supabase.from('student_groups').delete().eq('id', groupId);
      if (error) throw error;
      toast({ title: '그룹 삭제 완료' });
      fetchGroups();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    }
  }

  async function openMemberDialog(group: StudentGroup) {
    setActiveGroupId(group.id);
    setCurrentMembers(new Set(group.members.map(m => m.id)));
    setSelectedStudentIds(new Set(group.members.map(m => m.id)));
    setMemberDialogOpen(true);
    setStudentSearch('');
    await fetchAllStudents();
  }

  async function fetchAllStudents() {
    setStudentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, school, grade')
        .neq('enrollment_status', '퇴원')
        .order('name');
      if (error) throw error;
      setAllStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setStudentsLoading(false);
    }
  }

  async function handleSaveMembers() {
    if (!activeGroupId) return;
    setMemberSaving(true);
    try {
      const toAdd = [...selectedStudentIds].filter(id => !currentMembers.has(id));
      const toRemove = [...currentMembers].filter(id => !selectedStudentIds.has(id));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('student_group_members')
          .delete()
          .eq('group_id', activeGroupId)
          .in('student_id', toRemove);
        if (error) throw error;
      }

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('student_group_members')
          .insert(toAdd.map(sid => ({ group_id: activeGroupId, student_id: sid })));
        if (error) throw error;
      }

      toast({ title: '멤버 저장 완료', description: `추가 ${toAdd.length}명, 제거 ${toRemove.length}명` });
      setMemberDialogOpen(false);
      fetchGroups();
    } catch (error: any) {
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setMemberSaving(false);
    }
  }

  const filteredStudents = allStudents.filter(s => {
    if (!studentSearch.trim()) return true;
    return s.name.toLowerCase().includes(studentSearch.toLowerCase());
  });

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
          <FolderOpen className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">그룹(반) 관리</span>
          <Badge variant="outline" className="text-xs">{groups.length}개</Badge>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingGroup(null);
            setGroupName('');
            setGroupDesc('');
            setDialogOpen(true);
          }}
        >
          <Plus className="w-3 h-3 mr-1" />
          그룹 생성
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
            <div
              key={group.id}
              className="border rounded-lg p-3 bg-card hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h4 className="text-sm font-semibold">{group.name}</h4>
                  {group.description && (
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setEditingGroup(group);
                      setGroupName(group.name);
                      setGroupDesc(group.description || '');
                      setDialogOpen(true);
                    }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="p-1 rounded hover:bg-muted text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs">
                  <Users className="w-3 h-3 mr-1" />
                  {group.memberCount}명
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => openMemberDialog(group)}
                >
                  <UserPlus className="w-3 h-3 mr-1" />
                  멤버 관리
                </Button>
              </div>

              {group.members.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {group.members.slice(0, 8).map(m => (
                    <span key={m.id} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {m.name}
                    </span>
                  ))}
                  {group.members.length > 8 && (
                    <span className="text-xs text-muted-foreground">+{group.members.length - 8}명</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit group dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingGroup ? '그룹 수정' : '새 그룹 생성'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>그룹명 *</Label>
              <Input
                placeholder="예: 고2 수능반, 중1 기초반"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>설명 (선택)</Label>
              <Input
                placeholder="그룹 설명"
                value={groupDesc}
                onChange={e => setGroupDesc(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={handleSaveGroup} disabled={saving || !groupName.trim()}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingGroup ? '수정' : '생성'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Member management dialog */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              멤버 관리 — {groups.find(g => g.id === activeGroupId)?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="text-xs text-muted-foreground">
              선택된 학생: {selectedStudentIds.size}명
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="학생 검색..."
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {studentsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                {filteredStudents.map(student => {
                  const isSelected = selectedStudentIds.has(student.id);
                  return (
                    <div
                      key={student.id}
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50',
                        isSelected && 'bg-primary/5 border border-primary/20'
                      )}
                      onClick={() => {
                        setSelectedStudentIds(prev => {
                          const next = new Set(prev);
                          if (next.has(student.id)) next.delete(student.id);
                          else next.add(student.id);
                          return next;
                        });
                      }}
                    >
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
                <Save className="w-4 h-4 mr-2" />
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
