import { ProtectedRoute } from '@/components/ProtectedRoute';
import Students from './Students';

export default function StudentsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']} allowedEmails={['bfkor8810@naver.com']}>
      <Students />
    </ProtectedRoute>
  );
}
