import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth, isAdmin, isAssistant, isTeacher } from '@/lib/auth';
import AssistantDashboard from '@/components/AssistantDashboard';
import { TeacherAssistantRequestsView } from '@/components/TeacherAssistantRequestsView';

function AssistantContent() {
  const { role } = useAuth();

  // Admin or Assistant: full assistant dashboard
  if (isAdmin(role) || isAssistant(role)) {
    return (
      <div className="space-y-4">
        {/* Marker for deployment confirmation */}
        <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded">
          ASSISTANT-DASHBOARD-V2 | REQUESTER-AND-RELATEDTEACHER-V1
        </div>
        <AssistantDashboard />
      </div>
    );
  }

  // Teacher: simplified request view
  if (isTeacher(role)) {
    return <TeacherAssistantRequestsView />;
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
