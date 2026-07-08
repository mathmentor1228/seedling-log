// PLAN-PRINCIPAL-BOARD-V1: 원장 격차 대시보드 페이지 (admin 전용)
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { PrincipalBoard } from '@/components/plan/PrincipalBoard';

export default function PlanOverviewPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AppLayout>
        <PrincipalBoard />
      </AppLayout>
    </ProtectedRoute>
  );
}
