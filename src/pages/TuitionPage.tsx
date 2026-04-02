import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TuitionDashboard } from '@/components/tuition/TuitionDashboard';

export default function TuitionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']} allowedEmails={['bfkor8810@naver.com']}>
      <TuitionDashboard />
    </ProtectedRoute>
  );
}
