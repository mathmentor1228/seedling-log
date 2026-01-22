import { useEffect, useState, useCallback } from 'react';
import { useAuth, isAssistant as checkIsAssistant, isTeacher as checkIsTeacher, isAdmin as checkIsAdmin } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle2, 
  Clock, 
  XCircle, 
  HelpCircle, 
  AlertCircle, 
  Save, 
  Loader2,
  GraduationCap,
  Calendar,
  User,
  BookOpen,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

type SubjectType = '수학' | '과학' | '영어' | '국어';

interface RosterActionContext {
  date: string;
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  subject: string;
  teacher_id: string;
  teacher_name: string;
  start_time: string;
  existingRecordId: string | null;
}

interface RosterActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: RosterActionContext | null;
  mode: 'HOMEWORK_TEST' | 'LESSON_RECORD';
  onSaved?: () => void;
}

interface HomeworkAssignment {
  id: string;
  content: string;
  assigned_date: string;
  check_status: 'unchecked' | 'checked';
  result: 'completed' | 'partial' | 'not_done' | 'unable_to_verify' | null;
  notes: string | null;
  checker_name?: string;
}

interface LessonRecord {
  id: string;
  lesson_range: string;
  understanding_score: number;
  homework_status: string;
  learning_issues: string[];
  learning_issues_note: string | null;
  next_lesson_goal: string | null;
  notes: string | null;
  submitted: boolean;
  lesson_types: string[];
  attendance_status: string[];
  test_name: string | null;
  test_result_text: string | null;
  test_result: 'pass' | 'fail' | 'none';
  test_notes: string | null;
  test_date: string | null;
  test_time: string | null;
  test_assistant: string | null;
}

const HOMEWORK_RESULT_OPTIONS = [
  { value: 'completed', label: '완료', icon: CheckCircle2, color: 'text-green-600' },
  { value: 'partial', label: '부분', icon: Clock, color: 'text-amber-600' },
  { value: 'not_done', label: '미완', icon: XCircle, color: 'text-red-600' },
  { value: 'unable_to_verify', label: '확인불가', icon: HelpCircle, color: 'text-muted-foreground' },
];

const TEST_TIME_OPTIONS = Array.from({ length: 11 }, (_, i) => {
  const hour = 16 + Math.floor(i / 2);
  const minute = (i % 2) * 30;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
});

