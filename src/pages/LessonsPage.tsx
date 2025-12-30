import { ProtectedRoute } from '@/components/ProtectedRoute';
import Lessons from './Lessons';

export default function LessonsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <Lessons />
    </ProtectedRoute>
  );
}
