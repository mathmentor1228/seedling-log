import { useEffect, useState, useCallback } from 'react';
import { useAuth, isAssistant as checkIsAssistant, isTeacher as checkIsTeacher, isAdmin as checkIsAdmin } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { getTodayKST } from '@/lib/utils';
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
  AlertTriangle,
  Camera,
  Mic,
  X,
  PackageX,
  Frown,
  ArrowRight,
  Plus,
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
  result: 'completed' | 'partial' | 'not_done' | 'lost' | 'low_effort' | 'unable_to_verify' | null;
  notes: string | null;
  checker_name?: string;
  // STUDENT-SUBMISSION-V1: Fields for student submission
  submission_image_url?: string | null;
  submission_text?: string | null;
  submission_audio_url?: string | null;
  submitted_at?: string | null;
}

// STUDENT-SUBMISSION-V1: Interface for homework_submissions table data
interface HomeworkSubmission {
  id: string;
  homework_id: string;
  student_id: string;
  image_url: string | null;
  submission_note: string | null;
  submitted_at: string;
  status: 'pending' | 'reviewed' | 'approved' | 'needs_revision';
  feedback: string | null;
  points_awarded: number | null;
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
  { value: 'lost', label: '분실', icon: PackageX, color: 'text-orange-600' },
  { value: 'low_effort', label: '성의부족', icon: Frown, color: 'text-rose-600' },
  { value: 'low_effort_completed', label: '성의부족+완료', icon: CheckCircle2, color: 'text-amber-600' },
  { value: 'unable_to_verify', label: '확인불가', icon: HelpCircle, color: 'text-muted-foreground' },
];

