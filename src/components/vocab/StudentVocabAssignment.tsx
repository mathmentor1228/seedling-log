import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Search, Save, Folder, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

export function StudentVocabAssignment() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [sets, setSets] = useState<WordSet[]>([]);
  const [folders, setFolders] = useState<VocabFolder[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({}); // student_id -> set_ids
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [studentsRes, setsRes, foldersRes, assignRes] = await Promise.all([
      supabase.from('students').select('id, name, school, grade_year, school_level').eq('enrollment_status', 'active').order('name'),
      supabase.from('vocab_word_sets').select('id, title, round_number, folder_id').order('round_number'),
      supabase.from('vocab_folders').select('id, name, parent_id').order('sort_order'),
      supabase.from('student_vocab_assignments').select('student_id, word_set_id'),
    ]);

    if (studentsRes.data) setStudents(studentsRes.data);
    if (setsRes.data) setSets(setsRes.data as WordSet[]);
    if (foldersRes.data) setFolders(foldersRes.data);

    // Build assignment map
    const map: Record<string, string[]> = {};
    if (assignRes.data) {
      for (const a of assignRes.data) {
        if (!map[a.student_id]) map[a.student_id] = [];
        map[a.student_id].push(a.word_set_id);
      }
    }
    setAssignments(map);
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

  const toggleSetForStudent = (studentId: string, setId: string) => {
    setAssignments(prev => {
      const current = prev[studentId] || [];
      const next = current.includes(setId)
        ? current.filter(id => id !== setId)
        : [...current, setId];
      return { ...prev, [studentId]: next };
    });
  };

  const toggleFolderForStudent = (studentId: string, folderId: string) => {
    const ids = getSetIdsInFolder(folderId);
    const current = assignments[studentId] || [];
    const allSelected = ids.every(id => current.includes(id));
    if (allSelected) {
      setAssignments(prev => ({ ...prev, [studentId]: current.filter(id => !ids.includes(id)) }));
    } else {
      setAssignments(prev => ({ ...prev, [studentId]: [...new Set([...current, ...ids])] }));
    }
  };

  const handleSave = async () => {
    if (!selectedStudentId) return;
    setSaving(true);
    try {
      // Delete existing assignments
      await supabase.from('student_vocab_assignments').delete().eq('student_id', selectedStudentId);

      // Insert new assignments
      const setIds = assignments[selectedStudentId] || [];
      if (setIds.length > 0) {
        const rows = setIds.map(word_set_id => ({
          student_id: selectedStudentId,
          word_set_id,
          assigned_by: user!.id,
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

  const renderFolderTree = (parentId: string | null, depth: number = 0) => {
    const childFolders = folders.filter(f => f.parent_id === parentId);
    return childFolders.map(folder => {
      const isExpanded = expandedFolders.has(folder.id);
      const folderSetIds = getSetIdsInFolder(folder.id);
      const allChecked = folderSetIds.length > 0 && folderSetIds.every(id => selectedAssignments.includes(id));
      const someChecked = folderSetIds.some(id => selectedAssignments.includes(id));
      const folderSets = sets.filter(s => s.folder_id === folder.id);

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
          </div>
          {isExpanded && (
            <div>
              {renderFolderTree(folder.id, depth + 1)}
              {folderSets.map(s => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted cursor-pointer text-sm"
                  style={{ paddingLeft: `${(depth + 1) * 16 + 20}px` }}
                >
                  {selectedStudentId && (
                    <Checkbox
                      checked={selectedAssignments.includes(s.id)}
                      onCheckedChange={() => toggleSetForStudent(selectedStudentId, s.id)}
                    />
                  )}
                  <span className="text-xs text-muted-foreground">#{s.round_number}</span>
                  <span className="truncate">{s.title}</span>
                </label>
              ))}
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
          <CardTitle className="flex items-center gap-2">
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
          {filteredStudents.map(s => (
            <div
              key={s.id}
              className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-sm transition-colors ${selectedStudentId === s.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'}`}
              onClick={() => setSelectedStudentId(s.id)}
            >
              <div>
                <span>{s.name}</span>
                {s.school && <span className="text-xs text-muted-foreground ml-1.5">{s.school}</span>}
              </div>
              {(assignments[s.id]?.length || 0) > 0 && (
                <Badge variant="secondary" className="text-[10px]">{assignments[s.id].length}개</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Set assignment */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>
              {selectedStudent
                ? `${selectedStudent.name}의 단어 범위`
                : '학생을 선택하세요'}
            </span>
            {selectedStudentId && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="w-3.5 h-3.5 mr-1" /> {saving ? '저장 중...' : '저장'}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-[500px] overflow-y-auto">
          {!selectedStudentId ? (
            <p className="text-sm text-muted-foreground text-center py-8">왼쪽에서 학생을 선택하세요</p>
          ) : (
            <div className="space-y-0.5">
              {renderFolderTree(null)}
              {unfiledSets.length > 0 && (
                <>
                  {folders.length > 0 && <div className="text-[10px] text-muted-foreground pt-2 pb-1 border-t mt-1">미분류</div>}
                  {unfiledSets.map(s => (
                    <label key={s.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted cursor-pointer text-sm" style={{ paddingLeft: '20px' }}>
                      <Checkbox
                        checked={selectedAssignments.includes(s.id)}
                        onCheckedChange={() => toggleSetForStudent(selectedStudentId, s.id)}
                      />
                      <span className="text-xs text-muted-foreground">#{s.round_number}</span>
                      <span className="truncate">{s.title}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
