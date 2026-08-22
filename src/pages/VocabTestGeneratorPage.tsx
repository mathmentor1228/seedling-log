import { ProtectedRoute } from '@/components/ProtectedRoute';
import { VocabTestGenerator } from '@/components/vocab/VocabTestGenerator';

// FEATURE-MAP-V2: 최근 90일 20건 실사용 확인 → 보관 해제(보조 기능, 시험·자료 메뉴에 노출)
export default function VocabTestGeneratorPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <div className="space-y-3">
        <VocabTestGenerator />
      </div>
    </ProtectedRoute>
  );
}
