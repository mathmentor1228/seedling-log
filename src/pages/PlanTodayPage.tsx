import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { TodaySession } from '@/components/plan/TodaySession';

export default function PlanTodayPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <AppLayout>
        <TodaySession />
      </AppLayout>
    </ProtectedRoute>
  );
}
