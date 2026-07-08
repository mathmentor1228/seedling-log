import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminDailyOps } from '@/components/admin/AdminDailyOps';

// ADMIN-DAILY-OPS-V1
export default function AdminDailyOpsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
        <AdminDailyOps />
    </ProtectedRoute>
  );
}
