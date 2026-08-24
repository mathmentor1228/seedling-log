import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LessonRecordForm, LessonFormContext } from '@/components/lessons/LessonRecordForm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin as checkIsAdmin, isTeacher as checkIsTeacher } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FileEdit, Eye } from 'lucide-react';
import { getTodayKST } from '@/lib/utils';

function LessonRecordPageContent() {
  const { recordId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const isAdmin = checkIsAdmin(role);
  const isTeacher = checkIsTeacher(role);

  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string; subject: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [originalTeacherId, setOriginalTeacherId] = useState<string | null>(null);

  // Determine mode from URL
  const urlMode = searchParams.get('mode') as 'view' | 'edit' | null;
  const [mode, setMode] = useState<'view' | 'edit'>(urlMode || 'edit');
  const isNew = !recordId || recordId === 'new';

  // Build context from query params for new records
  const context: LessonFormContext | undefined = isNew ? {
    student_id: searchParams.get('student_id') || '',
    class_id: searchParams.get('class_id') || '',
    subject: searchParams.get('subject') || '수학',
    lesson_date: searchParams.get('lesson_date') || getTodayKST(),
  } : undefined;

  useEffect(() => {
    fetchData();
  }, [recordId]);

  async function fetchData() {
    setLoading(true);
    setFetchError(null);
    try {
      const [studentsRes, classesRes, profilesRes] = await Promise.all([
        supabase.from('students').select('id, name').order('name'),
        supabase.from('classes').select('id, name, subject, teacher_id').order('name'),
        supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      ]);

      setStudents(studentsRes.data || []);
      setClasses(classesRes.data || []);
      setTeachers((profilesRes.data || []).map(p => ({ id: p.id, name: p.full_name })));

      if (!isNew && recordId) {
        const { data: record } = await supabase
          .from('lesson_records')
          .select('teacher_id')
          .eq('id', recordId)
          .single();

        if (record) {
          setOriginalTeacherId(record.teacher_id);
          if (isTeacher && !isAdmin && record.teacher_id !== user?.id) {
            setMode('view');
          }
        }
      }
    } catch (error) {
      setFetchError(`데이터 로드 중 오류: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  const handleSaved = () => {};
  const handleSubmitted = () => navigate('/lessons');
  const handleCancel = () => navigate('/lessons');
  const handleRequestEdit = () => setMode('edit');

  const title = mode === 'view' ? '수업일지 상세' : isNew ? '수업일지 작성' : '수업일지 수정';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/lessons')} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          {mode === 'view' ? <Eye className="w-5 h-5 text-muted-foreground" /> : <FileEdit className="w-5 h-5 text-primary" />}
          {title}
        </h1>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : fetchError ? (
            <div className="p-4 bg-destructive/20 text-destructive rounded-lg">
              <p className="font-medium">데이터 로드 오류</p>
              <p className="text-sm">{fetchError}</p>
            </div>
          ) : (
            <LessonRecordForm
              initialContext={context}
              existingRecordId={isNew ? null : recordId}
              onSaved={handleSaved}
              onSubmitted={handleSubmitted}
              onCancel={handleCancel}
              students={students}
              classes={classes}
              teachers={teachers}
              mode={mode}
              onRequestEdit={handleRequestEdit}
              originalTeacherId={originalTeacherId}
              forceNewRecord={isNew}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LessonRecordPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <LessonRecordPageContent />
    </ProtectedRoute>
  );
}
