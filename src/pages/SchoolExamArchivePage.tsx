import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { SchoolExamArchiveNew } from '@/components/exam-archive/SchoolExamArchiveNew';

export default function SchoolExamArchivePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <AppLayout>
        <SchoolExamArchiveNew />
      </AppLayout>
    </ProtectedRoute>
  );
}
