import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { Timetable } from '@/components/Timetable';

export default function TimetablePage() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <Timetable />
      </AppLayout>
    </ProtectedRoute>
  );
}
