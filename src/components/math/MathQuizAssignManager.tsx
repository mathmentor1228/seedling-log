// MATH-ASSIGN-V3: Full quiz management with search, bulk delete, print, student management, polished UI
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Users, FolderPlus, Send, Trash2, Loader2, CheckCircle2, Search,
  ArrowUpDown, Eye, User, Printer, X, CheckSquare, Square,
  ChevronDown, ChevronUp, UserPlus, UserMinus, Link2, Copy, Pencil, Check,
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { useNavigate } from 'react-router-dom';

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
  title?: string | null;
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
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & filters
  const [quizSearchQuery, setQuizSearchQuery] = useState('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [quizSubjectFilter, setQuizSubjectFilter] = useState('all');

  // Group creation
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupMemberSelection, setGroupMemberSelection] = useState<Set<string>>(new Set());

  // Quiz assignment
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [assignSelection, setAssignSelection] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);

  // Preview dialog
  const [previewQuiz, setPreviewQuiz] = useState<Quiz | null>(null);

  // Bulk delete
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Student management dialog
  const [manageStudentsQuiz, setManageStudentsQuiz] = useState<Quiz | null>(null);

  // Title editing
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  const availableQuizzes = quizzes.filter((quiz) => quiz.status === 'draft' || quiz.status === 'published');

  const quizSubjectOptions = useMemo(() => {
    const subjects = Array.from(
      new Set(availableQuizzes.map((quiz) => quiz.math_concepts?.subject || '기타')),
    ).sort((a, b) => a.localeCompare(b, 'ko'));
    return ['all', ...subjects];
  }, [availableQuizzes]);

  const getAssignedStudents = useCallback((quizId: string) =>
    new Set(assignments.filter(a => a.quiz_id === quizId).map(a => a.student_id)),
  [assignments]);

  // Build a map of student_id -> student_name for quick lookup in quiz search
  const studentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    students.forEach(s => { map[s.id] = s.name.toLowerCase(); });
    return map;
  }, [students]);

  const filteredQuizzes = useMemo(() => {
    let list = [...availableQuizzes];
    if (quizSubjectFilter !== 'all') {
      list = list.filter((q) => (q.math_concepts?.subject || '기타') === quizSubjectFilter);
    }
    if (quizSearchQuery.trim()) {
      const query = quizSearchQuery.toLowerCase();
      list = list.filter((q) => {
        const title = (q.math_concepts?.title || '').toLowerCase();
        const course = (q.math_concepts?.course || '').toLowerCase();
        const creator = (q.creator_name || '').toLowerCase();
        const code = (q.answer_code || '').toLowerCase();
        if (title.includes(query) || course.includes(query) || creator.includes(query) || code.includes(query)) {
          return true;
        }
        // Also search by assigned student name
        const assignedStudentIds = assignments.filter(a => a.quiz_id === q.id).map(a => a.student_id);
        return assignedStudentIds.some(sid => (studentNameMap[sid] || '').includes(query));
      });
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
  }, [availableQuizzes, quizSubjectFilter, quizSearchQuery, sortKey, sortAsc, getAssignedStudents, assignments, studentNameMap]);

  const fetchAll = async () => {
    setLoading(true);
    const [studentsRes, groupsRes, assignRes] = await Promise.all([
      supabase.from('students').select('id, name, school_level, grade_year, grade, enrollment_status')
        .in('enrollment_status', ['재학']) as any,
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
    if (!studentSearchQuery.trim()) return students;
    const q = studentSearchQuery.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      gradeLabel(s).toLowerCase().includes(q)
    );
  }, [students, studentSearchQuery]);

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

  // --- Single Quiz Deletion ---
  const handleDeleteQuiz = async (quizId: string) => {
    if (!confirm('이 퀴즈를 삭제하시겠습니까? 배정 기록도 함께 삭제됩니다.')) return;
    setDeletingId(quizId);
    await supabase.from('math_quiz_assignments').delete().eq('quiz_id', quizId);
    await supabase.from('math_quiz_submissions').delete().eq('quiz_id', quizId);
    const { error } = await supabase.from('math_concept_quizzes').delete().eq('id', quizId);
    if (error) {
      toast({ title: '삭제 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '퀴즈 삭제 완료' });
      if (selectedQuizId === quizId) {
        setSelectedQuizId(null);
        setAssignSelection(new Set());
      }
      bulkSelection.delete(quizId);
      setBulkSelection(new Set(bulkSelection));
      onQuizDeleted?.();
    }
    setDeletingId(null);
  };

  // --- Bulk Delete ---
  const handleBulkDelete = async () => {
    if (bulkSelection.size === 0) return;
    if (!confirm(`선택한 ${bulkSelection.size}개의 퀴즈를 모두 삭제하시겠습니까? 배정 기록도 함께 삭제됩니다.`)) return;
    setBulkDeleting(true);
    const ids = Array.from(bulkSelection);
    for (const id of ids) {
      await supabase.from('math_quiz_assignments').delete().eq('quiz_id', id);
      await supabase.from('math_quiz_submissions').delete().eq('quiz_id', id);
      await supabase.from('math_concept_quizzes').delete().eq('id', id);
    }
    toast({ title: `${ids.length}개 퀴즈 삭제 완료` });
    setBulkSelection(new Set());
    if (selectedQuizId && ids.includes(selectedQuizId)) {
      setSelectedQuizId(null);
      setAssignSelection(new Set());
    }
    onQuizDeleted?.();
    setBulkDeleting(false);
  };

  const toggleBulkItem = (quizId: string) => {
    const newSet = new Set(bulkSelection);
    if (newSet.has(quizId)) newSet.delete(quizId); else newSet.add(quizId);
    setBulkSelection(newSet);
  };

  const toggleSelectAll = () => {
    if (bulkSelection.size === filteredQuizzes.length) {
      setBulkSelection(new Set());
    } else {
      setBulkSelection(new Set(filteredQuizzes.map(q => q.id)));
    }
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
      toast({ title: '⚠️ 중복 배포 감지', description: `${dupNames}에게 이미 배포된 퀴즈입니다.`, variant: 'destructive' });
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
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const handlePrint = (quizId: string) => {
    window.open(`/quiz-print?quiz_id=${quizId}`, '_blank');
  };

  const handleSaveTitle = async (quizId: string) => {
    const { error } = await supabase
      .from('math_concept_quizzes')
      .update({ title: editTitleValue.trim() || null } as any)
      .eq('id', quizId);
    if (error) {
      toast({ title: '제목 저장 실패', variant: 'destructive' });
    } else {
      toast({ title: '제목 수정 완료' });
      // Update local quiz data
      const quiz = availableQuizzes.find(q => q.id === quizId);
      if (quiz) quiz.title = editTitleValue.trim() || null;
      onQuizDeleted?.(); // refetch
    }
    setEditingTitleId(null);
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'date', label: '최신순' },
    { key: 'title', label: '제목' },
    { key: 'course', label: '과정' },
    { key: 'assigned', label: '배정수' },
  ];

  const selectedQuiz = selectedQuizId ? availableQuizzes.find(q => q.id === selectedQuizId) : null;

  return (
    <>
      <div className="space-y-4">
        <Tabs defaultValue="assign">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="assign">📋 퀴즈 배정</TabsTrigger>
            <TabsTrigger value="groups">👥 학생 그룹</TabsTrigger>
          </TabsList>

          {/* === Assign Tab === */}
          <TabsContent value="assign" className="mt-4 space-y-4">
            {availableQuizzes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">배정 가능한 퀴즈가 없습니다.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* LEFT: Quiz List */}
                <div className="lg:col-span-2 space-y-3">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>퀴즈 목록 ({filteredQuizzes.length})</span>
                        {bulkSelection.size > 0 && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs"
                            disabled={bulkDeleting}
                            onClick={handleBulkDelete}
                          >
                            {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
                            {bulkSelection.size}개 삭제
                          </Button>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          className="pl-8 h-9 text-sm"
                          placeholder="제목 / 과정 / 출제자 / 코드 / 학생이름 검색..."
                          value={quizSearchQuery}
                          onChange={e => setQuizSearchQuery(e.target.value)}
                        />
                      </div>

                      {/* Filters row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select value={quizSubjectFilter} onValueChange={setQuizSubjectFilter}>
                          <SelectTrigger className="h-7 text-xs w-24">
                            <SelectValue placeholder="과목" />
                          </SelectTrigger>
                          <SelectContent>
                            {quizSubjectOptions.map((subject) => (
                              <SelectItem key={subject} value={subject}>
                                {subject === 'all' ? '전체 과목' : subject}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          {SORT_OPTIONS.map(opt => (
                            <Button
                              key={opt.key}
                              size="sm"
                              variant={sortKey === opt.key ? 'default' : 'ghost'}
                              className="h-7 text-[11px] px-2"
                              onClick={() => toggleSort(opt.key)}
                            >
                              {opt.label}
                              {sortKey === opt.key && (sortAsc ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />)}
                            </Button>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] px-2 ml-auto"
                          onClick={toggleSelectAll}
                        >
                          {bulkSelection.size === filteredQuizzes.length && filteredQuizzes.length > 0 ? (
                            <><CheckSquare className="w-3 h-3 mr-1" />전체 해제</>
                          ) : (
                            <><Square className="w-3 h-3 mr-1" />전체 선택</>
                          )}
                        </Button>
                      </div>

                      {/* Quiz list */}
                      <div className="max-h-[520px] overflow-y-auto space-y-1.5">
                        {filteredQuizzes.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-8 text-center">검색 결과가 없습니다.</p>
                        ) : filteredQuizzes.map((q) => {
                          const assigned = getAssignedStudents(q.id);
                          const isSelected = selectedQuizId === q.id;
                          const isChecked = bulkSelection.has(q.id);
                          return (
                            <div
                              key={q.id}
                              className={`group relative rounded-lg border p-3 transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                                  : 'hover:border-border hover:bg-muted/30'
                              }`}
                              onClick={() => {
                                setSelectedQuizId(q.id);
                                setAssignSelection(new Set());
                              }}
                            >
                              <div className="flex items-start gap-2">
                                <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={() => toggleBulkItem(q.id)}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  {editingTitleId === q.id ? (
                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                      <Input
                                        value={editTitleValue}
                                        onChange={e => setEditTitleValue(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(q.id); if (e.key === 'Escape') setEditingTitleId(null); }}
                                        className="h-7 text-sm"
                                        placeholder="퀴즈 제목 입력..."
                                        autoFocus
                                      />
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => handleSaveTitle(q.id)}>
                                        <Check className="w-3.5 h-3.5 text-green-600" />
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => setEditingTitleId(null)}>
                                        <X className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 group/title">
                                      <p className="font-medium text-sm leading-tight truncate">
                                        {q.title || q.math_concepts?.title || '퀴즈'}
                                      </p>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5 p-0 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingTitleId(q.id);
                                          setEditTitleValue(q.title || q.math_concepts?.title || '');
                                        }}
                                      >
                                        <Pencil className="w-3 h-3 text-muted-foreground" />
                                      </Button>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    <Badge variant="secondary" className="text-[10px] h-5">
                                      {q.math_concepts?.subject || '기타'}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px] h-5">
                                      {q.math_concepts?.course || '-'}
                                    </Badge>
                                    {q.version_number && (
                                      <Badge variant="outline" className="text-[10px] h-5 font-mono">V{q.version_number}</Badge>
                                    )}
                                    {q.answer_code && (
                                      <Badge className="text-[10px] h-5 font-mono bg-accent text-accent-foreground">
                                        {q.answer_code}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                                    {q.creator_name && (
                                      <span className="flex items-center gap-0.5">
                                        <User className="w-3 h-3" />{q.creator_name}
                                      </span>
                                    )}
                                    {q.created_at && (
                                      <span>
                                        {new Date(q.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-0.5">
                                      <Users className="w-3 h-3" />{assigned.size}명
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Action buttons on hover/selected */}
                              <div className={`flex items-center gap-1 mt-2 pt-2 border-t border-border/50 ${isSelected ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                                  onClick={(e) => { e.stopPropagation(); setPreviewQuiz(q); }}>
                                  <Eye className="w-3 h-3 mr-1" />보기
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                                  onClick={(e) => { e.stopPropagation(); handlePrint(q.id); }}>
                                  <Printer className="w-3 h-3 mr-1" />인쇄
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                                  onClick={(e) => { e.stopPropagation(); setManageStudentsQuiz(q); }}>
                                  <Users className="w-3 h-3 mr-1" />학생관리
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-destructive hover:text-destructive"
                                  disabled={deletingId === q.id}
                                  onClick={(e) => { e.stopPropagation(); handleDeleteQuiz(q.id); }}>
                                  {deletingId === q.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* RIGHT: Assignment panel */}
                <div className="lg:col-span-3">
                  {selectedQuiz ? (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                          <Send className="w-4 h-4 text-primary" />
                          <span className="truncate">{selectedQuiz.math_concepts?.title || '퀴즈'}</span>
                          {selectedQuiz.answer_code && (
                            <Badge variant="outline" className="font-mono text-xs">{selectedQuiz.answer_code}</Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{getAssignedStudents(selectedQuizId!).size}명 배정됨</Badge>
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => handlePrint(selectedQuizId!)}>
                            <Printer className="w-3 h-3 mr-1" />인쇄
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => setPreviewQuiz(selectedQuiz)}>
                            <Eye className="w-3 h-3 mr-1" />문항보기
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Currently assigned students */}
                        {(() => {
                          const assignedIds = getAssignedStudents(selectedQuizId!);
                          if (assignedIds.size > 0) {
                            const assignedStudentList = students.filter(s => assignedIds.has(s.id));
                            return (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">현재 배정된 학생</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {assignedStudentList.map(s => (
                                    <Badge key={s.id} variant="secondary" className="text-xs gap-1 pr-1">
                                      {gradeLabel(s)} {s.name}
                                      <button
                                        className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5"
                                        onClick={() => handleUnassign(selectedQuizId!, s.id)}
                                      >
                                        <X className="w-3 h-3 text-destructive" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                                <Separator />
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Group quick assign */}
                        {groups.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">그룹 일괄 선택</p>
                            <div className="flex flex-wrap gap-1.5">
                              {groups.map(g => (
                                <Button key={g.id} size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => selectGroupForAssign(g)}>
                                  <Users className="w-3 h-3 mr-1" />
                                  {g.name} ({g.members.length})
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Student selection */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">학생 추가</p>
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              className="pl-8 h-9 text-sm"
                              placeholder="이름 또는 학년으로 검색..."
                              value={studentSearchQuery}
                              onChange={e => setStudentSearchQuery(e.target.value)}
                            />
                          </div>
                          <div className="max-h-[280px] overflow-y-auto border rounded-lg">
                            {groupByLevel(filteredStudents).map(section => (
                              <div key={section.level}>
                                <div className="sticky top-0 z-10 bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground border-b">
                                  {section.label}
                                </div>
                                {section.students.map(s => {
                                  const alreadyAssigned = getAssignedStudents(selectedQuizId!).has(s.id);
                                  const isChecked = assignSelection.has(s.id);
                                  return (
                                    <div key={s.id} className={`flex items-center gap-2.5 px-3 py-2 border-b last:border-b-0 transition-colors ${
                                      isChecked ? 'bg-primary/5' : 'hover:bg-muted/30'
                                    }`}>
                                      <Checkbox
                                        checked={isChecked || alreadyAssigned}
                                        disabled={alreadyAssigned}
                                        onCheckedChange={(checked) => {
                                          const newSet = new Set(assignSelection);
                                          if (checked) newSet.add(s.id); else newSet.delete(s.id);
                                          setAssignSelection(newSet);
                                        }}
                                      />
                                      <span className="text-sm flex-1">{s.name}</span>
                                      <Badge variant="outline" className="text-[10px] h-5">{gradeLabel(s)}</Badge>
                                      {alreadyAssigned && (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-muted-foreground">
                              {assignSelection.size > 0 && `${assignSelection.size}명 선택`}
                            </span>
                            <Button onClick={handleAssignQuiz} disabled={assignSelection.size === 0 || assigning} size="sm">
                              {assigning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                              {assignSelection.size}명 배정하기
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="py-16 text-center">
                        <div className="text-muted-foreground space-y-2">
                          <Send className="w-8 h-8 mx-auto opacity-30" />
                          <p className="text-sm">왼쪽에서 퀴즈를 선택하면<br/>학생 배정을 관리할 수 있습니다.</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* === Groups Tab === */}
          <TabsContent value="groups" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
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
                  <p className="text-center text-muted-foreground py-8">아직 그룹이 없습니다.</p>
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
                                <Button size="sm" variant={isEditing ? 'default' : 'outline'}
                                  onClick={() => isEditing ? handleSaveGroupMembers() : startEditGroup(group)}>
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
                                  <span className="text-xs text-muted-foreground">멤버 없음</span>
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* === Quiz Preview Dialog === */}
      <Dialog open={!!previewQuiz} onOpenChange={(open) => !open && setPreviewQuiz(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span>{previewQuiz?.math_concepts?.title || '퀴즈'}</span>
              {previewQuiz?.version_number && <Badge variant="secondary">V{previewQuiz.version_number}</Badge>}
              {previewQuiz?.answer_code && <Badge variant="outline" className="font-mono text-xs">{previewQuiz.answer_code}</Badge>}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-xs">
              <span>{previewQuiz?.math_concepts?.subject} · {previewQuiz?.math_concepts?.course} · {previewQuiz?.math_concepts?.grade}</span>
              {previewQuiz?.creator_name && (
                <span className="flex items-center gap-0.5"><User className="w-3 h-3" /> {previewQuiz.creator_name}</span>
              )}
            </DialogDescription>
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
                  <p className="text-sm font-medium"><MathRenderer text={q.question_text} autoSubBreak /></p>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">정답:</span> <MathRenderer text={q.answer || '—'} />
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
          <DialogFooter className="gap-2">
            {previewQuiz && (
              <Button variant="outline" onClick={() => handlePrint(previewQuiz.id)}>
                <Printer className="w-4 h-4 mr-1" />인쇄
              </Button>
            )}
            <Button variant="outline" onClick={() => setPreviewQuiz(null)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Student Management Dialog === */}
      <Dialog open={!!manageStudentsQuiz} onOpenChange={(open) => !open && setManageStudentsQuiz(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              학생 관리 — {manageStudentsQuiz?.math_concepts?.title || '퀴즈'}
            </DialogTitle>
            <DialogDescription>배정된 학생을 추가/제거할 수 있습니다.</DialogDescription>
          </DialogHeader>
          {manageStudentsQuiz && (() => {
            const quizId = manageStudentsQuiz.id;
            const assignedIds = getAssignedStudents(quizId);
            const assignedList = students.filter(s => assignedIds.has(s.id));
            const unassignedList = students.filter(s => !assignedIds.has(s.id));
            return (
              <div className="space-y-4">
                {assignedList.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">배정됨 ({assignedList.length})</p>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {assignedList.map(s => {
                        const submitUrl = `${window.location.origin}/quiz-submit?quiz_id=${quizId}&student_id=${s.id}`;
                        return (
                          <div key={s.id} className="flex items-center justify-between px-3 py-1.5 bg-muted/50 rounded gap-1">
                            <span className="text-sm flex-1 min-w-0 truncate">{gradeLabel(s)} {s.name}</span>
                            <Button size="sm" variant="ghost" className="h-6 text-xs shrink-0"
                              title="로그인 없이 바로 제출할 수 있는 링크 복사"
                              onClick={() => {
                                navigator.clipboard.writeText(submitUrl);
                                toast({ title: `${s.name} 제출 링크 복사됨` });
                              }}>
                              <Link2 className="w-3 h-3 mr-1" />링크
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive shrink-0"
                              onClick={async () => { await handleUnassign(quizId, s.id); }}>
                              <UserMinus className="w-3 h-3 mr-1" />제거
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">미배정 학생 추가</p>
                  <div className="space-y-1 max-h-[250px] overflow-y-auto">
                    {unassignedList.map(s => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/30 rounded">
                        <span className="text-sm">{gradeLabel(s)} {s.name}</span>
                        <Button size="sm" variant="ghost" className="h-6 text-xs"
                          onClick={async () => {
                            const { data: { user } } = await supabase.auth.getUser();
                            await supabase.from('math_quiz_assignments').insert({
                              quiz_id: quizId, student_id: s.id, assigned_by: user?.id,
                            } as any);
                            toast({ title: `${s.name} 배정 완료` });
                            await fetchAll();
                          }}>
                          <UserPlus className="w-3 h-3 mr-1" />추가
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageStudentsQuiz(null)}>닫기</Button>
            {manageStudentsQuiz && (
              <Button variant="outline" onClick={() => handlePrint(manageStudentsQuiz.id)}>
                <Printer className="w-4 h-4 mr-1" />인쇄
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
