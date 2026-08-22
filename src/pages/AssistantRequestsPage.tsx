// DEPRECATED (ASSISTANT-MERGE-V1)
// 사용 중단: /assistant-requests 대표 화면은 이제 AssistantPage 가 렌더한다.
// 이 컴포넌트는 참조 0건이며 기능 손실 확인 후 제거 예정이다. (삭제 금지 · 참조 추가 금지)
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TeacherAssistantRequestsView } from '@/components/TeacherAssistantRequestsView';

export default function AssistantRequestsPageDeprecated() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <TeacherAssistantRequestsView />
    </ProtectedRoute>
  );
}
