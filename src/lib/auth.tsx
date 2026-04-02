import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'teacher' | 'assistant';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [assignedSubject, setAssignedSubject] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null);

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
          Promise.all([
              fetchUserRole(session.user.id),
              fetchProfile(session.user.id),
            ]).then(([result, profile]) => {
              setRole(result.role);
              setTrialExpiresAt(result.trialExpiresAt);
              setAssignedSubject(profile.assignedSubject);
              setFullName(profile.fullName);
            });
          }, 0);
        } else {
          setRole(null);
          setTrialExpiresAt(null);
          setAssignedSubject(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        Promise.all([
          fetchUserRole(session.user.id),
          fetchAssignedSubject(session.user.id),
        ]).then(([result, subject]) => {
          setRole(result.role);
          setTrialExpiresAt(result.trialExpiresAt);
          setAssignedSubject(subject);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
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
  };

  const isTrial = !!trialExpiresAt;
  const isTrialExpired = isTrial && new Date(trialExpiresAt) < new Date();

  return (
    <AuthContext.Provider value={{ user, session, role, assignedSubject, loading, isTrial, trialExpiresAt, isTrialExpired, signIn, signUp, signOut }}>
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
