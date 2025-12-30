import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2 } from 'lucide-react';

type AllowedRole = 'admin' | 'teacher' | 'any';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AllowedRole[];
}

export function ProtectedRoute({ children, allowedRoles = ['any'] }: ProtectedRouteProps) {
  const { user, loading, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
      return;
    }

    if (!loading && user && !role) {
      // User has no role assigned yet
      return;
    }

    if (!loading && user && role) {
      // Check if user has required role
      const hasAccess = allowedRoles.includes('any') || allowedRoles.includes(role);
      
      if (!hasAccess) {
        // Teachers trying to access admin pages get redirected to Lessons
        if (role === 'teacher') {
          navigate('/lessons');
        }
      }
    }
  }, [user, loading, role, navigate, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // User has no role yet - show waiting message
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold text-foreground mb-4">Welcome to EduTrack!</h1>
          <p className="text-muted-foreground">
            Your account is set up. Please contact your administrator to assign your role (Admin or Teacher).
          </p>
        </div>
      </div>
    );
  }

  // Check access
  const hasAccess = allowedRoles.includes('any') || allowedRoles.includes(role);
  if (!hasAccess) {
    return null;
  }

  return <AppLayout>{children}</AppLayout>;
}
