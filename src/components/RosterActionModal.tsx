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
  ExternalLink
} from 'lucide-react';
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
  const [lessonRecord, setLessonRecord] = useState<LessonRecord | null>(null);
  const [previousHomework, setPreviousHomework] = useState<HomeworkAssignment | null>(null);
  
  // Form states
  const [homeworkCheckResult, setHomeworkCheckResult] = useState('');
  const [homeworkCheckNotes, setHomeworkCheckNotes] = useState('');
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
      setLessonRecord(null);
      setPreviousHomework(null);
      setHomeworkCheckResult('');
      setHomeworkCheckNotes('');
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
    try {
      // 1. Find or create lesson record for this date/student/class
      let recordId = context.existingRecordId;
      
      if (!recordId) {
        // Check if record exists
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
        }
      }
      
      // If no record exists and user is assistant, we might need to create a draft
      // For now, just load what exists
      if (recordId) {
        const { data: record } = await supabase
          .from('lesson_records')
          .select('*')
          .eq('id', recordId)
          .single();
        
        if (record) {
          setLessonRecord(record as LessonRecord);
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
          const { data: homework } = await supabase
            .from('homework_assignments')
            .select('*')
            .eq('lesson_record_id', record.id)
            .maybeSingle();
          
          if (homework) {
            setNewHomeworkContent(homework.content || '');
          }
        }
      }
      
      // 2. Fetch previous homework (most recent before this date)
      const { data: prevHw } = await supabase
        .from('homework_assignments')
        .select('*')
        .eq('student_id', context.student_id)
        .eq('subject', context.subject as SubjectType)
        .lt('assigned_date', context.date)
        .order('assigned_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (prevHw) {
        // Get checker name if checked
        let checkerName = '';
        if (prevHw.checked_by) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', prevHw.checked_by)
            .maybeSingle();
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
    } catch (error) {
      console.error('Error fetching modal data:', error);
      toast({
        title: '데이터 로드 오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Save homework check
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

  // Save new homework content
  async function handleSaveNewHomework() {
    if (!newHomeworkContent.trim() || !user || !context) return;
    
    setIsSavingNewHomework(true);
    try {
      let recordId = lessonRecord?.id;
      
      // If no lesson record exists, we need to create one
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
          // Create a draft record (only teacher/admin can do this normally)
          if (!isAssistant) {
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
          } else {
            toast({
              title: '권한 부족',
              description: '수업 기록이 없어 숙제를 추가할 수 없습니다. 선생님이 먼저 수업 기록을 생성해야 합니다.',
              variant: 'destructive',
            });
            setIsSavingNewHomework(false);
            return;
          }
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
                          <Label>메모 (선택)</Label>
                          <Textarea
                            value={homeworkCheckNotes}
                            onChange={(e) => setHomeworkCheckNotes(e.target.value)}
                            placeholder="추가 메모..."
                            rows={2}
                          />
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
                      수업 기록이 없어 테스트를 입력할 수 없습니다. 선생님이 먼저 수업 기록을 생성해야 합니다.
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
                            value={testFormData.test_time}
                            onValueChange={(value) => setTestFormData(prev => ({ ...prev, test_time: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="시간 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">미정</SelectItem>
                              {TEST_TIME_OPTIONS.map((time) => (
                                <SelectItem key={time} value={time}>{time}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>조교</Label>
                          <Select
                            value={testFormData.test_assistant}
                            onValueChange={(value) => setTestFormData(prev => ({ ...prev, test_assistant: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="조교 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">미정</SelectItem>
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
