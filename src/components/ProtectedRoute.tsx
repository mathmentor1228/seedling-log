import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

type AllowedRole = 'admin' | 'teacher' | 'assistant' | 'any';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AllowedRole[];
  allowedEmails?: string[];
  noLayout?: boolean;
}

const isEmailAllowed = (userEmail: string | undefined, allowedEmails?: string[]) => {
  const normalizedUserEmail = (userEmail || '').trim().toLowerCase();
  if (!normalizedUserEmail || !allowedEmails?.length) return false;
  return allowedEmails.some((email) => email.trim().toLowerCase() === normalizedUserEmail);
};

export function ProtectedRoute({ children, allowedRoles = ['any'], allowedEmails, noLayout }: ProtectedRouteProps) {
  const { user, loading, role, isTrial, trialExpiresAt, isTrialExpired, signOut } = useAuth();
  const navigate = useNavigate();

  const getRoleDashboard = (r: string) => {
    switch (r) {
      case 'admin': return '/principal';
      case 'teacher': return '/teacher';
      case 'assistant': return '/assistant';
      default: return '/dashboard';
    }
  };

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
      return;
    }

    if (!loading && user && !role) {
      // User has no role assigned yet
      return;
    }

    if (!loading && user && role) {
      // Check if user has required role
      const emailAllowed = isEmailAllowed(user.email, allowedEmails);
      const hasAccess = allowedRoles.includes('any') || allowedRoles.includes(role) || emailAllowed;
      
      if (!hasAccess) {
        navigate(getRoleDashboard(role), { replace: true });
      }
    }
  }, [user, loading, role, navigate, allowedRoles, allowedEmails]);

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

  // Trial expired - show expiry message
  if (isTrialExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4 space-y-4">
          <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
            <Clock className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">체험 기간이 만료되었습니다</h1>
          <p className="text-muted-foreground text-sm">
            7일 체험 기간이 종료되었습니다.<br />
            계속 사용을 원하시면 관리자에게 문의해주세요.
          </p>
          {trialExpiresAt && (
            <p className="text-xs text-muted-foreground">
              만료일: {format(new Date(trialExpiresAt), 'yyyy-MM-dd HH:mm')}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={() => signOut()}>
            로그아웃
          </Button>
        </div>
      </div>
    );
  }

  // User has no role yet - show waiting message
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold text-foreground mb-4">Welcome to EduTrack!</h1>
          <p className="text-muted-foreground">
            Your account is set up. Please contact your administrator to assign your role (Admin, Teacher, or Assistant).
          </p>
        </div>
      </div>
    );
  }

  // Check access
  const emailAllowed = isEmailAllowed(user.email, allowedEmails);
  const hasAccess = allowedRoles.includes('any') || allowedRoles.includes(role) || emailAllowed;
  if (!hasAccess) {
    return null;
  }

  if (noLayout) {
    return <>{children}</>;
  }

  return (
    <AppLayout>
      {isTrial && trialExpiresAt && (
        <div className="bg-primary/5 border-b border-primary/20 px-4 py-1.5 text-center">
          <span className="text-xs text-muted-foreground">
            체험판 사용 중 · 만료일: {format(new Date(trialExpiresAt), 'yyyy-MM-dd')}
          </span>
          <Badge variant="outline" className="ml-2 text-[10px] border-primary/30 text-primary">
            TRIAL
          </Badge>
        </div>
      )}
      {children}
    </AppLayout>
  );
}
