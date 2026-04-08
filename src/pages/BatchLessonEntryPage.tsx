import { ProtectedRoute } from '@/components/ProtectedRoute';
import { BatchLessonModal } from '@/components/lessons/BatchLessonModal';

function BatchLessonEntryPageContent() {
  return (
    <BatchLessonModal
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          window.close();
        }
      }}
      standalone
    />
  );
}

export default function BatchLessonEntryPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <BatchLessonEntryPageContent />
    </ProtectedRoute>
  );
}