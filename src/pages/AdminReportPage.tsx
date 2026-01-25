import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminReport } from '@/components/admin/AdminReport';

// ADMIN_REPORT_TOOL_V1

export default function AdminReportPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminReport />
    </ProtectedRoute>
  );
}
