import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, X, Users } from 'lucide-react';
import { getTodayKST } from '@/lib/utils';

const SUBJECTS = ['수학', '과학', '영어', '국어'] as const;

const TIME_OPTIONS = Array.from({ length: 25 }, (_, i) => {
  const hour = 9 + Math.floor(i / 2);
  const minute = (i % 2) * 30;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
});

interface StudentOption {
  id: string;
  name: string;
}

interface TeacherOption {
  id: string;
  name: string;
}

interface SupplementEntry {
  student_id: string;
  subject: string;
  time: string;
}

interface BatchSupplementaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function BatchSupplementaryModal({ open, onOpenChange, onSaved }: BatchSupplementaryModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Shared fields
  const [lessonDate, setLessonDate] = useState(getTodayKST());
  const [teacherId, setTeacherId] = useState('');
  const [sharedTime, setSharedTime] = useState('');
  const [sharedSubject, setSharedSubject] = useState('');

  // Entries
  const [entries, setEntries] = useState<SupplementEntry[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  useEffect(() => {
    if (open) {
      fetchData();
      setEntries([]);
      setLessonDate(getTodayKST());
      setTeacherId(user?.id || '');
      setSharedTime('');
      setSharedSubject('');
      setSelectedStudentId('');
    }
  }, [open]);

  async function fetchData() {
    setLoading(true);
    const [studentsRes, profilesRes] = await Promise.all([
      supabase.from('students').select('id, name').neq('enrollment_status', '퇴원').order('name'),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);
    setStudents(studentsRes.data || []);
    setTeachers((profilesRes.data || []).map(p => ({ id: p.id, name: p.full_name })));
    setLoading(false);
  }

  function addEntry() {
    if (!selectedStudentId) return;
    if (entries.some(e => e.student_id === selectedStudentId && e.subject === (sharedSubject || ''))) return;
    setEntries(prev => [...prev, {
      student_id: selectedStudentId,
      subject: sharedSubject,
      time: sharedTime,
    }]);
    setSelectedStudentId('');
  }

  function removeEntry(idx: number) {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  }

  function getStudentName(id: string) {
    return students.find(s => s.id === id)?.name || id;
  }

  async function handleSave() {
    if (entries.length === 0) {
      toast({ title: '학생을 추가해주세요', variant: 'destructive' });
      return;
    }
    if (!teacherId) {
      toast({ title: '선생님을 선택해주세요', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const teacherName = teachers.find(t => t.id === teacherId)?.name || '';
      const records = entries.map(entry => {
        const time = entry.time || sharedTime || '미정';
        const subject = entry.subject || sharedSubject;
        if (!subject) throw new Error('과목을 선택해주세요');

        const notesContent = [
          `[보충 시간: ${time}]`,
          teacherName ? `[보충 선생님: ${teacherName}]` : '',
        ].filter(Boolean).join('\n');

        return {
          teacher_id: teacherId,
          student_id: entry.student_id,
          class_id: null as string | null,
          subject: subject as any,
          lesson_date: lessonDate,
          lesson_range: '보충수업 예정',
          homework_status: 'none_assigned',
          lesson_types: ['보충수업'],
          attendance_status: ['정상등원'],
          notes: notesContent,
          submitted: false,
        };
      });

      const { error } = await supabase.from('lesson_records').insert(records);
      if (error) throw error;

      toast({ title: '보충수업 일괄 등록 완료', description: `${entries.length}명의 보충수업이 등록되었습니다.` });
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast({ title: '등록 실패', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const availableStudents = students.filter(s => !entries.some(e => e.student_id === s.id && e.subject === (sharedSubject || '')));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0 bg-secondary/30">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Users className="w-4 h-4" />
            보충수업 일괄 등록
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-5 pb-5 pt-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Shared fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">보충수업 날짜</Label>
                  <Input
                    type="date"
                    value={lessonDate}
                    onChange={(e) => setLessonDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">담당 선생님</Label>
                  <Select value={teacherId} onValueChange={setTeacherId}>
                    <SelectTrigger>
                      <SelectValue placeholder="선생님 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">공통 과목</Label>
                  <Select value={sharedSubject} onValueChange={setSharedSubject}>
                    <SelectTrigger>
                      <SelectValue placeholder="과목 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">공통 시간</Label>
                  <Select value={sharedTime || '__none__'} onValueChange={(v) => setSharedTime(v === '__none__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="시간 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">미정</SelectItem>
                      {TIME_OPTIONS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Add student */}
              <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                <Label className="text-sm font-semibold">학생 추가</Label>
                <div className="flex gap-2">
                  <Select value={selectedStudentId || '_placeholder_'} onValueChange={(v) => v !== '_placeholder_' && setSelectedStudentId(v)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="학생 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_placeholder_" disabled>학생 선택</SelectItem>
                      {availableStudents.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addEntry}
                    disabled={!selectedStudentId || !sharedSubject}
                    className="h-10"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Entry list */}
              {entries.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">등록 학생 ({entries.length}명)</Label>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {entries.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-md border border-border/50">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{getStudentName(entry.student_id)}</span>
                          <Badge variant="outline" className="text-xs">{entry.subject || sharedSubject}</Badge>
                          <Badge variant="secondary" className="text-xs font-mono">{entry.time || sharedTime || '미정'}</Badge>
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeEntry(idx)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Save */}
              <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || entries.length === 0 || !teacherId || !sharedSubject}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  일괄 등록 ({entries.length}명)
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
