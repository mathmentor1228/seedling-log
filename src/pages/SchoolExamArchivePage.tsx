import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { SchoolExamArchive } from '@/components/SchoolExamArchive';

export default function SchoolExamArchivePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <AppLayout>
        <SchoolExamArchive />
      </AppLayout>
    </ProtectedRoute>
  );
}
