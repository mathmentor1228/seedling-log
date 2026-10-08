import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ExamHub } from '@/components/exam-hub/ExamHub';

export default function ExamHubPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <ExamHub />
    </ProtectedRoute>
  );
}
