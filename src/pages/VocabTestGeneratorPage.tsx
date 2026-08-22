import { ProtectedRoute } from '@/components/ProtectedRoute';
import { VocabTestGenerator } from '@/components/vocab/VocabTestGenerator';
import { ArchiveNotice } from '@/components/layout/ArchiveNotice';

export default function VocabTestGeneratorPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <div className="space-y-3">
        <ArchiveNotice to="/vocab-test" label="단어시험 관리" />
      <VocabTestGenerator />
    </div>
    </ProtectedRoute>
  );
}
