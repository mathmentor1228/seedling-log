import { Navigate } from 'react-router-dom';

export default function ExamReviewPage() {
  return <Navigate to="/exam-archive?tab=review" replace />;
}