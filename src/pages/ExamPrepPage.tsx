import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { ExamPrepScheduleManager } from '@/components/ExamPrepScheduleManager';

export default function ExamPrepPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <AppLayout>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">내신 특강 스케줄 관리</h1>
          <ExamPrepScheduleManager />
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