export function RosterActionModal({ 
  open, 
  onOpenChange, 
  context, 
  mode, 
  onSaved 
}: RosterActionModalProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  
  const isAssistant = checkIsAssistant(role);
  const isTeacher = checkIsTeacher(role);
  const isAdmin = checkIsAdmin(role);
  
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null); // Error state for resilient UI
  const [lessonRecord, setLessonRecord] = useState<LessonRecord | null>(null);
  const [previousHomework, setPreviousHomework] = useState<HomeworkAssignment | null>(null);
  
  // Form states
  const [homeworkCheckResult, setHomeworkCheckResult] = useState('');
  const [homeworkCheckNotes, setHomeworkCheckNotes] = useState('');
  // TEACHER-HW-ALERT-V2: homework_check_note for lesson_records
  const [homeworkCheckNote, setHomeworkCheckNote] = useState('');
  const [newHomeworkContent, setNewHomeworkContent] = useState('');
  const [testFormData, setTestFormData] = useState({
    test_name: '',
    test_result_text: '',
    test_result: 'none' as 'pass' | 'fail' | 'none',
    test_notes: '',
    test_date: '',
    test_time: '',
    test_assistant: '',
  });
  
  // Saving states
  const [isSavingHomework, setIsSavingHomework] = useState(false);
  const [isSavingTest, setIsSavingTest] = useState(false);
  const [isSavingNewHomework, setIsSavingNewHomework] = useState(false);

  // Fetch data when modal opens
  useEffect(() => {
    if (open && context) {
      fetchData();
    } else {
      // Reset state when modal closes
      // ASSISTANT-HW-NO-CARRYOVER-V1: Explicitly reset homework_check_note to prevent carryover
      setLessonRecord(null);
      setPreviousHomework(null);
      setLoadError(null);
      setHomeworkCheckResult('');
      setHomeworkCheckNotes('');
      setHomeworkCheckNote(''); // ASSISTANT-HW-NO-CARRYOVER-V1: Reset assistant note
      setNewHomeworkContent('');
      setTestFormData({
        test_name: '',
        test_result_text: '',
        test_result: 'none',
        test_notes: '',
        test_date: '',
        test_time: '',
        test_assistant: '',
      });
    }
  }, [open, context]);

  async function fetchData() {
    if (!context || !user) return;
    
    setLoading(true);
    setLoadError(null);
    try {
      // 1. Find or create lesson record for this date/student/class
      let recordId = context.existingRecordId;
      
      if (!recordId) {
        // Check if record exists
        const { data: existing, error: existingError } = await supabase
          .from('lesson_records')
          .select('id')
          .eq('student_id', context.student_id)
          .eq('class_id', context.class_id)
          .eq('lesson_date', context.date)
          .eq('subject', context.subject as SubjectType)
          .maybeSingle();
        
        if (existingError) {
          console.error('[fetchData] lesson_records SELECT failed:', existingError.code, existingError.message);
          throw existingError;
        }
        
        if (existing) {
          recordId = existing.id;
        }
      }
      
      // If no record exists, create a draft (assistants can now insert for today)
      if (!recordId) {
        // ASSISTANT-HW-NO-CARRYOVER-V1: Explicitly reset note for new records
        setHomeworkCheckNote('');
        
        const { data: newRecord, error: createError } = await supabase
          .from('lesson_records')
          .insert({
            teacher_id: context.teacher_id,
            student_id: context.student_id,
            class_id: context.class_id,
            subject: context.subject as SubjectType,
            lesson_date: context.date,
            lesson_range: '',
            understanding_score: 3,
            homework_status: 'none_assigned',
            learning_issues: [],
            submitted: false,
            // ASSISTANT-HW-NO-CARRYOVER-V1: homework_check_note is NOT included - starts empty
          })
          .select()
          .single();
        
        if (createError) {
          console.error('[fetchData] lesson_records INSERT failed:', createError.code, createError.message);
          // Continue without record - test fields will be disabled
        } else if (newRecord) {
          recordId = newRecord.id;
        }
      }
      
      if (recordId) {
        const { data: record, error: recordError } = await supabase
          .from('lesson_records')
          .select('*')
          .eq('id', recordId)
          .single();
        
        if (recordError) {
          console.error('[fetchData] lesson_records SELECT by id failed:', recordError.code, recordError.message);
          throw recordError;
        }
        
        if (record) {
          setLessonRecord(record as LessonRecord);
          // ASSISTANT-HW-NO-CARRYOVER-V1: Load homework_check_note for CURRENT record only (lesson-scoped)
          // This is intentionally loaded from the current record, not carried over from previous lessons
          setHomeworkCheckNote(record.homework_check_note || '');
          // Pre-fill test fields
          setTestFormData({
            test_name: record.test_name || '',
            test_result_text: record.test_result_text || '',
            test_result: (record.test_result as 'pass' | 'fail' | 'none') || 'none',
            test_notes: record.test_notes || '',
            test_date: record.test_date || '',
            test_time: record.test_time || '',
            test_assistant: record.test_assistant || '',
          });
          
          // Fetch homework for this record
          const { data: homework, error: hwError } = await supabase
            .from('homework_assignments')
            .select('*')
            .eq('lesson_record_id', record.id)
            .maybeSingle();
          
          if (hwError) {
            console.error('[fetchData] homework_assignments SELECT failed:', hwError.code, hwError.message);
          }
          
          if (homework) {
            setNewHomeworkContent(homework.content || '');
          }
        }
      }
      
      // 2. Fetch previous homework (most recent before this date)
      const { data: prevHw, error: prevHwError } = await supabase
        .from('homework_assignments')
        .select('*')
        .eq('student_id', context.student_id)
        .eq('subject', context.subject as SubjectType)
        .lt('assigned_date', context.date)
        .order('assigned_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (prevHwError) {
        console.error('[fetchData] prev homework SELECT failed:', prevHwError.code, prevHwError.message);
      }
      
      if (prevHw) {
        // Get checker name if checked
        let checkerName = '';
        if (prevHw.checked_by) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', prevHw.checked_by)
            .maybeSingle();
          if (profileError) {
            console.error('[fetchData] profiles SELECT failed:', profileError.code, profileError.message);
          }
          checkerName = profile?.full_name || profile?.email || '';
        }
        
        setPreviousHomework({
          ...prevHw,
          checker_name: checkerName,
        } as HomeworkAssignment);
        
        // Pre-fill check fields
        if (prevHw.check_status === 'checked') {
          setHomeworkCheckResult(prevHw.result || '');
          setHomeworkCheckNotes(prevHw.notes || '');
        }
      }
    } catch (error: any) {
      console.error('[fetchData] FATAL ERROR:', error);
      const statusCode = error?.code || error?.status || 'UNKNOWN';
      const message = error?.message || '알 수 없는 오류';
      setLoadError(`TEST_SCREEN_ERROR: ${statusCode} ${message}`);
      // Don't throw - let the UI render with error state
    } finally {
      setLoading(false);
    }
  }

  // TEACHER-HW-ALERT-V2: Save homework check including homework_check_note to lesson_records
  async function handleSaveHomeworkCheck() {
    if (!previousHomework || !homeworkCheckResult || !user) return;
    
    setIsSavingHomework(true);
    try {
      // Use RPC for assistants
      if (isAssistant) {
        const { error } = await supabase.rpc('update_homework_check', {
          _homework_id: previousHomework.id,
          _check_status: 'checked',
          _result: homeworkCheckResult,
          _notes: homeworkCheckNotes.trim() || null,
        });
        if (error) throw error;
        
        // Also save homework_check_note to lesson_records if there's a note
        if (lessonRecord?.id && homeworkCheckNote.trim()) {
          const { error: noteError } = await supabase
            .from('lesson_records')
            .update({ homework_check_note: homeworkCheckNote.trim() })
            .eq('id', lessonRecord.id);
          if (noteError) {
            console.error('Error saving homework_check_note:', noteError);
          }
        }
      } else {
        const { error } = await supabase
          .from('homework_assignments')
          .update({
            check_status: 'checked',
            result: homeworkCheckResult,
            notes: homeworkCheckNotes.trim() || null,
            checked_by: user.id,
            checked_at: new Date().toISOString(),
          })
          .eq('id', previousHomework.id);
        if (error) throw error;
        
        // Also save homework_check_note to lesson_records if there's a note
        if (lessonRecord?.id && homeworkCheckNote.trim()) {
          const { error: noteError } = await supabase
            .from('lesson_records')
            .update({ homework_check_note: homeworkCheckNote.trim() })
            .eq('id', lessonRecord.id);
          if (noteError) {
            console.error('Error saving homework_check_note:', noteError);
          }
        }
      }
      
      toast({
        title: '확인 완료',
        description: '숙제 확인이 저장되었습니다',
      });
      
      // Refresh data
      await fetchData();
      onSaved?.();
    } catch (error: any) {
      console.error('Error saving homework check:', error);
      toast({
        title: '오류',
        description: error.message || '숙제 확인 저장에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setIsSavingHomework(false);
    }
  }

  // Save test fields
  async function handleSaveTestFields() {
    if (!lessonRecord?.id || !user || !context) return;
    
    setIsSavingTest(true);
    try {
      const { error } = await supabase.rpc('update_lesson_test_fields', {
        _lesson_id: lessonRecord.id,
        _test_name: testFormData.test_name || null,
        _test_result_text: testFormData.test_result_text || null,
        _test_result: context.subject === '영어' ? testFormData.test_result : 'none',
        _test_notes: testFormData.test_notes || null,
        _test_date: testFormData.test_date || null,
        _test_time: testFormData.test_time || null,
        _test_assistant: testFormData.test_assistant || null,
      });
      
      if (error) throw error;
      
      toast({
        title: '저장 완료',
        description: '테스트 결과가 저장되었습니다',
      });
      
      await fetchData();
      onSaved?.();
    } catch (error: any) {
      console.error('Error saving test fields:', error);
      toast({
        title: '오류',
        description: error.message || '테스트 결과 저장에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setIsSavingTest(false);
    }
  }

  // Save new homework content (assistants can now insert/update)
  async function handleSaveNewHomework() {
    if (!newHomeworkContent.trim() || !user || !context) return;
    
    setIsSavingNewHomework(true);
    try {
      let recordId = lessonRecord?.id;
      
      // If no lesson record exists, create one (assistants can now insert for today)
      if (!recordId) {
        // Check again in case created by another process
        const { data: existing } = await supabase
          .from('lesson_records')
          .select('id')
          .eq('student_id', context.student_id)
          .eq('class_id', context.class_id)
          .eq('lesson_date', context.date)
          .eq('subject', context.subject as SubjectType)
          .maybeSingle();
        
        if (existing) {
          recordId = existing.id;
        } else {
          // Create a draft record (all roles can insert now)
          const { data: newRecord, error: createError } = await supabase
            .from('lesson_records')
            .insert({
              teacher_id: context.teacher_id,
              student_id: context.student_id,
              class_id: context.class_id,
              subject: context.subject as SubjectType,
              lesson_date: context.date,
              lesson_range: '',
              understanding_score: 3,
              homework_status: 'none_assigned',
              learning_issues: [],
              submitted: false,
            })
            .select()
            .single();
          
          if (createError) throw createError;
          recordId = newRecord.id;
          setLessonRecord(newRecord as LessonRecord);
        }
      }
      
      // Check if homework already exists for this record
      const { data: existingHw } = await supabase
        .from('homework_assignments')
        .select('id')
        .eq('lesson_record_id', recordId)
        .maybeSingle();
      
      if (existingHw) {
        await supabase
          .from('homework_assignments')
          .update({ content: newHomeworkContent.trim() })
          .eq('id', existingHw.id);
      } else {
        await supabase
          .from('homework_assignments')
          .insert({
            student_id: context.student_id,
            subject: context.subject as SubjectType,
            lesson_record_id: recordId,
            assigned_date: context.date,
            content: newHomeworkContent.trim(),
          });
      }
      
      toast({
        title: '저장 완료',
        description: '오늘 숙제가 저장되었습니다',
      });
      
      onSaved?.();
    } catch (error: any) {
      console.error('Error saving new homework:', error);
      toast({
        title: '오류',
        description: error.message || '숙제 저장에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setIsSavingNewHomework(false);
    }
  }

  if (!context) return null;

  const dateFormatted = format(new Date(context.date), 'M월 d일 (EEE)', { locale: ko });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            숙제/테스트 관리
          </DialogTitle>
        </DialogHeader>
        
        {/* Header Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{context.student_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <Badge variant="outline">{context.subject}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span>{context.class_name} ({context.start_time?.slice(0, 5)})</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span>{dateFormatted}</span>
          </div>
        </div>

        {/* Visible marker for debugging */}
        <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded">
          TEST_SCREEN_MARKER_V3
        </div>

        {/* Error banner - show inline error instead of crashing */}
        {loadError && (
          <Alert variant="destructive" className="mt-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <Tabs defaultValue="homework" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="homework">지난 숙제 확인</TabsTrigger>
              <TabsTrigger value="test">테스트 / 오늘 숙제</TabsTrigger>
            </TabsList>
            
            {/* Previous Homework Check Tab */}
            <TabsContent value="homework" className="space-y-4 mt-4">
              {previousHomework ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>지난 숙제 ({previousHomework.assigned_date})</span>
                      {previousHomework.check_status === 'checked' && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          확인됨
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-3 bg-secondary/50 rounded-lg text-sm">
                      {previousHomework.content}
                    </div>
                    
                    {previousHomework.check_status === 'checked' ? (
                      <div className="text-sm text-muted-foreground">
                        <p>확인자: {previousHomework.checker_name || '알 수 없음'}</p>
                        <p>결과: {HOMEWORK_RESULT_OPTIONS.find(o => o.value === previousHomework.result)?.label || '-'}</p>
                        {previousHomework.notes && <p>메모: {previousHomework.notes}</p>}
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label>확인 결과</Label>
                          <div className="flex gap-2 flex-wrap">
                            {HOMEWORK_RESULT_OPTIONS.map((option) => {
                              const Icon = option.icon;
                              return (
                                <Button
                                  key={option.value}
                                  type="button"
                                  variant={homeworkCheckResult === option.value ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => setHomeworkCheckResult(option.value)}
                                  className={homeworkCheckResult === option.value ? '' : option.color}
                                >
                                  <Icon className="w-4 h-4 mr-1" />
                                  {option.label}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label>확인 메모 (선택)</Label>
                          <Textarea
                            value={homeworkCheckNotes}
                            onChange={(e) => setHomeworkCheckNotes(e.target.value)}
                            placeholder="확인 메모 (학생에게 알림용)..."
                            rows={2}
                          />
                        </div>
                        
                        {/* TEACHER-HW-ALERT-V2: homework_check_note for teacher alert */}
                        <div className="space-y-2 p-3 border border-amber-500/30 bg-amber-500/5 rounded-lg">
                          <Label className="text-amber-700">🔔 선생님 별도 확인 요청 메모</Label>
                          <Textarea
                            value={homeworkCheckNote}
                            onChange={(e) => setHomeworkCheckNote(e.target.value)}
                            placeholder="선생님께서 별도로 확인해야 할 사항이 있으면 적어주세요 (대시보드에 알림 표시됨)"
                            rows={2}
                          />
                          <span className="text-xs text-muted-foreground">
                            TEACHER-HW-ALERT-V2
                          </span>
                        </div>
                        
                        <Button
                          onClick={handleSaveHomeworkCheck}
                          disabled={!homeworkCheckResult || isSavingHomework}
                        >
                          {isSavingHomework ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4 mr-2" />
                          )}
                          확인 저장
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-8">
                    <p className="text-center text-muted-foreground">
                      확인할 이전 숙제가 없습니다
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            
            {/* Test / New Homework Tab */}
            <TabsContent value="test" className="space-y-4 mt-4">
              {/* Test Fields */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">테스트 결과</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!lessonRecord ? (
                    <p className="text-sm text-muted-foreground">
                      수업 기록을 로드 중이거나 생성할 수 없습니다. 오늘 날짜의 수업만 새로 생성할 수 있습니다.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>테스트명</Label>
                          <Input
                            value={testFormData.test_name}
                            onChange={(e) => setTestFormData(prev => ({ ...prev, test_name: e.target.value }))}
                            placeholder="예: 단어 테스트"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>결과</Label>
                          <Input
                            value={testFormData.test_result_text}
                            onChange={(e) => setTestFormData(prev => ({ ...prev, test_result_text: e.target.value }))}
                            placeholder="예: 85/100"
                          />
                        </div>
                      </div>
                      
                      {context.subject === '영어' && (
                        <div className="space-y-2">
                          <Label>통과 여부</Label>
                          <div className="flex gap-2">
                            {(['pass', 'fail', 'none'] as const).map((value) => (
                              <Button
                                key={value}
                                type="button"
                                variant={testFormData.test_result === value ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setTestFormData(prev => ({ ...prev, test_result: value }))}
                              >
                                {value === 'pass' ? '통과' : value === 'fail' ? '불통과' : '해당없음'}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>테스트 날짜</Label>
                          <Input
                            type="date"
                            value={testFormData.test_date}
                            onChange={(e) => setTestFormData(prev => ({ ...prev, test_date: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>테스트 시간</Label>
                          <Select
                            value={testFormData.test_time || '__none__'}
                            onValueChange={(value) => setTestFormData(prev => ({ ...prev, test_time: value === '__none__' ? '' : value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="시간 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">미정</SelectItem>
                              {TEST_TIME_OPTIONS.map((time) => (
                                <SelectItem key={time} value={time}>{time}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>조교</Label>
                          <Select
                            value={testFormData.test_assistant || '__none__'}
                            onValueChange={(value) => setTestFormData(prev => ({ ...prev, test_assistant: value === '__none__' ? '' : value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="조교 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">미정</SelectItem>
                              <SelectItem value="다인조교">다인조교</SelectItem>
                              <SelectItem value="유빈조교">유빈조교</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>테스트 메모</Label>
                        <Textarea
                          value={testFormData.test_notes}
                          onChange={(e) => setTestFormData(prev => ({ ...prev, test_notes: e.target.value }))}
                          placeholder="테스트 관련 메모..."
                          rows={2}
                        />
                      </div>
                      
                      <Button 
                        onClick={handleSaveTestFields}
                        disabled={isSavingTest}
                      >
                        {isSavingTest ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        테스트 저장
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
              
              {/* New Homework */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">오늘 숙제</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>숙제 내용</Label>
                    <Textarea
                      value={newHomeworkContent}
                      onChange={(e) => setNewHomeworkContent(e.target.value)}
                      placeholder="오늘 숙제를 입력하세요..."
                      rows={3}
                    />
                  </div>
                  
                  <Button 
                    onClick={handleSaveNewHomework}
                    disabled={!newHomeworkContent.trim() || isSavingNewHomework}
                  >
                    {isSavingNewHomework ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    숙제 저장
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Footer with link to full page */}
        <div className="flex justify-end pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.open(
                `/lessons?student_id=${context.student_id}&class_id=${context.class_id}&subject=${encodeURIComponent(context.subject)}&lesson_date=${context.date}`,
                '_blank'
              );
            }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            전체 페이지로 열기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
