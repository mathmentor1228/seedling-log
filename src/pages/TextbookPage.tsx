import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TextbookManagement } from '@/components/textbook/TextbookManagement';

export default function TextbookPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <TextbookManagement />
    </ProtectedRoute>
  );
}
