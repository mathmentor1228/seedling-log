import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { AdminDailyOps } from '@/components/admin/AdminDailyOps';

// ADMIN-DAILY-OPS-V1
export default function AdminDailyOpsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AppLayout>
        <AdminDailyOps />
      </AppLayout>
    </ProtectedRoute>
  );
}
