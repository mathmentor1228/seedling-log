import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Search, Plus, Monitor, Printer, CheckCircle2, Clock, XCircle, Loader2, ChevronDown, ChevronRight, Folder, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Student {
  id: string;
  name: string;
  grade: string | null;
}

interface WordSet {
  id: string;
  title: string;
  round_number: number;
  folder_id: string | null;
}

interface VocabFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

interface Assignment {
  id: string;
  student_id: string;
  word_set_ids: string[];
  test_mode: string;
  test_level: number;
  test_time_limit: number | null;
  test_direction: string;
  status: string;
  assigned_at: string;
  due_date: string | null;
  score: number | null;
  total_questions: number | null;
  correct_count: number | null;
  completed_at: string | null;
  notes: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  assigned: { label: '예정', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: '오픈', color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700' },
  expired: { label: '만료', color: 'bg-muted text-muted-foreground' },
};

const DIRECTION_MAP: Record<string, string> = {
  eng_to_kor: '영→한',
  kor_to_eng: '한→영',
  mixed: '혼합',
};

export function VocabTestAssignManager() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [wordSets, setWordSets] = useState<WordSet[]>([]);
  const [folders, setFolders] = useState<VocabFolder[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStudent, setFilterStudent] = useState('');

  // Create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedSets, setSelectedSets] = useState<string[]>([]);
  const [testMode, setTestMode] = useState<'web' | 'print'>('web');
  const [testLevel, setTestLevel] = useState(1);
  const [testTimeLimit, setTestTimeLimit] = useState<string>('');
  const [testDirection, setTestDirection] = useState('eng_to_kor');
  const [dueDate, setDueDate] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Result entry modal
  const [resultModal, setResultModal] = useState<Assignment | null>(null);
  const [resultScore, setResultScore] = useState('');
  const [resultTotal, setResultTotal] = useState('');
  const [resultNotes, setResultNotes] = useState('');

  // Edit modal
  const [editModal, setEditModal] = useState<Assignment | null>(null);
  const [editTestMode, setEditTestMode] = useState<'web' | 'print'>('web');
  const [editTestLevel, setEditTestLevel] = useState(1);
  const [editTestTimeLimit, setEditTestTimeLimit] = useState('');
  const [editTestDirection, setEditTestDirection] = useState('eng_to_kor');
  const [editDueDate, setEditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSelectedSets, setEditSelectedSets] = useState<string[]>([]);
  const [editExpandedFolders, setEditExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [studentsRes, setsRes, foldersRes, assignRes] = await Promise.all([
      supabase.from('students').select('id, name, grade').in('enrollment_status', ['재학']).order('name'),
      supabase.from('vocab_word_sets').select('id, title, round_number, folder_id').order('round_number'),
      supabase.from('vocab_folders').select('id, name, parent_id').order('sort_order'),
      supabase.from('vocab_test_assignments').select('*').order('assigned_at', { ascending: false }).limit(200),
    ]);
    setStudents(studentsRes.data || []);
    setWordSets(setsRes.data as WordSet[] || []);
    setFolders(foldersRes.data || []);
    setAssignments((assignRes.data || []) as unknown as Assignment[]);
    setLoading(false);
  };

  const getStudentName = (id: string) => students.find(s => s.id === id)?.name || '?';
  const getSetTitle = (id: string) => wordSets.find(s => s.id === id)?.title || '?';

