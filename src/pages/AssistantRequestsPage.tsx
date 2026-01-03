import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardCheck } from 'lucide-react';

// ASSISTANT-REQUESTS-PAGE-V1
function AssistantRequests() {
  return (
    <div className="space-y-6">
      {/* Marker for deployment confirmation */}
      <div className="text-xs text-muted-foreground text-center bg-muted/30 py-1 rounded">
        ASSISTANT-REQUESTS-PAGE-V1
      </div>
      
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">조교요청</h1>
          <p className="text-muted-foreground">선생님이 조교에게 요청하는 업무를 관리합니다</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>요청 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            요청 기능은 대시보드의 조교 체크리스트에서 관리됩니다. 
            대시보드로 이동하여 요청을 생성하고 관리하세요.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AssistantRequestsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <AssistantRequests />
    </ProtectedRoute>
  );
}
