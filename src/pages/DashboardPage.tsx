import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
import { getDefaultDashboardPath, useAuth } from '@/lib/auth';
import Dashboard from './Dashboard';

function DashboardRouteResolver() {
  const { role } = useAuth();
  const targetPath = getDefaultDashboardPath(role);

  if (role && targetPath !== '/dashboard') {
    return <Navigate to={targetPath} replace />;
  }

  return <Dashboard />;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <DashboardRouteResolver />
    </ProtectedRoute>
  );
}
