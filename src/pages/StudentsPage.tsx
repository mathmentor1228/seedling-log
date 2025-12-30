import { ProtectedRoute } from '@/components/ProtectedRoute';
import Students from './Students';

export default function StudentsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <Students />
    </ProtectedRoute>
  );
}
