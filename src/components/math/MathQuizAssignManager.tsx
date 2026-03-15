// MATH-ASSIGN-V2: Quiz assignment manager with sorting, deletion, preview, creator
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Users, FolderPlus, Send, Trash2, Loader2, CheckCircle2, Search,
  ArrowUpDown, Eye, User,
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';

interface Student {
  id: string;
  name: string;
  school_level: string | null;
  grade_year: number | null;
  grade: string | null;
  enrollment_status: string;
}

interface StudentGroup {
  id: string;
  name: string;
  created_at: string;
  members: { student_id: string }[];
}

interface QuizQuestion {
  question_number: number;
  question_type: string;
  question_text: string;
  answer: string;
  explanation: string;
  difficulty: string;
}

interface Quiz {
  id: string;
  concept_id: string;
  status: string;
  created_at?: string;
  questions?: QuizQuestion[] | any;
  version_number?: number;
  version_label?: string | null;
  answer_code?: string | null;
  creator_name?: string;
  math_concepts: { title: string; course: string; grade: string; subject: string } | null;
}

interface Assignment {
  id: string;
  quiz_id: string;
  student_id: string;
  assigned_at: string;
}

type SortKey = 'title' | 'subject' | 'course' | 'date' | 'assigned';

const LEVEL_ORDER: Record<string, number> = { '초': 0, '중': 1, '고': 2 };
const LEVEL_LABEL: Record<string, string> = { '초': '초등', '중': '중등', '고': '고등' };

function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const levelA = LEVEL_ORDER[a.school_level || ''] ?? 9;
    const levelB = LEVEL_ORDER[b.school_level || ''] ?? 9;
    if (levelA !== levelB) return levelA - levelB;
    const gradeA = a.grade_year ?? 9;
    const gradeB = b.grade_year ?? 9;
    if (gradeA !== gradeB) return gradeA - gradeB;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function gradeLabel(s: Student): string {
  if (s.school_level && s.grade_year) return `${s.school_level}${s.grade_year}`;
  return s.grade || '-';
}

function groupByLevel(studentList: Student[]): { level: string; label: string; students: Student[] }[] {
  const sections: { level: string; label: string; students: Student[] }[] = [];
  let currentLevel = '';
  for (const s of studentList) {
    const lvl = s.school_level || '기타';
    if (lvl !== currentLevel) {
      currentLevel = lvl;
      sections.push({ level: lvl, label: LEVEL_LABEL[lvl] || '기타', students: [] });
    }
    sections[sections.length - 1].students.push(s);
  }
  return sections;
}

interface Props {
  quizzes: Quiz[];
  onQuizDeleted?: () => void;
}

