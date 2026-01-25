import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminBriefing } from '@/components/admin/AdminBriefing';

export default function AdminBriefingPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminBriefing />
    </ProtectedRoute>
  );
}
