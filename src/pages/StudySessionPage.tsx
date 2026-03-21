import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { StudySessionManager } from '@/components/StudySessionManager';

export default function StudySessionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <AppLayout>
        <StudySessionManager />
      </AppLayout>
    </ProtectedRoute>
  );
}
