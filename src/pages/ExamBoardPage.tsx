import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { TeacherExamBoard } from '@/components/exam-board/TeacherExamBoard';

export default function ExamBoardPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <AppLayout>
        <TeacherExamBoard />
      </AppLayout>
    </ProtectedRoute>
  );
}