export function MathQuizAssignManager({ quizzes, onQuizDeleted }: Props) {
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Group creation
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupMemberSelection, setGroupMemberSelection] = useState<Set<string>>(new Set());

  // Quiz assignment
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [assignSelection, setAssignSelection] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [quizSubjectFilter, setQuizSubjectFilter] = useState('all');

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);

  // Preview dialog
  const [previewQuiz, setPreviewQuiz] = useState<Quiz | null>(null);

  // Deleting
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const availableQuizzes = quizzes.filter((quiz) => quiz.status === 'draft' || quiz.status === 'published');

  const quizSubjectOptions = useMemo(() => {
    const subjects = Array.from(
      new Set(availableQuizzes.map((quiz) => quiz.math_concepts?.subject || '기타')),
    ).sort((a, b) => a.localeCompare(b, 'ko'));
    return ['all', ...subjects];
  }, [availableQuizzes]);

  const getAssignedStudents = (quizId: string) =>
    new Set(assignments.filter(a => a.quiz_id === quizId).map(a => a.student_id));

  const filteredQuizzes = useMemo(() => {
    let list = [...availableQuizzes];
    if (quizSubjectFilter !== 'all') {
      list = list.filter((q) => (q.math_concepts?.subject || '기타') === quizSubjectFilter);
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'title':
          cmp = (a.math_concepts?.title || '').localeCompare(b.math_concepts?.title || '', 'ko');
          break;
        case 'subject':
          cmp = (a.math_concepts?.subject || '').localeCompare(b.math_concepts?.subject || '', 'ko');
          break;
        case 'course':
          cmp = (a.math_concepts?.course || '').localeCompare(b.math_concepts?.course || '', 'ko');
          break;
        case 'date':
          cmp = (a.created_at || '').localeCompare(b.created_at || '');
          break;
        case 'assigned':
          cmp = getAssignedStudents(a.id).size - getAssignedStudents(b.id).size;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [availableQuizzes, quizSubjectFilter, sortKey, sortAsc, assignments]);

  const fetchAll = async () => {
    setLoading(true);
    const [studentsRes, groupsRes, assignRes] = await Promise.all([
      supabase.from('students').select('id, name, school_level, grade_year, grade, enrollment_status')
        .eq('enrollment_status', '재원') as any,
      supabase.from('math_student_groups').select('id, name, created_at, math_student_group_members(student_id)') as any,
      supabase.from('math_quiz_assignments').select('id, quiz_id, student_id, assigned_at') as any,
    ]);

    if (studentsRes.data) setStudents(sortStudents(studentsRes.data));
    if (groupsRes.data) setGroups(groupsRes.data.map((g: any) => ({
      ...g,
      members: g.math_student_group_members || [],
    })));
    if (assignRes.data) setAssignments(assignRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (selectedQuizId && !filteredQuizzes.some((quiz) => quiz.id === selectedQuizId)) {
      setSelectedQuizId(null);
      setAssignSelection(new Set());
    }
  }, [filteredQuizzes, selectedQuizId]);

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      gradeLabel(s).toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  // --- Group Management ---
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('math_student_groups')
      .insert({ name: newGroupName.trim(), created_by: user?.id } as any);
    if (error) {
      toast({ title: '오류', description: '그룹 생성 실패', variant: 'destructive' });
    } else {
      toast({ title: '그룹 생성 완료' });
      setNewGroupName('');
      await fetchAll();
    }
    setCreatingGroup(false);
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('이 그룹을 삭제하시겠습니까?')) return;
    await supabase.from('math_student_groups').delete().eq('id', groupId);
    toast({ title: '그룹 삭제됨' });
    if (editingGroupId === groupId) setEditingGroupId(null);
    await fetchAll();
  };

  const handleSaveGroupMembers = async () => {
    if (!editingGroupId) return;
    await supabase.from('math_student_group_members').delete().eq('group_id', editingGroupId);
    if (groupMemberSelection.size > 0) {
      const rows = Array.from(groupMemberSelection).map(sid => ({
        group_id: editingGroupId,
        student_id: sid,
      }));
      await supabase.from('math_student_group_members').insert(rows as any);
    }
    toast({ title: '명단 저장됨' });
    await fetchAll();
    setEditingGroupId(null);
  };

  const startEditGroup = (group: StudentGroup) => {
    setEditingGroupId(group.id);
    setGroupMemberSelection(new Set(group.members.map(m => m.student_id)));
  };

  // --- Quiz Deletion ---
  const handleDeleteQuiz = async (quizId: string) => {
    if (!confirm('이 퀴즈를 삭제하시겠습니까? 배정 기록도 함께 삭제됩니다.')) return;
    setDeletingId(quizId);
    // Delete assignments first
    await supabase.from('math_quiz_assignments').delete().eq('quiz_id', quizId);
    // Delete submissions
    await supabase.from('math_quiz_submissions').delete().eq('quiz_id', quizId);
    // Delete the quiz
    const { error } = await supabase.from('math_concept_quizzes').delete().eq('id', quizId);
    if (error) {
      toast({ title: '삭제 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '퀴즈 삭제 완료' });
      if (selectedQuizId === quizId) {
        setSelectedQuizId(null);
        setAssignSelection(new Set());
      }
      onQuizDeleted?.();
    }
    setDeletingId(null);
  };

  // --- Quiz Assignment ---
  const handleAssignQuiz = async () => {
    if (!selectedQuizId || assignSelection.size === 0) return;
    setAssigning(true);
    const { data: { user } } = await supabase.auth.getUser();
    const alreadyAssigned = getAssignedStudents(selectedQuizId);
    const duplicates = Array.from(assignSelection).filter(sid => alreadyAssigned.has(sid));
    const newStudents = Array.from(assignSelection).filter(sid => !alreadyAssigned.has(sid));

    if (duplicates.length > 0) {
      const dupNames = duplicates.map(sid => students.find(s => s.id === sid)?.name || '?').join(', ');
      toast({
        title: '⚠️ 중복 배포 감지',
        description: `${dupNames}에게 이미 배포된 퀴즈입니다.`,
        variant: 'destructive',
      });
    }

    if (newStudents.length > 0) {
      const rows = newStudents.map(sid => ({
        quiz_id: selectedQuizId,
        student_id: sid,
        assigned_by: user?.id,
      }));
      const { error } = await supabase.from('math_quiz_assignments').insert(rows as any);
      if (error) {
        toast({ title: '오류', description: '배정 실패', variant: 'destructive' });
      } else {
        toast({ title: `${newStudents.length}명에게 퀴즈 배정 완료` });
      }
    }
    await fetchAll();
    setAssigning(false);
  };

  const handleUnassign = async (quizId: string, studentId: string) => {
    await supabase.from('math_quiz_assignments').delete()
      .eq('quiz_id', quizId).eq('student_id', studentId);
    toast({ title: '배정 해제됨' });
    await fetchAll();
  };

  const selectGroupForAssign = (group: StudentGroup) => {
    const newSet = new Set(assignSelection);
    group.members.forEach(m => newSet.add(m.student_id));
    setAssignSelection(newSet);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'date', label: '최신순' },
    { key: 'title', label: '제목' },
    { key: 'subject', label: '과목' },
    { key: 'course', label: '과정' },
    { key: 'assigned', label: '배정수' },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            퀴즈 배정 관리
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="assign">
            <TabsList className="w-full">
              <TabsTrigger value="assign" className="flex-1">퀴즈 배정</TabsTrigger>
              <TabsTrigger value="groups" className="flex-1">학생 그룹 관리</TabsTrigger>
            </TabsList>

            {/* === Assign Tab === */}
            <TabsContent value="assign" className="space-y-4 mt-4">
              {availableQuizzes.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">배정 가능한 퀴즈가 없습니다.</p>
              ) : (
                <>
                  {/* Quiz selector with sort + filter */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-medium">1. 퀴즈 선택</p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {SORT_OPTIONS.map(opt => (
                            <Button
                              key={opt.key}
                              size="sm"
                              variant={sortKey === opt.key ? 'default' : 'outline'}
                              className="h-7 text-xs px-2"
                              onClick={() => toggleSort(opt.key)}
                            >
                              {opt.label}
                              {sortKey === opt.key && (
                                <ArrowUpDown className="w-3 h-3 ml-0.5" />
                              )}
                            </Button>
                          ))}
                        </div>
                        <div className="w-32">
                          <Select value={quizSubjectFilter} onValueChange={setQuizSubjectFilter}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="과목" />
                            </SelectTrigger>
                            <SelectContent>
                              {quizSubjectOptions.map((subject) => (
                                <SelectItem key={subject} value={subject}>
                                  {subject === 'all' ? '전체' : subject}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {filteredQuizzes.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4">선택한 과목에 배정 가능한 퀴즈가 없습니다.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {filteredQuizzes.map((q) => {
                          const assigned = getAssignedStudents(q.id);
                          const isDeleting = deletingId === q.id;
                          return (
                            <div
                              key={q.id}
                              className={`p-3 border rounded-lg transition-colors ${
                                selectedQuizId === q.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                              }`}
                            >
                              <div
                                className="cursor-pointer"
                                onClick={() => {
                                  setSelectedQuizId(q.id);
                                  setAssignSelection(new Set());
                                }}
                              >
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {q.math_concepts?.subject || '기타'}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px]">
                                    {q.math_concepts?.course || '과정 미지정'}
                                  </Badge>
                                  {q.version_number && (
                                    <Badge variant="outline" className="text-[10px]">V{q.version_number}</Badge>
                                  )}
                                  {q.answer_code && (
                                    <Badge variant="secondary" className="text-[10px] font-mono">{q.answer_code}</Badge>
                                  )}
                                </div>
                                <p className="font-medium text-sm">{q.math_concepts?.title || '퀴즈'}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {assigned.size}명 배정
                                  </Badge>
                                  {q.creator_name && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <User className="w-3 h-3" />{q.creator_name}
                                    </span>
                                  )}
                                  {q.created_at && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {new Date(q.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 mt-2 pt-2 border-t">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={(e) => { e.stopPropagation(); setPreviewQuiz(q); }}
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1" />문항 보기
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-destructive hover:text-destructive"
                                  disabled={isDeleting}
                                  onClick={(e) => { e.stopPropagation(); handleDeleteQuiz(q.id); }}
                                >
                                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                                  삭제
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {selectedQuizId && (
                    <>
                      {/* Quick group assign */}
                      {groups.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">2. 그룹 일괄 선택 (선택사항)</p>
                          <div className="flex flex-wrap gap-2">
                            {groups.map(g => (
                              <Button
                                key={g.id}
                                size="sm"
                                variant="outline"
                                onClick={() => selectGroupForAssign(g)}
                              >
                                <Users className="w-3 h-3 mr-1" />
                                {g.name} ({g.members.length}명)
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Student list */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          {groups.length > 0 ? '3' : '2'}. 학생 개별 선택
                        </p>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            className="pl-9"
                            placeholder="이름 또는 학년으로 검색..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                          />
                        </div>
                        <div className="max-h-[300px] overflow-y-auto border rounded-lg">
                          {groupByLevel(filteredStudents).map(section => (
                            <div key={section.level}>
                              <div className="sticky top-0 z-10 bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground border-b">
                                {section.label}
                              </div>
                              {section.students.map(s => {
                                const alreadyAssigned = getAssignedStudents(selectedQuizId).has(s.id);
                                const isSelected = assignSelection.has(s.id);
                                return (
                                  <div key={s.id} className="flex items-center gap-3 p-2.5 hover:bg-muted/30 border-b last:border-b-0">
                                    <Checkbox
                                      checked={isSelected || alreadyAssigned}
                                      disabled={alreadyAssigned}
                                      onCheckedChange={(checked) => {
                                        const newSet = new Set(assignSelection);
                                        if (checked) newSet.add(s.id); else newSet.delete(s.id);
                                        setAssignSelection(newSet);
                                      }}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium">{s.name}</span>
                                      <Badge variant="secondary" className="ml-2 text-xs">{gradeLabel(s)}</Badge>
                                    </div>
                                    {alreadyAssigned && (
                                      <div className="flex items-center gap-1">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                        <span className="text-xs text-green-600">배정됨</span>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6"
                                          onClick={() => handleUnassign(selectedQuizId, s.id)}
                                        >
                                          <Trash2 className="w-3 h-3 text-destructive" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {assignSelection.size}명 선택됨
                          </span>
                          <Button onClick={handleAssignQuiz} disabled={assignSelection.size === 0 || assigning}>
                            {assigning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                            배정하기
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </TabsContent>

            {/* === Groups Tab === */}
            <TabsContent value="groups" className="space-y-4 mt-4">
              <div className="flex gap-2">
                <Input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="새 그룹 이름 (예: 중2 수학반)"
                  onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                />
                <Button onClick={handleCreateGroup} disabled={!newGroupName.trim() || creatingGroup}>
                  {creatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4 mr-1" />}
                  만들기
                </Button>
              </div>

              {groups.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">
                  아직 그룹이 없습니다. 위에서 그룹을 만들어보세요.
                </p>
              ) : (
                <div className="space-y-3">
                  {groups.map(group => {
                    const isEditing = editingGroupId === group.id;
                    const memberNames = group.members
                      .map(m => students.find(s => s.id === m.student_id))
                      .filter(Boolean)
                      .sort((a, b) => {
                        const la = LEVEL_ORDER[a!.school_level || ''] ?? 9;
                        const lb = LEVEL_ORDER[b!.school_level || ''] ?? 9;
                        if (la !== lb) return la - lb;
                        return (a!.grade_year ?? 9) - (b!.grade_year ?? 9);
                      });

                    return (
                      <Card key={group.id} className={isEditing ? 'border-primary' : ''}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{group.name}</span>
                              <Badge variant="secondary">{group.members.length}명</Badge>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant={isEditing ? 'default' : 'outline'}
                                onClick={() => isEditing ? handleSaveGroupMembers() : startEditGroup(group)}
                              >
                                {isEditing ? '저장' : '편집'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteGroup(group.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="max-h-[250px] overflow-y-auto border rounded-lg">
                              {groupByLevel(students).map(section => (
                                <div key={section.level}>
                                  <div className="sticky top-0 z-10 bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground border-b">
                                    {section.label}
                                  </div>
                                  {section.students.map(s => (
                                    <div key={s.id} className="flex items-center gap-3 p-2 hover:bg-muted/30 border-b last:border-b-0">
                                      <Checkbox
                                        checked={groupMemberSelection.has(s.id)}
                                        onCheckedChange={(checked) => {
                                          const newSet = new Set(groupMemberSelection);
                                          if (checked) newSet.add(s.id); else newSet.delete(s.id);
                                          setGroupMemberSelection(newSet);
                                        }}
                                      />
                                      <span className="text-sm">{s.name}</span>
                                      <Badge variant="secondary" className="text-xs">{gradeLabel(s)}</Badge>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {memberNames.length === 0 ? (
                                <span className="text-xs text-muted-foreground">멤버 없음 — 편집을 눌러 학생을 추가하세요.</span>
                              ) : memberNames.map(s => (
                                <Badge key={s!.id} variant="outline" className="text-xs">
                                  {gradeLabel(s!)} {s!.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* === Quiz Preview Dialog === */}
      <Dialog open={!!previewQuiz} onOpenChange={(open) => !open && setPreviewQuiz(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span>{previewQuiz?.math_concepts?.title || '퀴즈'}</span>
              {previewQuiz?.version_number && (
                <Badge variant="secondary">V{previewQuiz.version_number}</Badge>
              )}
              {previewQuiz?.answer_code && (
                <Badge variant="outline" className="font-mono text-xs">{previewQuiz.answer_code}</Badge>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{previewQuiz?.math_concepts?.subject} · {previewQuiz?.math_concepts?.course} · {previewQuiz?.math_concepts?.grade}</span>
              {previewQuiz?.creator_name && (
                <span className="flex items-center gap-0.5">
                  <User className="w-3 h-3" /> {previewQuiz.creator_name}
                </span>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {(() => {
              const questions = Array.isArray(previewQuiz?.questions) ? previewQuiz!.questions as QuizQuestion[] : [];
              if (questions.length === 0) return <p className="text-sm text-muted-foreground py-4">문항 데이터가 없습니다.</p>;
              return questions.map((q, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={q.difficulty === 'easy' ? 'secondary' : q.difficulty === 'hard' ? 'destructive' : 'outline'} className="text-[10px]">
                      {q.difficulty === 'easy' ? '기초' : q.difficulty === 'hard' ? '심화' : '보통'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{q.question_type === 'fill_blank' ? '빈칸' : q.question_type === 'true_false' ? 'O/X' : '단답'}</span>
                  </div>
                  <p className="text-sm font-medium">
                    <MathRenderer text={q.question_text} autoSubBreak />
                  </p>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">정답:</span>{' '}
                    <MathRenderer text={q.answer || '—'} />
                  </div>
                  {q.explanation && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold">해설:</span> <MathRenderer text={q.explanation} />
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewQuiz(null)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
