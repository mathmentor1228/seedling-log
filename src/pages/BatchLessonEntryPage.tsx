import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { BatchLessonModal } from '@/components/lessons/BatchLessonModal';

function BatchLessonEntryPageContent() {
  const navigate = useNavigate();

  const handleClose = useCallback(() => {
    if (window.opener) {
      window.close();
      return;
    }

    navigate('/lessons');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <BatchLessonModal
        open={true}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      />
    </div>
  );
}

export default function BatchLessonEntryPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <BatchLessonEntryPageContent />
    </ProtectedRoute>
  );
}