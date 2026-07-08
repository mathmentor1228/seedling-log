import { ProtectedRoute } from '@/components/ProtectedRoute';
import { StudentPlanner } from '@/components/plan/StudentPlanner';

export default function PlanPlannerPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <StudentPlanner />
    </ProtectedRoute>
  );
}
