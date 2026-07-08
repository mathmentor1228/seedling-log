import { ProtectedRoute } from '@/components/ProtectedRoute';
import { StudySessionManager } from '@/components/StudySessionManager';

export default function StudySessionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
        <StudySessionManager />
    </ProtectedRoute>
  );
}
