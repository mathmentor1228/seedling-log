// EXAM-DIRECTION-V1: 원장 디렉션 보드 페이지 (admin 전용)
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PrincipalDirectionBoard } from '@/components/exam-board/PrincipalDirectionBoard';

export default function ExamDirectionPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
        <PrincipalDirectionBoard />
    </ProtectedRoute>
  );
}