  // Folder tree helpers
  const rootFolders = folders.filter(f => !f.parent_id);
  const getChildFolders = (parentId: string) => folders.filter(f => f.parent_id === parentId);
  const getSetsInFolder = (folderId: string) => wordSets.filter(s => s.folder_id === folderId);
  const rootSets = wordSets.filter(s => !s.folder_id);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  };

  const toggleSetSelection = (setId: string) => {
    setSelectedSets(prev => prev.includes(setId) ? prev.filter(id => id !== setId) : [...prev, setId]);
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
  };

  const filteredStudentsForModal = students.filter(s =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const handleCreate = async () => {
    if (selectedStudents.length === 0) { toast.error('학생을 선택해주세요'); return; }
    if (selectedSets.length === 0) { toast.error('단어 세트를 선택해주세요'); return; }

    setSaving(true);
    try {
      const rows = selectedStudents.map(studentId => ({
        student_id: studentId,
        word_set_ids: selectedSets,
        test_mode: testMode,
        test_level: testLevel,
        test_time_limit: testTimeLimit ? parseInt(testTimeLimit) : null,
        test_direction: testDirection,
        due_date: dueDate || null,
        notes: assignNotes || null,
        assigned_by: user?.id,
      }));

      const { error } = await supabase.from('vocab_test_assignments').insert(rows);
      if (error) throw error;

      toast.success(`${selectedStudents.length}명에게 테스트 배정 완료`);
      setModalOpen(false);
      resetForm();
      loadData();
    } catch (err: any) {
      toast.error('배정 실패: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedStudents([]);
    setSelectedSets([]);
    setTestMode('web');
    setTestLevel(1);
    setTestTimeLimit('');
    setTestDirection('eng_to_kor');
    setDueDate('');
    setAssignNotes('');
    setStudentSearch('');
  };

  const handleResultSave = async () => {
    if (!resultModal) return;
    const score = parseInt(resultScore);
    const total = parseInt(resultTotal);
    if (isNaN(score) || isNaN(total) || total <= 0) {
      toast.error('점수와 총 문항 수를 올바르게 입력해주세요');
      return;
    }

    const { error } = await supabase
      .from('vocab_test_assignments')
      .update({
        score,
        total_questions: total,
        correct_count: score,
        status: 'completed',
        completed_at: new Date().toISOString(),
        result_entered_by: user?.id,
        notes: resultNotes || resultModal.notes,
      })
      .eq('id', resultModal.id);

    if (error) { toast.error('저장 실패'); return; }
    toast.success('결과 입력 완료');
    setResultModal(null);
    loadData();
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const updatePayload: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === 'in_progress') {
      updatePayload.assigned_at = new Date().toISOString();
    }

    const { error } = await supabase.from('vocab_test_assignments').update(updatePayload).eq('id', id);
    if (error) { toast.error('상태 변경 실패'); return; }
    loadData();
  };

  const openEditModal = (a: Assignment) => {
    setEditModal(a);
    setEditTestMode(a.test_mode as 'web' | 'print');
    setEditTestLevel(a.test_level);
    setEditTestTimeLimit(a.test_time_limit ? String(a.test_time_limit) : '');
    setEditTestDirection(a.test_direction);
    setEditDueDate(a.due_date || '');
    setEditNotes(a.notes || '');
    setEditSelectedSets([...a.word_set_ids]);
    setEditExpandedFolders(new Set());
  };

  const handleEditSave = async () => {
    if (!editModal) return;
    if (editSelectedSets.length === 0) { toast.error('단어 세트를 선택해주세요'); return; }
    const { error } = await supabase
      .from('vocab_test_assignments')
      .update({
        word_set_ids: editSelectedSets,
        test_mode: editTestMode,
        test_level: editTestLevel,
        test_time_limit: editTestTimeLimit ? parseInt(editTestTimeLimit) : null,
        test_direction: editTestDirection,
        due_date: editDueDate || null,
        notes: editNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editModal.id);
    if (error) { toast.error('수정 실패: ' + error.message); return; }
    toast.success('배정 수정 완료');
    setEditModal(null);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 배정을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('vocab_test_assignments').delete().eq('id', id);
    if (error) { toast.error('삭제 실패'); return; }
    toast.success('삭제 완료');
    loadData();
  };

  const toggleEditFolder = (folderId: string) => {
    setEditExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  };

  const renderEditFolderTree = (parentId: string | null, depth = 0) => {
    const foldersAtLevel = parentId ? getChildFolders(parentId) : rootFolders;
    const setsAtLevel = parentId ? getSetsInFolder(parentId) : rootSets;
    return (
      <>
        {foldersAtLevel.map(folder => {
          const isExpanded = editExpandedFolders.has(folder.id);
          const folderSets = getSetsInFolder(folder.id);
          const allSelected = folderSets.length > 0 && folderSets.every(s => editSelectedSets.includes(s.id));
          return (
            <div key={folder.id} style={{ marginLeft: depth * 16 }}>
              <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded cursor-pointer" onClick={() => toggleEditFolder(folder.id)}>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                <Folder className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-sm font-medium">{folder.name}</span>
                {folderSets.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] ml-auto" onClick={(e) => {
                    e.stopPropagation();
                    if (allSelected) setEditSelectedSets(prev => prev.filter(id => !folderSets.some(s => s.id === id)));
                    else setEditSelectedSets(prev => [...new Set([...prev, ...folderSets.map(s => s.id)])]);
                  }}>
                    {allSelected ? '전체 해제' : '전체 선택'}
                  </Button>
                )}
              </div>
              {isExpanded && renderEditFolderTree(folder.id, depth + 1)}
            </div>
          );
        })}
        {setsAtLevel.map(ws => (
          <div key={ws.id} className={cn("flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted/50", editSelectedSets.includes(ws.id) && "bg-primary/10")}
            style={{ marginLeft: (depth + 1) * 16 }}
            onClick={() => setEditSelectedSets(prev => prev.includes(ws.id) ? prev.filter(id => id !== ws.id) : [...prev, ws.id])}>
            <Checkbox checked={editSelectedSets.includes(ws.id)} className="pointer-events-none" />
            <span className="text-xs">{ws.title}</span>
          </div>
        ))}
      </>
    );
  };

  const filteredAssignments = assignments.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (filterStudent && !getStudentName(a.student_id).includes(filterStudent)) return false;
    return true;
  });

  const renderFolderTree = (parentId: string | null, depth = 0) => {
    const foldersAtLevel = parentId ? getChildFolders(parentId) : rootFolders;
    const setsAtLevel = parentId ? getSetsInFolder(parentId) : rootSets;

    return (
      <>
        {foldersAtLevel.map(folder => {
          const isExpanded = expandedFolders.has(folder.id);
          const folderSets = getSetsInFolder(folder.id);
          const allSelected = folderSets.length > 0 && folderSets.every(s => selectedSets.includes(s.id));
          return (
            <div key={folder.id} style={{ marginLeft: depth * 16 }}>
              <div
                className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded cursor-pointer"
                onClick={() => toggleFolder(folder.id)}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                <Folder className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-sm font-medium">{folder.name}</span>
                {folderSets.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] ml-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (allSelected) {
                        setSelectedSets(prev => prev.filter(id => !folderSets.some(s => s.id === id)));
                      } else {
                        setSelectedSets(prev => [...new Set([...prev, ...folderSets.map(s => s.id)])]);
                      }
                    }}
                  >
                    {allSelected ? '전체 해제' : '전체 선택'}
                  </Button>
                )}
              </div>
              {isExpanded && renderFolderTree(folder.id, depth + 1)}
            </div>
          );
        })}
        {setsAtLevel.map(ws => (
          <div
            key={ws.id}
            className={cn(
              "flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted/50",
              selectedSets.includes(ws.id) && "bg-primary/10"
            )}
            style={{ marginLeft: (depth + 1) * 16 }}
            onClick={() => toggleSetSelection(ws.id)}
          >
            <Checkbox checked={selectedSets.includes(ws.id)} className="pointer-events-none" />
            <span className="text-xs">{ws.title}</span>
          </div>
        ))}
      </>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">테스트 배정</h2>
          <p className="text-xs text-muted-foreground">학생에게 단어 테스트를 배정하고 결과를 관리합니다</p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          테스트 배정
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="assigned">배정됨</SelectItem>
            <SelectItem value="in_progress">진행중</SelectItem>
            <SelectItem value="completed">완료</SelectItem>
            <SelectItem value="expired">만료</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="학생 검색"
            value={filterStudent}
            onChange={e => setFilterStudent(e.target.value)}
            className="pl-7 h-8 text-xs w-40"
          />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: '전체', count: assignments.length, icon: Clock, color: 'text-foreground' },
          { label: '대기중', count: assignments.filter(a => a.status === 'assigned').length, icon: Clock, color: 'text-blue-600' },
          { label: '완료', count: assignments.filter(a => a.status === 'completed').length, icon: CheckCircle2, color: 'text-green-600' },
          { label: '결과 미입력', count: assignments.filter(a => a.test_mode === 'print' && a.status !== 'completed').length, icon: Pencil, color: 'text-orange-600' },
        ].map(stat => (
          <Card key={stat.label} className="py-2">
            <CardContent className="p-3 flex items-center gap-2">
              <stat.icon className={cn("w-4 h-4", stat.color)} />
              <div>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-bold">{stat.count}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Assignments table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">학생</TableHead>
                <TableHead className="text-xs">방식</TableHead>
                <TableHead className="text-xs">단어 세트</TableHead>
                <TableHead className="text-xs">레벨</TableHead>
                <TableHead className="text-xs">상태</TableHead>
                <TableHead className="text-xs">결과</TableHead>
                <TableHead className="text-xs">배정일</TableHead>
                <TableHead className="text-xs w-20">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                    배정된 테스트가 없습니다
                  </TableCell>
                </TableRow>
              ) : (
                filteredAssignments.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs font-medium">{getStudentName(a.student_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {a.test_mode === 'web' ? <Monitor className="w-3 h-3" /> : <Printer className="w-3 h-3" />}
                        {a.test_mode === 'web' ? '웹' : '인쇄'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">
                      {a.word_set_ids.map(id => getSetTitle(id)).join(', ')}
                    </TableCell>
                    <TableCell className="text-xs">
                      Lv.{a.test_level} · {DIRECTION_MAP[a.test_direction] || a.test_direction}
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", STATUS_MAP[a.status]?.color)}>
                        {STATUS_MAP[a.status]?.label || a.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.status === 'completed' && a.score !== null
                        ? `${a.correct_count}/${a.total_questions}`
                        : <span className="text-muted-foreground">-</span>
                      }
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(a.assigned_at), 'MM/dd', { locale: ko })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {a.status === 'assigned' && (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => handleStatusChange(a.id, 'in_progress')}
                          >
                            오픈
                          </Button>
                        )}
                        {a.status === 'assigned' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => openEditModal(a)}
                          >
                            수정
                          </Button>
                        )}
                        {a.test_mode === 'print' && a.status !== 'completed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => {
                              setResultModal(a);
                              setResultScore('');
                              setResultTotal('');
                              setResultNotes(a.notes || '');
                            }}
                          >
                            결과 입력
                          </Button>
                        )}
                        {a.status === 'in_progress' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => handleStatusChange(a.id, 'assigned')}
                          >
                            예정으로
                          </Button>
                        )}
                        {(a.status === 'assigned' || a.status === 'in_progress') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2 text-destructive"
                            onClick={() => handleStatusChange(a.id, 'expired')}
                          >
                            만료
                          </Button>
                        )}
                        {a.status === 'assigned' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2 text-destructive"
                            onClick={() => handleDelete(a.id)}
                          >
                            삭제
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Assignment Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">테스트 배정</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Student Selection */}
            <div>
              <Label className="text-xs font-medium mb-1.5 block">학생 선택</Label>
              <Input
                placeholder="학생 검색..."
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                className="h-8 text-xs mb-2"
              />
              <div className="border rounded-md max-h-36 overflow-y-auto p-1.5 space-y-0.5">
                {filteredStudentsForModal.map(s => (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted/50 text-xs",
                      selectedStudents.includes(s.id) && "bg-primary/10"
                    )}
                    onClick={() => toggleStudentSelection(s.id)}
                  >
                    <Checkbox checked={selectedStudents.includes(s.id)} className="pointer-events-none" />
                    <span>{s.name}</span>
                    {s.grade && <span className="text-muted-foreground text-[10px]">{s.grade}</span>}
                  </div>
                ))}
              </div>
              {selectedStudents.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">{selectedStudents.length}명 선택됨</p>
              )}
            </div>

            {/* Word Set Selection */}
            <div>
              <Label className="text-xs font-medium mb-1.5 block">단어 세트 선택</Label>
              <div className="border rounded-md max-h-48 overflow-y-auto p-1.5">
                {renderFolderTree(null)}
              </div>
              {selectedSets.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">{selectedSets.length}개 세트 선택됨</p>
              )}
            </div>

            {/* Test Options */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">테스트 방식</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={testMode === 'web' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1 text-xs h-8"
                    onClick={() => setTestMode('web')}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    웹 테스트
                  </Button>
                  <Button
                    type="button"
                    variant={testMode === 'print' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1 text-xs h-8"
                    onClick={() => setTestMode('print')}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    인쇄 시험지
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1 block">출제 방향</Label>
                <Select value={testDirection} onValueChange={setTestDirection}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eng_to_kor">영→한</SelectItem>
                    <SelectItem value="kor_to_eng">한→영</SelectItem>
                    <SelectItem value="mixed">혼합</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {testMode === 'web' && (
                <>
                  <div>
                    <Label className="text-xs mb-1 block">테스트 레벨</Label>
                    <Select value={String(testLevel)} onValueChange={v => setTestLevel(Number(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Lv.1 (3지선다)</SelectItem>
                        <SelectItem value="2">Lv.2 (5지선다)</SelectItem>
                        <SelectItem value="3">Lv.3 (주관식)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs mb-1 block">총 제한시간 (초)</Label>
                    <Input
                      type="number"
                      value={testTimeLimit}
                      onChange={e => setTestTimeLimit(e.target.value)}
                      placeholder="미설정 시 무제한"
                      className="h-8 text-xs"
                    />
                  </div>
                </>
              )}

              <div>
                <Label className="text-xs mb-1 block">마감일 (선택)</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1 block">메모 (선택)</Label>
              <Textarea
                value={assignNotes}
                onChange={e => setAssignNotes(e.target.value)}
                placeholder="조교에게 전달할 메모..."
                className="text-xs h-16 resize-none"
              />
            </div>

            <Button onClick={handleCreate} disabled={saving} className="w-full gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {selectedStudents.length}명에게 배정
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Result Entry Modal */}
      <Dialog open={!!resultModal} onOpenChange={() => setResultModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">인쇄 시험 결과 입력</DialogTitle>
          </DialogHeader>
          {resultModal && (
            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-medium">{getStudentName(resultModal.student_id)}</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {resultModal.word_set_ids.map(id => getSetTitle(id)).join(', ')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">맞은 개수</Label>
                  <Input
                    type="number"
                    value={resultScore}
                    onChange={e => setResultScore(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">총 문항 수</Label>
                  <Input
                    type="number"
                    value={resultTotal}
                    onChange={e => setResultTotal(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">메모</Label>
                <Textarea
                  value={resultNotes}
                  onChange={e => setResultNotes(e.target.value)}
                  className="text-xs h-16 resize-none"
                />
              </div>
              <Button onClick={handleResultSave} className="w-full">결과 저장</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Assignment Modal */}
      <Dialog open={!!editModal} onOpenChange={() => setEditModal(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">배정 수정 — {editModal ? getStudentName(editModal.student_id) : ''}</DialogTitle>
          </DialogHeader>
          {editModal && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-medium mb-1.5 block">단어 세트</Label>
                <div className="border rounded-md max-h-48 overflow-y-auto p-1.5">
                  {renderEditFolderTree(null)}
                </div>
                {editSelectedSets.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">{editSelectedSets.length}개 세트 선택됨</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">테스트 방식</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant={editTestMode === 'web' ? 'default' : 'outline'} size="sm" className="flex-1 gap-1 text-xs h-8" onClick={() => setEditTestMode('web')}>
                      <Monitor className="w-3.5 h-3.5" /> 웹
                    </Button>
                    <Button type="button" variant={editTestMode === 'print' ? 'default' : 'outline'} size="sm" className="flex-1 gap-1 text-xs h-8" onClick={() => setEditTestMode('print')}>
                      <Printer className="w-3.5 h-3.5" /> 인쇄
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">출제 방향</Label>
                  <Select value={editTestDirection} onValueChange={setEditTestDirection}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eng_to_kor">영→한</SelectItem>
                      <SelectItem value="kor_to_eng">한→영</SelectItem>
                      <SelectItem value="mixed">혼합</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editTestMode === 'web' && (
                  <>
                    <div>
                      <Label className="text-xs mb-1 block">테스트 레벨</Label>
                      <Select value={String(editTestLevel)} onValueChange={v => setEditTestLevel(Number(v))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Lv.1 (3지선다)</SelectItem>
                          <SelectItem value="2">Lv.2 (5지선다)</SelectItem>
                          <SelectItem value="3">Lv.3 (주관식)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">총 제한시간 (초)</Label>
                      <Input type="number" value={editTestTimeLimit} onChange={e => setEditTestTimeLimit(e.target.value)} placeholder="미설정 시 무제한" className="h-8 text-xs" />
                    </div>
                  </>
                )}
                <div>
                  <Label className="text-xs mb-1 block">마감일</Label>
                  <Input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">메모</Label>
                <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} className="text-xs h-16 resize-none" />
              </div>
              <Button onClick={handleEditSave} className="w-full">수정 저장</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
