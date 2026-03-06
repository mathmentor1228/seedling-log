import { ProtectedRoute } from '@/components/ProtectedRoute';
import { VocabTestGenerator } from '@/components/vocab/VocabTestGenerator';

export default function VocabTestGeneratorPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <VocabTestGenerator />
    </ProtectedRoute>
  );
}
