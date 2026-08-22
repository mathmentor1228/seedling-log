import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MathConceptManager } from '@/components/math/MathConceptManager';
import { ArchiveNotice } from '@/components/layout/ArchiveNotice';

export default function MathConceptPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <div className="space-y-3">
        <ArchiveNotice to="/lessons/close" label="수업 마감" />
      <MathConceptManager />
    </div>
    </ProtectedRoute>
  );
}
