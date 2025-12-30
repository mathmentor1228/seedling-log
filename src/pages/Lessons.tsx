import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScoreBadge } from '@/components/ui/score-badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Edit2, Trash2, Loader2, ClipboardList, Save, Send, FileEdit } from 'lucide-react';
import { format } from 'date-fns';

type SubjectType = '수학' | '과학' | '영어' | '국어';

interface LessonRecord {
  id: string;
  student_id: string;
  class_id: string | null;
  subject: SubjectType;
  lesson_date: string;
  lesson_range: string;
  understanding_score: number;
  homework_status: string;
  learning_issues: string[];
  next_lesson_goal: string | null;
  notes: string | null;
  student_name?: string;
  submitted: boolean;
  submitted_at: string | null;
  draft_created_at: string;
}

interface Student {
  id: string;
  name: string;
}

interface ClassItem {
  id: string;
  name: string;
  subject: string;
}

const SUBJECTS = [
  { value: '수학', label: '수학' },
  { value: '과학', label: '과학' },
  { value: '영어', label: '영어' },
  { value: '국어', label: '국어' },
] as const;

const SUBJECT_VALUES: SubjectType[] = ['수학', '과학', '영어', '국어'];

function subjectStorageKey(userId?: string | null) {
  return userId ? `lesson_records:lastSelectedSubject:${userId}` : 'lesson_records:lastSelectedSubject';
}

function getLastSelectedSubject(userId?: string | null): SubjectType {
  const raw = localStorage.getItem(subjectStorageKey(userId));
  if (raw && SUBJECT_VALUES.includes(raw as SubjectType)) return raw as SubjectType;
  return '수학';
}

function setLastSelectedSubject(userId: string | null | undefined, subject: SubjectType) {
  localStorage.setItem(subjectStorageKey(userId), subject);
}


const LEARNING_ISSUES = [
  '집중력 부족',
  '어휘력 부족',
  '개념 이해 어려움',
  '문제 해결 능력',
  '기억력',
  '시험 불안',
  '숙제 완수',
  '시간 관리',
];

const HOMEWORK_STATUS = [
  { value: 'completed', label: '완료' },
  { value: 'partial', label: '부분 완료' },
  { value: 'not_done', label: '미완료' },
  { value: 'none_assigned', label: '미배정' },
];

