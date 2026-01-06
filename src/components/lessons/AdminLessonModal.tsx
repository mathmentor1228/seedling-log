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

interface AdminLessonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: LessonFormContext | null;
  existingRecordId?: string | null;
  onSaved?: () => void;
  initialMode?: 'view' | 'edit';
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

export function AdminLessonModal({
  open,
  onOpenChange,
  context,
  existingRecordId,
  onSaved,
  initialMode = 'view',
}: AdminLessonModalProps) {
  const { user, role } = useAuth();
  const isAdmin = checkIsAdmin(role);
  const isTeacher = checkIsTeacher(role);
  
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      const [studentsRes, classesRes] = await Promise.all([
        supabase.from('students').select('id, name').order('name'),
        supabase.from('classes').select('id, name, subject').order('name'),
      ]);

      setStudents(studentsRes.data || []);
      setClasses(classesRes.data || []);

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
      console.error('Error fetching data:', error);
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

  if (!context) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'view' ? '수업일지 상세' : '수업일지 작성'} (원장)
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <LessonRecordForm
            initialContext={context}
            existingRecordId={existingRecordId}
            onSaved={handleSaved}
            onSubmitted={handleSubmitted}
            onCancel={handleCancel}
            students={students}
            classes={classes}
            mode={mode}
            onRequestEdit={handleRequestEdit}
            originalTeacherId={originalTeacherId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
