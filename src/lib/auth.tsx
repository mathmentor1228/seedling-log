import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'teacher' | 'assistant';

export function getDefaultDashboardPath(role: AppRole | string | null | undefined): string {
  switch (role) {
    case 'admin':
      return '/principal';
    case 'teacher':
      return '/teacher';
    case 'assistant':
      return '/assistant';
    default:
      return '/dashboard';
  }
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  assignedSubject: string | null;
  fullName: string | null;
  loading: boolean;
  isTrial: boolean;
  trialExpiresAt: string | null;
  isTrialExpired: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_LOOKUP_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), AUTH_LOOKUP_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } catch (error) {
    console.error('Auth lookup failed:', error);
    return fallback;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [assignedSubject, setAssignedSubject] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null);

  const applySession = async (nextSession: Session | null, finishLoading = false) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user) {
      setRole(null);
      setTrialExpiresAt(null);
      setAssignedSubject(null);
      setFullName(null);
      if (finishLoading) setLoading(false);
      return;
    }

    const [result, profile] = await Promise.all([
      withTimeout(fetchUserRole(nextSession.user.id), { role: null, trialExpiresAt: null }),
      withTimeout(fetchProfile(nextSession.user.id), { assignedSubject: null, fullName: null }),
    ]);

    setRole(result.role);
    setTrialExpiresAt(result.trialExpiresAt);
    setAssignedSubject(profile.assignedSubject);
    setFullName(profile.fullName);
    if (finishLoading) setLoading(false);
  };

  const fetchUserRole = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role, trial_expires_at')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user role:', error);
      return { role: null, trialExpiresAt: null };
    }

    if (!data || data.length === 0) {
      return { role: null, trialExpiresAt: null };
    }

    const roles = data.map(r => r.role as AppRole);
    let selectedRole: AppRole | null = null;
    if (roles.includes('admin')) selectedRole = 'admin';
    else if (roles.includes('teacher')) selectedRole = 'teacher';
    else if (roles.includes('assistant')) selectedRole = 'assistant';

    const matchingRecord = data.find(r => r.role === selectedRole);
    const expires = matchingRecord?.trial_expires_at || null;
    
    return { role: selectedRole, trialExpiresAt: expires };
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('assigned_subject, full_name')
      .eq('id', userId)
      .single();
    return { assignedSubject: (data as any)?.assigned_subject || null, fullName: (data as any)?.full_name || null };
  };

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setTimeout(() => {
          if (mounted) void applySession(session);
        }, 0);
      }
    );

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (mounted) return applySession(session, true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    if (data.user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', data.user.id)
        .single();
      if (prof && (prof as any).is_active === false) {
        await supabase.auth.signOut();
        return { error: new Error('비활성화된 계정입니다. 관리자에게 문의하세요.') };
      }
    }
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName }
      }
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setTrialExpiresAt(null);
      setAssignedSubject(null);
      setFullName(null);
  };

  const isTrial = !!trialExpiresAt;
  const isTrialExpired = isTrial && new Date(trialExpiresAt) < new Date();

  return (
    <AuthContext.Provider value={{ user, session, role, assignedSubject, fullName, loading, isTrial, trialExpiresAt, isTrialExpired, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Role helper functions - treat roles as distinct (not hierarchical)
export function isAdmin(role: AppRole | null): boolean {
  return role === 'admin';
}

export function isTeacher(role: AppRole | null): boolean {
  return role === 'teacher';
}

export function isAssistant(role: AppRole | null): boolean {
  return role === 'assistant';
}

// Check if user can create/edit lessons (admin or teacher only)
export function canManageLessons(role: AppRole | null): boolean {
  return role === 'admin' || role === 'teacher';
}

// Check if user can view lessons (all authenticated roles)
export function canViewLessons(role: AppRole | null): boolean {
  return role === 'admin' || role === 'teacher' || role === 'assistant';
}
