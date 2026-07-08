import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SchoolExamArchiveNew } from '@/components/exam-archive/SchoolExamArchiveNew';

export default function SchoolExamArchivePage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
        <SchoolExamArchiveNew />
    </ProtectedRoute>
  );
}
