import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Timetable } from '@/components/Timetable';

export default function TimetablePage() {
  return (
    <ProtectedRoute>
        <Timetable />
    </ProtectedRoute>
  );
}
