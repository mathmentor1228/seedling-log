import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TeacherExamBoard } from '@/components/exam-board/TeacherExamBoard';

export default function ExamBoardPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <TeacherExamBoard />
    </ProtectedRoute>
  );
}
