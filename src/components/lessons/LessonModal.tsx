import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LessonRecordForm, LessonFormContext } from './LessonRecordForm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin as checkIsAdmin, isTeacher as checkIsTeacher } from '@/lib/auth';

interface LessonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: LessonFormContext | null;
  existingRecordId?: string | null;
  onSaved?: () => void;
  initialMode?: 'view' | 'edit';
  /** PREFILL-FIX-V5: Force new record mode - skip DB lookup for existing drafts */
  forceNewRecord?: boolean;
}

interface StudentItem {
  id: string;
  name: string;
}

interface ClassItem {
  id: string;
  name: string;
  subject: string;
}

/**
 * LessonModal - Shared modal wrapper for LessonRecordForm
 * Used by both Dashboard and Lessons pages to ensure consistent behavior
 * LESSON-SHARED-FORM-V3
 */
export function LessonModal({
  open,
  onOpenChange,
  context,
  existingRecordId,
  onSaved,
  initialMode = 'edit',
  forceNewRecord = false,
}: LessonModalProps) {
  const { user, role } = useAuth();
  const isAdmin = checkIsAdmin(role);
  const isTeacher = checkIsTeacher(role);
  
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  const [originalTeacherId, setOriginalTeacherId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchData();
      // Reset mode when opening
      setMode(initialMode);
    }
  }, [open, initialMode]);

  async function fetchData() {
    setLoading(true);
    setFetchError(null);
    try {
      const [studentsRes, classesRes, profilesRes] = await Promise.all([
        supabase.from('students').select('id, name').order('name'),
        supabase.from('classes').select('id, name, subject, teacher_id').order('name'),
        supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      ]);

      if (studentsRes.error) {
        console.error('[LESSON_MODAL_FETCH_ERROR] students:', studentsRes.error);
        setFetchError(`학생 목록 로드 실패: ${studentsRes.error.message}`);
      }
      if (classesRes.error) {
        console.error('[LESSON_MODAL_FETCH_ERROR] classes:', classesRes.error);
        setFetchError((prev) => (prev ? `${prev}, 클래스 목록 로드 실패: ${classesRes.error.message}` : `클래스 목록 로드 실패: ${classesRes.error.message}`));
      }

      setStudents(studentsRes.data || []);
      setClasses(classesRes.data || []);
      setTeachers((profilesRes.data || []).map(p => ({ id: p.id, name: p.full_name })));

      

      // Fetch original teacher_id if viewing existing record
      if (existingRecordId) {
        const { data: record } = await supabase
          .from('lesson_records')
          .select('teacher_id')
          .eq('id', existingRecordId)
          .single();
        
        if (record) {
          setOriginalTeacherId(record.teacher_id);
          
          // Teachers can only edit their own records, otherwise view mode
          if (isTeacher && !isAdmin && record.teacher_id !== user?.id) {
            setMode('view');
          }
        }
      } else {
        // New record - always edit mode and current user is teacher
        setOriginalTeacherId(null);
        setMode('edit');
      }
    } catch (error) {
      console.error('[LESSON_MODAL_FETCH_ERROR] catch:', error);
      setFetchError(`데이터 로드 중 오류: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  const handleSaved = () => {
    onSaved?.();
  };

  const handleSubmitted = () => {
    onOpenChange(false);
    onSaved?.();
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleRequestEdit = () => {
    setMode('edit');
  };

  // Determine dialog title based on context
  const getDialogTitle = () => {
    if (mode === 'view') {
      return '수업일지 상세';
    }
    if (existingRecordId) {
      return '수업일지 수정';
    }
    return '수업일지 작성';
  };

  // Allow modal to render with empty context for new records
  // Only block if explicitly null and no existing record
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0 bg-secondary/30">
          <DialogTitle className="text-base font-bold tracking-tight flex items-center gap-2">
            {getDialogTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-5 pb-5 pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : fetchError ? (
            <div className="p-4 bg-destructive/20 text-destructive rounded-lg">
              <p className="font-medium">FORM_LOAD_ERROR:</p>
              <p className="text-sm">{fetchError}</p>
            </div>
          ) : (
            <LessonRecordForm
              initialContext={context || undefined}
              existingRecordId={existingRecordId}
              onSaved={handleSaved}
              onSubmitted={handleSubmitted}
              onCancel={handleCancel}
              students={students}
              classes={classes}
              teachers={teachers}
              mode={mode}
              onRequestEdit={handleRequestEdit}
              originalTeacherId={originalTeacherId}
              forceNewRecord={forceNewRecord}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
