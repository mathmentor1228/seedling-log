// ASSISTANT-MERGE-V1
// 대표 화면: /assistant-requests (이전 /assistant-tasks 는 호환 주소로 redirect)
// 역할별 분리: admin·assistant = 조교 업무 보드(받은 업무·상태 변경), teacher = 요청 생성·상태 확인
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth, isAdmin, isAssistant, isTeacher } from '@/lib/auth';
import AssistantDashboard from '@/components/AssistantDashboard';
import { TeacherAssistantRequestsView } from '@/components/TeacherAssistantRequestsView';
import { ClipboardCheck } from 'lucide-react';

function AssistantContent() {
  const { role } = useAuth();

  const header = (
    <div className="flex items-center gap-2">
      <ClipboardCheck className="w-5 h-5 text-primary" />
      <div>
        <h1 className="text-lg font-semibold text-foreground">조교 요청·업무</h1>
        <p className="text-xs text-muted-foreground">
          {isTeacher(role)
            ? '조교에게 업무를 요청하고 처리 상태를 확인합니다.'
            : '요청 접수·배정과 조교 업무 처리 상태를 한 화면에서 관리합니다.'}
        </p>
      </div>
    </div>
  );

  // Admin or Assistant: full assistant dashboard (받은 업무 · 상태 변경 · 배정)
  if (isAdmin(role) || isAssistant(role)) {
    return (
      <div className="space-y-4">
        {header}
        <AssistantDashboard />
      </div>
    );
  }

  // Teacher: 요청 생성 · 내 요청 상태 확인
  if (isTeacher(role)) {
    return (
      <div className="space-y-4">
        {header}
        <TeacherAssistantRequestsView />
      </div>
    );
  }

  return (
    <div className="text-center text-muted-foreground py-8">
      접근 권한이 없습니다.
    </div>
  );
}

export default function AssistantPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <AssistantContent />
    </ProtectedRoute>
  );
}
