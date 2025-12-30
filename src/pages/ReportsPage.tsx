import { ProtectedRoute } from '@/components/ProtectedRoute';
import Reports from './Reports';

export default function ReportsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <Reports />
    </ProtectedRoute>
  );
}
