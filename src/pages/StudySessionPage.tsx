import { ProtectedRoute } from '@/components/ProtectedRoute';
import { StudySessionManager } from '@/components/StudySessionManager';
import { ArchiveNotice } from '@/components/layout/ArchiveNotice';

export default function StudySessionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <div className="space-y-3">
        <ArchiveNotice to="/timetable" label="시간표" />
        <StudySessionManager />
    </div>
    </ProtectedRoute>
  );
}
