import { ProtectedRoute } from '@/components/ProtectedRoute';
import Dashboard from './Dashboard';

export default function DashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <Dashboard />
    </ProtectedRoute>
  );
}