export default function Lessons() {
  const { user, role } = useAuth();
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LessonRecord | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    student_id: '',
    class_id: '',
    subject: '',
    lesson_date: format(new Date(), 'yyyy-MM-dd'),
    lesson_range: '',
    understanding_score: '3',
    homework_status: 'none_assigned',
    learning_issues: [] as string[],
    next_lesson_goal: '',
    notes: '',
  });
  const { toast } = useToast();
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchLessons();
    fetchStudents();
    fetchClasses();
  }, [user, role]);

  // Auto-save effect
  useEffect(() => {
    if (!currentDraftId || !isDialogOpen) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      handleAutoSave();
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [formData, currentDraftId, isDialogOpen]);

  async function fetchLessons() {
    if (!user) return;

    try {
      let query = supabase
        .from('lesson_records')
        .select(`
          *,
          students:student_id (name)
        `)
        .order('lesson_date', { ascending: false });

      if (role === 'teacher') {
        query = query.eq('teacher_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedLessons = (data || []).map((l: any) => ({
        ...l,
        student_name: l.students?.name,
      }));

      setLessons(formattedLessons);
    } catch (error) {
      console.error('Error fetching lessons:', error);
      toast({
        title: '오류',
        description: '수업 기록을 불러오는데 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudents() {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  }

  async function fetchClasses() {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, subject')
        .order('name');

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  }

  // Create initial draft when opening form for new record
  async function createInitialDraft() {
    if (!user) return;

    try {
      const defaultStudent = students[0]?.id || '';
      const lastSubject = getLastSelectedSubject(user.id);

      const { data, error } = await supabase
        .from('lesson_records')
        .insert({
          teacher_id: user.id,
          student_id: defaultStudent,
          subject: lastSubject,
          lesson_date: format(new Date(), 'yyyy-MM-dd'),
          lesson_range: '',
          understanding_score: 3,
          homework_status: 'none_assigned',
          learning_issues: [],
          submitted: false,
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentDraftId(data.id);
      setFormData({
        student_id: defaultStudent,
        class_id: '',
        subject: lastSubject,
        lesson_date: format(new Date(), 'yyyy-MM-dd'),
        lesson_range: '',
        understanding_score: '3',
        homework_status: 'none_assigned',
        learning_issues: [],
        next_lesson_goal: '',
        notes: '',
      });

      return data.id;
    } catch (error: any) {
      console.error('Error creating draft:', error);
      toast({
        title: '오류',
        description: '임시저장 생성에 실패했습니다',
        variant: 'destructive',
      });
      return null;
    }
  }

  // Auto-save to existing draft
  const handleAutoSave = useCallback(async () => {
    if (!currentDraftId || !user) return;

    try {
      const payload = buildPayload();
      if (!payload.student_id) return; // Don't save if no student selected

      await supabase
        .from('lesson_records')
        .update({
          ...payload,
          submitted: false,
        })
        .eq('id', currentDraftId);
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  }, [currentDraftId, formData, user]);

  function buildPayload() {
    const subject = formData.subject as SubjectType;
    return {
      teacher_id: user!.id,
      student_id: formData.student_id,
      class_id: formData.class_id || null,
      subject,
      lesson_date: formData.lesson_date,
      lesson_range: formData.lesson_range.trim(),
      understanding_score: parseInt(formData.understanding_score),
      homework_status: formData.homework_status,
      learning_issues: formData.learning_issues,
      next_lesson_goal: formData.next_lesson_goal.trim() || null,
      notes: formData.notes.trim() || null,
    };
  }

  // Manual save as draft
  const handleSaveDraft = async () => {
    if (!user) return;

    if (!formData.student_id) {
      toast({
        title: '유효성 오류',
        description: '학생을 선택해주세요',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingDraft(true);

    try {
      const payload = buildPayload();
      const draftId = currentDraftId || editingLesson?.id;

      if (draftId) {
        const { error } = await supabase
          .from('lesson_records')
          .update({
            ...payload,
            submitted: false,
          })
          .eq('id', draftId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('lesson_records')
          .insert({
            ...payload,
            submitted: false,
          })
          .select()
          .single();

        if (error) throw error;
        setCurrentDraftId(data.id);
      }

      toast({
        title: '임시저장 완료',
        description: '수업 기록이 임시저장되었습니다',
      });

      fetchLessons();
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast({
        title: '오류',
        description: error.message || '임시저장에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Submit record
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user) return;

    if (!formData.student_id || !formData.subject || !formData.lesson_range) {
      toast({
        title: '유효성 오류',
        description: '필수 항목을 모두 입력해주세요',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        ...buildPayload(),
        submitted: true,
        submitted_at: new Date().toISOString(),
      };

      const recordId = currentDraftId || editingLesson?.id;

      if (recordId) {
        const { error } = await supabase
          .from('lesson_records')
          .update(payload)
          .eq('id', recordId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('lesson_records').insert(payload);
        if (error) throw error;
      }

      toast({
        title: '제출 완료',
        description: '수업 기록이 제출되었습니다',
      });

      setIsDialogOpen(false);
      setEditingLesson(null);
      setCurrentDraftId(null);
      resetForm();
      fetchLessons();
    } catch (error: any) {
      console.error('Error submitting lesson:', error);
      toast({
        title: '오류',
        description: error.message || '수업 기록 제출에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    const lastSubject = getLastSelectedSubject(user?.id);
    setFormData({
      student_id: '',
      class_id: '',
      subject: lastSubject,
      lesson_date: format(new Date(), 'yyyy-MM-dd'),
      lesson_range: '',
      understanding_score: '3',
      homework_status: 'none_assigned',
      learning_issues: [],
      next_lesson_goal: '',
      notes: '',
    });
    setCurrentDraftId(null);
  };

  const handleOpenNewForm = async () => {
    setEditingLesson(null);
    resetForm();
    setIsDialogOpen(true);
    // Create draft after dialog opens
    setTimeout(async () => {
      if (students.length > 0) {
        await createInitialDraft();
      }
    }, 100);
  };

  const handleEdit = (lesson: LessonRecord) => {
    setEditingLesson(lesson);
    setCurrentDraftId(lesson.id);
    setFormData({
      student_id: lesson.student_id,
      class_id: lesson.class_id || '',
      subject: lesson.subject,
      lesson_date: lesson.lesson_date,
      lesson_range: lesson.lesson_range,
      understanding_score: lesson.understanding_score.toString(),
      homework_status: lesson.homework_status,
      learning_issues: lesson.learning_issues || [],
      next_lesson_goal: lesson.next_lesson_goal || '',
      notes: lesson.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 수업 기록을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase.from('lesson_records').delete().eq('id', id);
      if (error) throw error;

      toast({
        title: '삭제 완료',
        description: '수업 기록이 삭제되었습니다',
      });
      fetchLessons();
    } catch (error: any) {
      console.error('Error deleting lesson:', error);
      toast({
        title: '오류',
        description: error.message || '수업 기록 삭제에 실패했습니다',
        variant: 'destructive',
      });
    }
  };

  const handleDialogClose = async (open: boolean) => {
    if (!open) {
      // If closing and there's an empty draft, delete it
      if (currentDraftId && !formData.student_id && !formData.subject && !formData.lesson_range) {
        try {
          await supabase.from('lesson_records').delete().eq('id', currentDraftId);
        } catch (error) {
          console.error('Error cleaning up empty draft:', error);
        }
      }
      setEditingLesson(null);
      setCurrentDraftId(null);
      resetForm();
      fetchLessons();
    }
    setIsDialogOpen(open);
  };

  const toggleIssue = (issue: string) => {
    setFormData((prev) => ({
      ...prev,
      learning_issues: prev.learning_issues.includes(issue)
        ? prev.learning_issues.filter((i) => i !== issue)
        : [...prev.learning_issues, issue],
    }));
  };

  const filteredLessons = lessons.filter(
    (lesson) =>
      lesson.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lesson.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getHomeworkLabel = (status: string) => {
    return HOMEWORK_STATUS.find((s) => s.value === status)?.label || status;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">수업 기록</h1>
          <p className="text-muted-foreground mt-1">
            {role === 'admin' ? '전체 수업 기록' : '수업 내용을 기록하고 관리하세요'}
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenNewForm}>
              <Plus className="w-4 h-4 mr-2" />
              수업 기록 작성
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingLesson ? (
                  editingLesson.submitted ? '수업 기록 수정' : '임시저장 수정'
                ) : (
                  '새 수업 기록'
                )}
                {currentDraftId && !editingLesson?.submitted && (
                  <Badge variant="outline" className="ml-2">
                    <FileEdit className="w-3 h-3 mr-1" />
                    임시저장
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="student">학생 *</Label>
                  <Select
                    value={formData.student_id}
                    onValueChange={(value) => setFormData({ ...formData, student_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="학생 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="class">클래스 (선택)</Label>
                  <Select
                    value={formData.class_id}
                    onValueChange={(value) => setFormData({ ...formData, class_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="클래스 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} - {c.subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="subject">과목 * (v2-select)</Label>
                  <Select
                    value={formData.subject}
                    onValueChange={(value) => {
                      const subject = SUBJECT_VALUES.includes(value as SubjectType)
                        ? (value as SubjectType)
                        : '수학';
                      setFormData({ ...formData, subject });
                      setLastSelectedSubject(user?.id, subject);
                    }}
                  >
                    <SelectTrigger className="cursor-pointer bg-secondary/50 border-2 border-input hover:border-primary/50 focus:border-primary transition-colors">
                      <SelectValue placeholder="과목 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map((subject) => (
                        <SelectItem key={subject.value} value={subject.value}>
                          {subject.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">수학/과학/영어/국어 중 선택</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lesson_date">수업 날짜 *</Label>
                  <Input
                    id="lesson_date"
                    type="date"
                    value={formData.lesson_date}
                    onChange={(e) => setFormData({ ...formData, lesson_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lesson_range">수업 범위/내용 *</Label>
                <Input
                  id="lesson_range"
                  value={formData.lesson_range}
                  onChange={(e) => setFormData({ ...formData, lesson_range: e.target.value })}
                  placeholder="예: 5장 이차방정식 (120-135페이지)"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>이해도 (1-5) *</Label>
                  <Select
                    value={formData.understanding_score}
                    onValueChange={(value) => setFormData({ ...formData, understanding_score: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((score) => (
                        <SelectItem key={score} value={score.toString()}>
                          {score} - {score === 1 ? '매우 낮음' : score === 2 ? '낮음' : score === 3 ? '보통' : score === 4 ? '높음' : '매우 높음'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>숙제 상태 *</Label>
                  <Select
                    value={formData.homework_status}
                    onValueChange={(value) => setFormData({ ...formData, homework_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOMEWORK_STATUS.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>학습 이슈 (해당 항목 선택)</Label>
                <div className="grid grid-cols-2 gap-2 p-4 bg-secondary/50 rounded-lg">
                  {LEARNING_ISSUES.map((issue) => (
                    <div key={issue} className="flex items-center space-x-2">
                      <Checkbox
                        id={issue}
                        checked={formData.learning_issues.includes(issue)}
                        onCheckedChange={() => toggleIssue(issue)}
                      />
                      <label htmlFor={issue} className="text-sm cursor-pointer">
                        {issue}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="next_goal">다음 수업 목표</Label>
                <Input
                  id="next_goal"
                  value={formData.next_lesson_goal}
                  onChange={(e) => setFormData({ ...formData, next_lesson_goal: e.target.value })}
                  placeholder="다음 수업에서 집중할 내용"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">추가 메모</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="기타 관찰 사항이나 코멘트"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDialogClose(false)}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || isSubmitting}
                >
                  {isSavingDraft && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Save className="w-4 h-4 mr-2" />
                  임시저장
                </Button>
                <Button type="submit" disabled={isSubmitting || isSavingDraft}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Send className="w-4 h-4 mr-2" />
                  제출
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="학생 또는 과목으로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredLessons.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? '검색 결과가 없습니다' : '수업 기록이 없습니다. 첫 번째 수업을 기록해보세요!'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>학생</TableHead>
                    <TableHead>과목</TableHead>
                    <TableHead>내용</TableHead>
                    <TableHead>점수</TableHead>
                    <TableHead>숙제</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="w-[100px]">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLessons.map((lesson) => (
                    <TableRow key={lesson.id}>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(lesson.lesson_date), 'MM/dd')}
                      </TableCell>
                      <TableCell className="font-medium">{lesson.student_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{lesson.subject}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={lesson.lesson_range}>
                        {lesson.lesson_range}
                      </TableCell>
                      <TableCell>
                        <ScoreBadge score={lesson.understanding_score} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getHomeworkLabel(lesson.homework_status)}
                      </TableCell>
                      <TableCell>
                        {lesson.submitted ? (
                          <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                            제출됨
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                            <FileEdit className="w-3 h-3 mr-1" />
                            임시저장
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(lesson)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(lesson.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
