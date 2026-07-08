import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TodaySession } from '@/components/plan/TodaySession';

export default function PlanTodayPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <TodaySession />
    </ProtectedRoute>
  );
}
