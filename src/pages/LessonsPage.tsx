import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import Lessons from './Lessons';
import { Loader2 } from 'lucide-react';

export default function LessonsPage() {
  const { user, loading, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
    if (!loading && user && !role) {
      navigate('/');
    }
  }, [user, loading, role, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !role) {
    return null;
  }

  return (
    <AppLayout>
      <Lessons />
    </AppLayout>
  );
}
