import { ProtectedRoute } from '@/components/ProtectedRoute';
import UserManagement from './UserManagement';

export default function UserManagementPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <UserManagement />
    </ProtectedRoute>
  );
}
