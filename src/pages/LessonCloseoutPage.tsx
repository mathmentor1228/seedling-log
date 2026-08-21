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
  const dirtyRef = useRef(false);
  const handleDirtyChange = useCallback((d: boolean) => { dirtyRef.current = d; }, []);
  const guardedBack = useCallback(() => {
    if (dirtyRef.current && !window.confirm(UNSAVED_CONFIRM_MESSAGE)) return;
    dirtyRef.current = false;
    navigate(-1);
  }, [navigate]);

  if (!classId) {
    // 사이드바 '수업 마감'처럼 반 선택 없이 진입한 경우 교사 홈 마감 보드로 안내
    return <Navigate to="/teacher" replace />;
  }


  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4">
      <Button variant="ghost" size="sm" onClick={guardedBack} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> 뒤로
      </Button>
      <LessonCloseoutForm
        classId={classId}
        date={date}
        onClose={() => navigate(-1)}
        onDirtyChange={handleDirtyChange}
      />
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
