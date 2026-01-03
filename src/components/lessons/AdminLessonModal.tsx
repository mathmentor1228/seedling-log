import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LessonRecordForm, LessonFormContext } from './LessonRecordForm';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

interface AdminLessonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: LessonFormContext | null;
  existingRecordId?: string | null;
  onSaved?: () => void;
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
}: AdminLessonModalProps) {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  async function fetchData() {
    setLoading(true);
    try {
      const [studentsRes, classesRes] = await Promise.all([
        supabase.from('students').select('id, name').order('name'),
        supabase.from('classes').select('id, name, subject').order('name'),
      ]);

      setStudents(studentsRes.data || []);
      setClasses(classesRes.data || []);
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

  if (!context) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            수업일지 작성 (원장)
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
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
