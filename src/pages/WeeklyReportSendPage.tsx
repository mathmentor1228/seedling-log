import { ProtectedRoute } from '@/components/ProtectedRoute';
import WeeklyReportSend from './WeeklyReportSend';

export default function WeeklyReportSendPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <WeeklyReportSend />
    </ProtectedRoute>
  );
}
