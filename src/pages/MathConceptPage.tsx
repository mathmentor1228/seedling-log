import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MathConceptManager } from '@/components/math/MathConceptManager';

export default function MathConceptPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <MathConceptManager />
    </ProtectedRoute>
  );
}
