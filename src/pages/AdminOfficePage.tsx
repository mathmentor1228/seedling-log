import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminOfficeBoard } from '@/components/admin/AdminOfficeBoard';

export default function AdminOfficePage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminOfficeBoard />
    </ProtectedRoute>
  );
}