const TEST_TIME_OPTIONS = Array.from({ length: 25 }, (_, i) => {
  const hour = 9 + Math.floor(i / 2);
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
  // STUDENT-SUBMISSION-V1: Student submission data from homework_submissions table
  const [studentSubmission, setStudentSubmission] = useState<HomeworkSubmission | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  
  // Form states
  const [homeworkCheckResult, setHomeworkCheckResult] = useState('');
  const [homeworkCheckNotes, setHomeworkCheckNotes] = useState('');
  // TEACHER-HW-ALERT-V2: homework_check_note for lesson_records
  const [homeworkCheckNote, setHomeworkCheckNote] = useState('');
  // MULTI-HW-ASSIGN-V1: Multiple homework items
  const [newHomeworkItems, setNewHomeworkItems] = useState<{ content: string }[]>([{ content: '' }]);
  const newHomeworkContent = newHomeworkItems[0]?.content || '';
  const [testFormData, setTestFormData] = useState({
    test_name: '', // Unified: saves to test_name, test_content, test_title
    test_result_text: '',
    test_result: 'none' as 'pass' | 'fail' | 'none',
    test_notes: '',
    test_date: getTodayKST(),
    test_time: '',
    test_assistant: '',
  });
  
  // Saving states
  const [isSavingHomework, setIsSavingHomework] = useState(false);
  const [isSavingTest, setIsSavingTest] = useState(false);
  const [isSavingNewHomework, setIsSavingNewHomework] = useState(false);
  const [isCarryingForward, setIsCarryingForward] = useState(false);

  // Fetch data when modal opens
  useEffect(() => {
    if (open && context) {
      fetchData();
    } else {
      // Reset state when modal closes
      // ASSISTANT-HW-NO-CARRYOVER-V1: Explicitly reset homework_check_note to prevent carryover
      setLessonRecord(null);
      setPreviousHomework(null);
      setStudentSubmission(null); // STUDENT-SUBMISSION-V1: Reset submission
      setShowImageModal(false); // STUDENT-SUBMISSION-V1: Reset modal
      setLoadError(null);
      setHomeworkCheckResult('');
      setHomeworkCheckNotes('');
      setHomeworkCheckNote(''); // ASSISTANT-HW-NO-CARRYOVER-V1: Reset assistant note
      setNewHomeworkItems([{ content: '' }]);
      setTestFormData({
        test_name: '',
        test_result_text: '',
        test_result: 'none',
        test_notes: '',
        test_date: getTodayKST(),
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
          setTestFormData({
            test_name: record.test_name || (record as any).test_content || '',
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
            .eq('lesson_record_id', record.id);
          
          if (hwError) {
            console.error('[fetchData] homework_assignments SELECT failed:', hwError.code, hwError.message);
          }
          
          if (homework && homework.length > 0) {
            setNewHomeworkItems(homework.map(hw => ({ content: hw.content || '' })));
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
          // STUDENT-SUBMISSION-V1: Include inline submission fields from homework_assignments
          submission_image_url: prevHw.submission_image_url,
          submission_text: prevHw.submission_text,
          submission_audio_url: prevHw.submission_audio_url,
          submitted_at: prevHw.submitted_at,
        } as HomeworkAssignment);
        
        // STUDENT-SUBMISSION-V1: Also fetch from homework_submissions table
        const { data: submission, error: subError } = await supabase
          .from('homework_submissions')
          .select('*')
          .eq('homework_id', prevHw.id)
          .eq('student_id', context.student_id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (subError) {
          console.error('[fetchData] homework_submissions SELECT failed:', subError.code, subError.message);
        }
        
        if (submission) {
          setStudentSubmission(submission as HomeworkSubmission);
        }
        
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

  // HOMEWORK-STATUS-PERSIST-V1: Map homework check result to lesson_records.homework_status
  // This maps from homework_assignments.result values to lesson_records.homework_status values
  const mapHomeworkResultToStatus = (result: string): string => {
    switch (result) {
      case 'completed': return 'completed';
      case 'partial': return 'partial';
      case 'not_done': return 'not_done';
      case 'lost': return 'not_done';
      case 'low_effort': return 'not_done';
      case 'low_effort_completed': return 'completed';
      case 'unable_to_verify': return 'none_assigned';
      default: return 'none_assigned';
    }
  };

  // TEACHER-HW-ALERT-V2 + HOMEWORK-STATUS-PERSIST-V1: Save homework check including homework_status to lesson_records
  // POINT-AWARD-V1: Award points when homework is marked as completed
  async function handleSaveHomeworkCheck() {
    if (!previousHomework || !homeworkCheckResult || !user || !context) return;
    
    setIsSavingHomework(true);
    try {
      // HOMEWORK-STATUS-PERSIST-V1: Calculate the homework_status to persist
      const homeworkStatusToSave = mapHomeworkResultToStatus(homeworkCheckResult);
      
      // POINT-AWARD-V1: Check if points were already awarded for this homework
      let pointsAlreadyAwarded = false;
      if (homeworkCheckResult === 'completed') {
        const { data: existingPoints, error: pointsCheckError } = await supabase
          .from('student_point_history')
          .select('id')
          .eq('student_id', context.student_id)
          .eq('related_homework_id', previousHomework.id)
          .maybeSingle();
        
        if (pointsCheckError) {
          console.error('[POINT-AWARD-V1] Error checking existing points:', pointsCheckError);
        }
        
        pointsAlreadyAwarded = !!existingPoints;
      }
      
      // Use RPC for assistants
      if (isAssistant) {
        const { error } = await supabase.rpc('update_homework_check', {
          _homework_id: previousHomework.id,
          _check_status: 'checked',
          _result: homeworkCheckResult,
          _notes: homeworkCheckNotes.trim() || null,
        });
        if (error) throw error;
        
        // HOMEWORK-STATUS-PERSIST-V1: Also save homework_status + homework_check_note to lesson_records
        if (lessonRecord?.id) {
          const updatePayload: Record<string, any> = {
            homework_status: homeworkStatusToSave,
          };
          if (homeworkCheckNote.trim()) {
            updatePayload.homework_check_note = homeworkCheckNote.trim();
          }
          
          // Debug log for admin
          console.log('[HOMEWORK-STATUS-PERSIST-V1] Saving to lesson_records:', {
            recordId: lessonRecord.id,
            sent: updatePayload,
          });
          
          const { data: updatedRecord, error: noteError } = await supabase
            .from('lesson_records')
            .update(updatePayload)
            .eq('id', lessonRecord.id)
            .select('homework_status')
            .maybeSingle();
          
          if (noteError) {
            console.error('[HOMEWORK-STATUS-PERSIST-V1] Error saving:', noteError);
          } else {
            console.log('[HOMEWORK-STATUS-PERSIST-V1] Saved to DB:', {
              recordId: lessonRecord.id,
              saved: updatedRecord?.homework_status,
            });
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
        
        // HOMEWORK-STATUS-PERSIST-V1: Also save homework_status + homework_check_note to lesson_records
        if (lessonRecord?.id) {
          const updatePayload: Record<string, any> = {
            homework_status: homeworkStatusToSave,
          };
          if (homeworkCheckNote.trim()) {
            updatePayload.homework_check_note = homeworkCheckNote.trim();
          }
          
          const { data: updatedRecord, error: noteError } = await supabase
            .from('lesson_records')
            .update(updatePayload)
            .eq('id', lessonRecord.id)
            .select('homework_status')
            .maybeSingle();
          
          if (noteError) {
            console.error('[HOMEWORK-STATUS-PERSIST-V1] Error saving:', noteError);
          }
        }
      }
      
      // POINT-AWARD-V3: Award/deduct points based on homework result
      // Photo submitted + check: +10pts, Submit-only or check-only: +5pts, Not done: -5pts
      let pointsAwarded = false;
      let awardedPoints = 0;
      if (!pointsAlreadyAwarded) {
        if (homeworkCheckResult === 'completed') {
          const hasPhotoSubmission = !!(previousHomework.submission_image_url && previousHomework.submitted_at);
          awardedPoints = hasPhotoSubmission ? 10 : 5;
        } else if (homeworkCheckResult === 'not_done' || homeworkCheckResult === 'lost' || homeworkCheckResult === 'low_effort') {
          awardedPoints = -5;
        }
      }
      
      if (awardedPoints !== 0 && !pointsAlreadyAwarded) {
        let reason = '';
        if (awardedPoints === 10) reason = '숙제 완료 보상 (사진 인증)';
        else if (awardedPoints === 5) reason = '숙제 완료 보상 (현장 확인)';
        else if (awardedPoints === -5) reason = '숙제 미이행 감점';
        
        const { error: pointHistoryError } = await supabase
          .from('student_point_history')
          .insert({
            student_id: context.student_id,
            points: awardedPoints,
            reason,
            related_homework_id: previousHomework.id,
            created_by: user.id,
          });
        
        if (pointHistoryError) {
          console.error('[POINT-AWARD-V3] Error inserting point history:', pointHistoryError);
        } else {
          const { data: student } = await supabase
            .from('students')
            .select('total_points')
            .eq('id', context.student_id)
            .single();
          
          const { error: updatePointsError } = await supabase
            .from('students')
            .update({ total_points: (student?.total_points || 0) + awardedPoints })
            .eq('id', context.student_id);
          
          if (updatePointsError) {
            console.error('[POINT-AWARD-V3] Error updating student points:', updatePointsError);
          } else {
            pointsAwarded = true;
          }
        }
      }
      
      // WRITE-PERSIST-FIX-V1: Refetch to verify and update UI from DB
      const { data: savedRecord } = await supabase
        .from('lesson_records')
        .select('homework_status, homework_check_note')
        .eq('id', lessonRecord!.id)
        .single();
      
      // WRITE-PERSIST-FIX-V1: Debug log for admin
      console.log('[HW_WRITE_DEBUG] After save from DB:', {
        recordId: lessonRecord!.id,
        sent: homeworkStatusToSave,
        saved: savedRecord?.homework_status,
      });
      
      // HOMEWORK-STATUS-PERSIST-V1: Show saved status in toast
      const statusLabel = {
        'completed': '완료',
        'partial': '일부완료',
        'not_done': '미이행',
        'none_assigned': '없음',
      }[savedRecord?.homework_status || homeworkStatusToSave] || (savedRecord?.homework_status || homeworkStatusToSave);
      
      // POINT-AWARD-V3: Include point award/deduction message in toast
      if (pointsAwarded) {
        const pointLabel = awardedPoints > 0 ? `+${awardedPoints}점 지급` : `${awardedPoints}점 감점`;
        toast({
          title: '확인 완료',
          description: `숙제상태 저장됨: ${statusLabel} / 포인트 ${pointLabel}`,
        });
      } else if (pointsAlreadyAwarded) {
        toast({
          title: '확인 완료',
          description: `숙제상태 저장됨: ${statusLabel} (포인트 이미 처리됨)`,
        });
      } else {
        toast({
          title: '확인 완료',
          description: `숙제상태 저장됨: ${statusLabel}`,
        });
      }
      
      // Refresh data from DB (single source of truth)
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

  // CARRY-FORWARD-REASON-V1: Carry forward homework to next session with reason
  async function handleCarryForward() {
    if (!previousHomework || !homeworkCheckResult || !user || !context) return;
    
    setIsCarryingForward(true);
    try {
      const reasonLabel = HOMEWORK_RESULT_OPTIONS.find(o => o.value === homeworkCheckResult)?.label || homeworkCheckResult;
      const carryNote = `[이월사유: ${reasonLabel}] 다음시간 검사예정으로 이월`;
      const contentWithReason = `[${reasonLabel}] ${previousHomework.content}`;
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextDate = format(tomorrow, 'yyyy-MM-dd');
      
      // Create new homework for next session with reason tag
      await supabase.from('homework_assignments').insert({
        student_id: context.student_id,
        subject: context.subject as SubjectType,
        content: contentWithReason,
        assigned_date: nextDate,
        homework_type: 'regular',
        created_by: user.id,
      });
      
      // Mark current as checked with carry-forward note
      if (isAssistant) {
        await supabase.rpc('update_homework_check', {
          _homework_id: previousHomework.id,
          _check_status: 'checked',
          _result: homeworkCheckResult,
          _notes: carryNote,
        });
      } else {
        await supabase.from('homework_assignments').update({
          check_status: 'checked',
          result: homeworkCheckResult,
          notes: carryNote,
          checked_by: user.id,
          checked_at: new Date().toISOString(),
        }).eq('id', previousHomework.id);
      }
      
      toast({
        title: '다음시간으로 이월됨',
        description: `사유: ${reasonLabel} / ${previousHomework.content}`,
      });
      
      await fetchData();
      onSaved?.();
    } catch (err: any) {
      toast({ title: '이월 실패', description: err.message, variant: 'destructive' });
    } finally {
      setIsCarryingForward(false);
    }
  }

  // Save test fields - WRITE-PERSIST-FIX-V1: Include test_content and add debug
  async function handleSaveTestFields() {
    if (!lessonRecord?.id || !user || !context) return;
    
    if (testFormData.test_result_text.trim() && !testFormData.test_name.trim()) {
      toast({
        title: '입력 필요',
        description: '테스트 제목(단원/범위)을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSavingTest(true);
    try {
      const unifiedTitle = testFormData.test_name || null;
      console.log('[TEST_WRITE_DEBUG] Saving test fields:', {
        recordId: lessonRecord.id,
        sent: { test_name: unifiedTitle, test_result_text: testFormData.test_result_text || null },
      });

      const { error } = await supabase.rpc('update_lesson_test_fields', {
        _lesson_id: lessonRecord.id,
        _test_name: unifiedTitle,
        _test_content: unifiedTitle, // Unified: same value
        _test_result_text: testFormData.test_result_text || null,
        _test_result: context.subject === '영어' ? testFormData.test_result : 'none',
        _test_notes: testFormData.test_notes || null,
        _test_date: testFormData.test_date || null,
        _test_time: testFormData.test_time || null,
        _test_assistant: testFormData.test_assistant || null,
      });
      
      if (error) throw error;
      
      // WRITE-PERSIST-FIX-V1: Refetch to verify and update UI from DB
      const { data: savedRecord } = await supabase
        .from('lesson_records')
        .select('test_content, test_name, test_result_text')
        .eq('id', lessonRecord.id)
        .single();
      
      // WRITE-PERSIST-FIX-V1: Debug log after save
      console.log('[TEST_WRITE_DEBUG] After save from DB:', {
        recordId: lessonRecord.id,
        saved: savedRecord,
      });
      
      toast({
        title: '저장 완료',
        description: `테스트 제목=${savedRecord?.test_name || savedRecord?.test_content || '-'}`,
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

  // MULTI-HW-ASSIGN-V1: Save multiple homework items
  async function handleSaveNewHomework() {
    const validItems = newHomeworkItems.filter(i => i.content.trim());
    if (validItems.length === 0 || !user || !context) return;
    
    setIsSavingNewHomework(true);
    try {
      let recordId = lessonRecord?.id;
      
      if (!recordId) {
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
      
      // Delete existing then insert all
      await supabase.from('homework_assignments').delete().eq('lesson_record_id', recordId);
      for (const item of validItems) {
        await supabase.from('homework_assignments').insert({
          student_id: context.student_id,
          subject: context.subject as SubjectType,
          lesson_record_id: recordId,
          assigned_date: context.date,
          content: item.content.trim(),
        });
      }
      
      toast({
        title: '저장 완료',
        description: `숙제 ${validItems.length}개가 저장되었습니다`,
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
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            숙제·시험 관리
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

        {/* Visible marker for debugging - WRITE-PERSIST-FIX-V1 */}
        <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded">
          TEST_SCREEN_MARKER_V3
          {/* WRITE-PERSIST-FIX-V1: Admin debug for homework_status and test_content */}
          {isAdmin && lessonRecord && (
            <span className="ml-2 font-mono">
              | HW_DEBUG: id={lessonRecord.id?.slice(0, 8)} hw_status={lessonRecord.homework_status || 'null'}
              | TEST_DEBUG: content={(lessonRecord as any).test_content?.slice(0, 15) || 'null'}
            </span>
          )}
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
                    {/* CARRY-FORWARD-REASON-V1: Show reason badge + content */}
                    <div className="p-3 bg-secondary/50 rounded-lg text-sm flex items-start gap-3">
                      <div className="flex-1">
                        {(() => {
                          const reasonMatch = previousHomework.content.match(/^\[(분실|미완|부분|성의부족|확인불가)\]\s*/);
                          if (reasonMatch) {
                            const reason = reasonMatch[1];
                            const cleanContent = previousHomework.content.replace(reasonMatch[0], '');
                            const reasonColors: Record<string, string> = { '분실': 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', '미완': 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', '부분': 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', '성의부족': 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300', '확인불가': 'bg-muted text-muted-foreground' };
                            return (
                              <div className="space-y-1">
                                <Badge variant="outline" className={`text-[10px] ${reasonColors[reason] || 'bg-muted'}`}>⚠️ 이월사유: {reason}</Badge>
                                <p>{cleanContent}</p>
                              </div>
                            );
                          }
                          return <span>{previousHomework.content}</span>;
                        })()}
                      </div>
                      {/* Show mic icon if student submitted audio */}
                      {previousHomework.submission_audio_url && (
                        <button
                          type="button"
                          onClick={() => setShowImageModal(true)}
                          className="flex-shrink-0 relative group cursor-pointer"
                          title="학생 음성 제출 듣기"
                        >
                          <div className="w-12 h-12 rounded-lg border-2 border-purple-400/50 overflow-hidden bg-purple-50 dark:bg-purple-950/30 hover:border-purple-500 transition-colors flex items-center justify-center">
                            <Mic className="w-5 h-5 text-purple-500" />
                          </div>
                        </button>
                      )}
                      {/* Show camera icon if student submitted image */}
                      {(studentSubmission?.image_url || previousHomework.submission_image_url) && (() => {
                        const rawUrl = studentSubmission?.image_url || previousHomework.submission_image_url || '';
                        const imageUrls = rawUrl.split(',').map(u => u.trim()).filter(Boolean);
                        const firstUrl = imageUrls[0] || '';
                        return (
                        <button
                          type="button"
                          onClick={() => setShowImageModal(true)}
                          className="flex-shrink-0 relative group cursor-pointer"
                          title="학생 제출 사진 보기"
                        >
                          <div className="w-16 h-16 rounded-lg border-2 border-primary/30 overflow-hidden bg-muted hover:border-primary transition-colors">
                            <img 
                              src={firstUrl} 
                              alt="제출 이미지" 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                          {imageUrls.length > 1 && (
                            <div className="absolute -bottom-1 -left-1 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                              {imageUrls.length}
                            </div>
                          )}
                          <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center">
                            <Camera className="w-3 h-3" />
                          </div>
                        </button>
                        );
                      })()}
                    </div>
                    
                    {/* STUDENT-SUBMISSION-V1: Show submission note if exists */}
                    {(studentSubmission?.submission_note || previousHomework.submission_text) && (
                      <div className="p-2 bg-primary/5 rounded-lg text-sm border border-primary/20">
                        <p className="text-xs text-muted-foreground mb-1">📝 학생 메모:</p>
                        <p>{studentSubmission?.submission_note || previousHomework.submission_text}</p>
                      </div>
                    )}
                    
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
                        
                        <div className="flex gap-2">
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
                          {/* CARRY-FORWARD-REASON-V1: Show carry-forward button for non-completion results */}
                          {homeworkCheckResult && homeworkCheckResult !== 'completed' && (
                            <Button
                              variant="outline"
                              onClick={handleCarryForward}
                              disabled={isCarryingForward}
                              className="gap-1"
                            >
                              {isCarryingForward ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                              다음시간 검사예정
                            </Button>
                          )}
                        </div>
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
                          <Label className="flex items-center gap-1">
                            테스트 제목 <span className="text-destructive text-xs">(단원/범위 필수) *</span>
                          </Label>
                          <Input
                            value={testFormData.test_name}
                            onChange={(e) => setTestFormData(prev => ({ ...prev, test_name: e.target.value }))}
                            placeholder="예: 중2 1단원 단원평가 / 영단어 Day5 재시험"
                            className={!testFormData.test_name.trim() && testFormData.test_result_text ? 'border-destructive' : ''}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>결과/점수</Label>
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
                              <SelectItem value="은서조교">은서조교</SelectItem>
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
              
              {/* MULTI-HW-ASSIGN-V1: Multiple homework */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">오늘 숙제 ({newHomeworkItems.filter(i => i.content.trim()).length}개)</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setNewHomeworkItems(prev => [...prev, { content: '' }])}
                      className="text-xs gap-1 h-7"
                    >
                      <Plus className="w-3 h-3" />
                      숙제 추가
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {newHomeworkItems.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      {newHomeworkItems.length > 1 && (
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">숙제 {idx + 1}</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setNewHomeworkItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-xs text-muted-foreground hover:text-destructive h-6 px-2 gap-1"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      <Textarea
                        value={item.content}
                        onChange={(e) => setNewHomeworkItems(prev => prev.map((it, i) => i === idx ? { ...it, content: e.target.value } : it))}
                        placeholder={idx === 0 ? "오늘 숙제를 입력하세요..." : "추가 숙제 내용..."}
                        rows={2}
                      />
                    </div>
                  ))}
                  
                  <Button 
                    onClick={handleSaveNewHomework}
                    disabled={!newHomeworkItems.some(i => i.content.trim()) || isSavingNewHomework}
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

    {/* STUDENT-SUBMISSION-V1: Image/Audio Preview Modal */}
    <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-4">
        <DialogHeader>
          <DialogTitle className="text-base">📎 학생 제출물</DialogTitle>
        </DialogHeader>
        {(() => {
          const rawUrl = studentSubmission?.image_url || previousHomework?.submission_image_url || '';
          const imageUrls = rawUrl.split(',').map(u => u.trim()).filter(Boolean);
          const audioUrl = previousHomework?.submission_audio_url;
          return (
            <div className="space-y-3">
              {/* Audio player */}
              {audioUrl && (
                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-2 flex items-center gap-1">
                    🎤 음성 제출
                  </p>
                  <audio controls className="w-full" src={audioUrl}>
                    브라우저에서 오디오를 지원하지 않습니다.
                  </audio>
                </div>
              )}
              {imageUrls.length === 0 && !audioUrl && (
                <p className="text-muted-foreground text-sm text-center py-4">제출물을 불러올 수 없습니다.</p>
              )}
              {imageUrls.length > 0 && imageUrls.length <= 3 ? (
                <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto">
                  {imageUrls.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                      <img 
                        src={url} 
                        alt={`제출 이미지 ${idx + 1}`} 
                        className="w-full max-h-[50vh] object-contain rounded-lg border"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = 'none';
                          const fallback = document.createElement('div');
                          fallback.className = 'w-full h-32 flex items-center justify-center bg-muted rounded-lg border text-sm text-muted-foreground';
                          fallback.textContent = '이미지 로드 실패';
                          target.parentElement?.appendChild(fallback);
                        }}
                      />
                    </a>
                  ))}
                </div>
              ) : imageUrls.length > 3 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
                  {imageUrls.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border hover:ring-2 ring-primary transition-all">
                      <img 
                        src={url} 
                        alt={`제출 이미지 ${idx + 1}`} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = 'none';
                          const fallback = document.createElement('div');
                          fallback.className = 'w-full h-full flex items-center justify-center bg-muted text-sm text-muted-foreground';
                          fallback.textContent = '로드 실패';
                          target.parentElement?.appendChild(fallback);
                        }}
                      />
                    </a>
                  ))}
                </div>
              ) : null}
              {(studentSubmission || previousHomework?.submitted_at) && (
                <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                  <p className="font-medium">
                    📷 제출 시간: {studentSubmission?.submitted_at || previousHomework?.submitted_at 
                      ? format(new Date(studentSubmission?.submitted_at || previousHomework?.submitted_at || ''), 'M월 d일 HH:mm', { locale: ko })
                      : '-'}
                  </p>
                  {(studentSubmission?.submission_note || previousHomework?.submission_text) && (
                    <p className="text-muted-foreground">
                      📝 메모: {studentSubmission?.submission_note || previousHomework?.submission_text}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}
