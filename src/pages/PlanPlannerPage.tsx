import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { StudentPlanner } from '@/components/plan/StudentPlanner';

export default function PlanPlannerPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <AppLayout>
        <StudentPlanner />
      </AppLayout>
    </ProtectedRoute>
  );
}
