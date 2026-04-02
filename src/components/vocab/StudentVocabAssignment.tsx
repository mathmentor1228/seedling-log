import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Search, Save, Folder, Users, ChevronDown, ChevronRight, Target, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface VocabFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

interface WordSet {
  id: string;
  title: string;
  round_number: number;
  folder_id: string | null;
}

interface Student {
  id: string;
  name: string;
  school: string | null;
  grade_year: number | null;
  school_level: string | null;
}

interface Assignment {
  word_set_id: string;
  required_rounds: number;
}

interface Completion {
  student_id: string;
  word_set_ids: string[];
  completed_at: string;
}

export function StudentVocabAssignment() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [sets, setSets] = useState<WordSet[]>([]);
  const [folders, setFolders] = useState<VocabFolder[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({});
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [defaultRounds, setDefaultRounds] = useState(3);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [studentsRes, setsRes, foldersRes, assignRes, completionsRes] = await Promise.all([
      supabase.from('students').select('id, name, school, grade_year, school_level').in('enrollment_status', ['재학']).order('name'),
      supabase.from('vocab_word_sets').select('id, title, round_number, folder_id').order('round_number'),
      supabase.from('vocab_folders').select('id, name, parent_id').order('sort_order'),
      supabase.from('student_vocab_assignments').select('student_id, word_set_id, required_rounds'),
      supabase.from('vocab_card_completions').select('student_id, word_set_ids, completed_at').order('completed_at', { ascending: false }).limit(1000),
    ]);

    if (studentsRes.data) setStudents(studentsRes.data);
    if (setsRes.data) setSets(setsRes.data as WordSet[]);
    if (foldersRes.data) setFolders(foldersRes.data);
    if (completionsRes.data) setCompletions(completionsRes.data as Completion[]);

    const map: Record<string, Assignment[]> = {};
    if (assignRes.data) {
      for (const a of assignRes.data) {
        if (!map[a.student_id]) map[a.student_id] = [];
        map[a.student_id].push({
          word_set_id: a.word_set_id,
          required_rounds: (a as any).required_rounds || 0,
        });
      }
    }
    setAssignments(map);
  };

  const getCompletionCount = (studentId: string, setId: string) => {
    return completions.filter(c =>
      c.student_id === studentId && c.word_set_ids.includes(setId)
    ).length;
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getSetIdsInFolder = (folderId: string): string[] => {
    const directSets = sets.filter(s => s.folder_id === folderId).map(s => s.id);
    const childFolders = folders.filter(f => f.parent_id === folderId);
    const childSetIds = childFolders.flatMap(cf => getSetIdsInFolder(cf.id));
    return [...directSets, ...childSetIds];
  };

  const getStudentAssignment = (studentId: string, setId: string): Assignment | undefined => {
    return (assignments[studentId] || []).find(a => a.word_set_id === setId);
  };

  const isSetAssigned = (studentId: string, setId: string) => {
    return !!getStudentAssignment(studentId, setId);
  };

  const toggleSetForStudent = (studentId: string, setId: string) => {
    setAssignments(prev => {
      const current = prev[studentId] || [];
      const exists = current.find(a => a.word_set_id === setId);
      const next = exists
        ? current.filter(a => a.word_set_id !== setId)
        : [...current, { word_set_id: setId, required_rounds: defaultRounds }];
      return { ...prev, [studentId]: next };
    });
  };

  const toggleFolderForStudent = (studentId: string, folderId: string) => {
    const ids = getSetIdsInFolder(folderId);
    const current = assignments[studentId] || [];
    const allSelected = ids.every(id => current.some(a => a.word_set_id === id));
    if (allSelected) {
      setAssignments(prev => ({
        ...prev,
        [studentId]: current.filter(a => !ids.includes(a.word_set_id)),
      }));
    } else {
      const newAssignments = ids
        .filter(id => !current.some(a => a.word_set_id === id))
        .map(id => ({ word_set_id: id, required_rounds: defaultRounds }));
      setAssignments(prev => ({
        ...prev,
        [studentId]: [...current, ...newAssignments],
      }));
    }
  };

  const updateRounds = (studentId: string, setId: string, rounds: number) => {
    setAssignments(prev => {
      const current = prev[studentId] || [];
      return {
        ...prev,
        [studentId]: current.map(a =>
          a.word_set_id === setId ? { ...a, required_rounds: rounds } : a
        ),
      };
    });
  };

  const handleSave = async () => {
    if (!selectedStudentId) return;
    setSaving(true);
    try {
      await supabase.from('student_vocab_assignments').delete().eq('student_id', selectedStudentId);

      const currentAssignments = assignments[selectedStudentId] || [];
      if (currentAssignments.length > 0) {
        const rows = currentAssignments.map(a => ({
          student_id: selectedStudentId,
          word_set_id: a.word_set_id,
          assigned_by: user!.id,
          required_rounds: a.required_rounds,
        }));
        const { error } = await supabase.from('student_vocab_assignments').insert(rows);
        if (error) throw error;
      }
      toast({ title: '저장 완료' });
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const filteredStudents = students.filter(s =>
    s.name.includes(searchQuery) || (s.school || '').includes(searchQuery)
  );

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const selectedAssignments = selectedStudentId ? (assignments[selectedStudentId] || []) : [];

  // Summary for student list: homework progress
  const getStudentProgress = (studentId: string) => {
    const studentAssigns = assignments[studentId] || [];
    const withTarget = studentAssigns.filter(a => a.required_rounds > 0);
    if (withTarget.length === 0) return null;
    const completed = withTarget.filter(a => getCompletionCount(studentId, a.word_set_id) >= a.required_rounds).length;
    return { completed, total: withTarget.length };
  };

  // Count assigned sets per folder for the selected student
  const getAssignedCountInFolder = (folderId: string): { assigned: number; completed: number; total: number } => {
    if (!selectedStudentId) return { assigned: 0, completed: 0, total: 0 };
    const setIds = getSetIdsInFolder(folderId);
    const assigned = setIds.filter(id => isSetAssigned(selectedStudentId, id)).length;
    const completed = setIds.filter(id => {
      const a = getStudentAssignment(selectedStudentId, id);
      return a && a.required_rounds > 0 && getCompletionCount(selectedStudentId, id) >= a.required_rounds;
    }).length;
    return { assigned, completed, total: setIds.length };
  };

  const renderFolderTree = (parentId: string | null, depth: number = 0) => {
    const childFolders = folders.filter(f => f.parent_id === parentId);
    return childFolders.map(folder => {
      const isExpanded = expandedFolders.has(folder.id);
      const folderSetIds = getSetIdsInFolder(folder.id);
      const allChecked = folderSetIds.length > 0 && folderSetIds.every(id => isSetAssigned(selectedStudentId!, id));
      const someChecked = folderSetIds.some(id => isSetAssigned(selectedStudentId!, id));
      const folderSets = sets.filter(s => s.folder_id === folder.id);
      const folderStats = getAssignedCountInFolder(folder.id);

      return (
        <div key={folder.id}>
          <div
            className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted cursor-pointer text-sm"
            style={{ paddingLeft: `${depth * 16 + 4}px` }}
          >
            {selectedStudentId && (
              <Checkbox
                checked={allChecked}
                className={someChecked && !allChecked ? 'opacity-60' : ''}
                onCheckedChange={() => toggleFolderForStudent(selectedStudentId, folder.id)}
              />
            )}
            <div className="flex items-center gap-1 flex-1" onClick={() => toggleFolder(folder.id)}>
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              <Folder className="w-3.5 h-3.5 text-amber-500" />
              <span className="truncate">{folder.name}</span>
              <span className="text-[10px] text-muted-foreground ml-1">({folderSetIds.length})</span>
            </div>
            {selectedStudentId && folderStats.assigned > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] px-1.5',
                  folderStats.completed === folderStats.assigned
                    ? 'border-emerald-400/40 text-emerald-700 bg-emerald-500/5'
                    : 'border-warning/40 text-warning bg-warning/5'
                )}
              >
                {folderStats.completed}/{folderStats.assigned}
              </Badge>
            )}
          </div>
          {isExpanded && (
            <div>
              {renderFolderTree(folder.id, depth + 1)}
              {folderSets.map(s => {
                const assigned = isSetAssigned(selectedStudentId!, s.id);
                const assignment = getStudentAssignment(selectedStudentId!, s.id);
                const completionCount = getCompletionCount(selectedStudentId!, s.id);
                const targetMet = assignment && assignment.required_rounds > 0 && completionCount >= assignment.required_rounds;

                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center gap-2 p-1.5 rounded-md hover:bg-muted text-sm transition-colors',
                      targetMet && 'bg-emerald-500/5',
                      assigned && !targetMet && 'bg-warning/5'
                    )}
                    style={{ paddingLeft: `${(depth + 1) * 16 + 20}px` }}
                  >
                    {selectedStudentId && (
                      <Checkbox
                        checked={assigned}
                        onCheckedChange={() => toggleSetForStudent(selectedStudentId, s.id)}
                      />
                    )}
                    <span className="text-xs text-muted-foreground">#{s.round_number}</span>
                    <span className="truncate flex-1">{s.title}</span>
                    {assigned && (
                      <div className="flex items-center gap-1">
                        {targetMet && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                        {assignment!.required_rounds > 0 && (
                          <span className={cn('text-[10px]', targetMet ? 'text-emerald-600' : 'text-muted-foreground')}>
                            {completionCount}/{assignment!.required_rounds}회
                          </span>
                        )}
                        <Input
                          type="number"
                          min={0}
                          max={99}
                          value={assignment!.required_rounds}
                          onChange={e => updateRounds(selectedStudentId!, s.id, parseInt(e.target.value) || 0)}
                          className="w-14 h-6 text-xs text-center p-0"
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  };

  const unfiledSets = sets.filter(s => !s.folder_id);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Student list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4" /> 학생 선택
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="이름 또는 학교 검색"
              className="h-8 text-sm pl-7"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-0.5 max-h-[500px] overflow-y-auto">
          {filteredStudents.map(s => {
            const progress = getStudentProgress(s.id);
            const progressPercent = progress ? Math.round((progress.completed / progress.total) * 100) : 0;
            const isComplete = progress && progress.completed === progress.total;
            return (
              <div
                key={s.id}
                className={cn(
                  'p-2 rounded-md cursor-pointer text-sm transition-colors',
                  selectedStudentId === s.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
                )}
                onClick={() => setSelectedStudentId(s.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    <span>{s.name}</span>
                    {s.school && <span className="text-xs text-muted-foreground">{s.school}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {(assignments[s.id]?.length || 0) > 0 && (
                      <Badge variant="secondary" className="text-[10px]">{assignments[s.id].length}개</Badge>
                    )}
                  </div>
                </div>
                {progress && (
                  <div className="mt-1.5 space-y-0.5">
                    <Progress value={progressPercent} className="h-1.5" />
                    <span className="text-[9px] text-muted-foreground">{progress.completed}/{progress.total} 완료</span>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Set assignment */}
      <Card className="relative">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>
              {selectedStudent
                ? `${selectedStudent.name}의 단어 범위`
                : '학생을 선택하세요'}
            </span>
          </CardTitle>
          {selectedStudentId && (
            <div className="flex items-center gap-2 mt-2">
              <Target className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">기본 목표 회차:</span>
              <Input
                type="number"
                min={0}
                max={99}
                value={defaultRounds}
                onChange={e => setDefaultRounds(parseInt(e.target.value) || 0)}
                className="w-16 h-6 text-xs text-center p-0"
              />
              <span className="text-xs text-muted-foreground">회</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="max-h-[440px] overflow-y-auto pb-16">
          {!selectedStudentId ? (
            <p className="text-sm text-muted-foreground text-center py-8">왼쪽에서 학생을 선택하세요</p>
          ) : (
            <div className="space-y-0.5">
              {renderFolderTree(null)}
              {unfiledSets.length > 0 && (
                <>
                  {folders.length > 0 && <div className="text-[10px] text-muted-foreground pt-2 pb-1 border-t mt-1">미분류</div>}
                  {unfiledSets.map(s => {
                    const assigned = isSetAssigned(selectedStudentId, s.id);
                    const assignment = getStudentAssignment(selectedStudentId, s.id);
                    const completionCount = getCompletionCount(selectedStudentId, s.id);
                    return (
                      <div key={s.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted text-sm" style={{ paddingLeft: '20px' }}>
                        <Checkbox
                          checked={assigned}
                          onCheckedChange={() => toggleSetForStudent(selectedStudentId, s.id)}
                        />
                        <span className="text-xs text-muted-foreground">#{s.round_number}</span>
                        <span className="truncate flex-1">{s.title}</span>
                        {assigned && assignment && (
                          <div className="flex items-center gap-1">
                            {assignment.required_rounds > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {completionCount}/{assignment.required_rounds}회
                              </span>
                            )}
                            <Input
                              type="number"
                              min={0}
                              max={99}
                              value={assignment.required_rounds}
                              onChange={e => updateRounds(selectedStudentId, s.id, parseInt(e.target.value) || 0)}
                              className="w-14 h-6 text-xs text-center p-0"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </CardContent>

        {/* Sticky save button */}
        {selectedStudentId && (
          <div className="absolute bottom-0 left-0 right-0 p-3 border-t bg-card/95 backdrop-blur-sm rounded-b-lg">
            <Button size="sm" onClick={handleSave} disabled={saving} className="w-full">
              <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
