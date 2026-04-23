import { Navigate } from 'react-router-dom';

export default function ExamPrepPage() {
  return <Navigate to="/exam-archive?tab=prep" replace />;
}
