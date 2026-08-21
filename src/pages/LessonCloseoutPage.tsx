import { useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LessonCloseoutForm, UNSAVED_CONFIRM_MESSAGE } from '@/components/lessons/LessonCloseoutForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { getTodayKST } from '@/lib/utils';

function LessonCloseoutContent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const classId = params.get('classId') || '';
  const date = params.get('date') || getTodayKST();

  if (!classId) {
    return <p className="p-6 text-sm text-muted-foreground">반 정보가 없습니다. 교사 홈에서 수업을 선택해 주세요.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> 뒤로
      </Button>
      <LessonCloseoutForm classId={classId} date={date} onClose={() => navigate(-1)} />
    </div>
  );
}

export default function LessonCloseoutPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <LessonCloseoutContent />
    </ProtectedRoute>
  );
}
