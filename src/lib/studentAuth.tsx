 // STUDENT-APP-V1: Student authentication context and hooks
 import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 
 interface StudentSession {
   id: string;
   name: string;
   student_code: string;
   grade: string | null;
   school: string | null;
   token: string;
   expires_at: string;
 }
 
 interface StudentAuthContextType {
   student: StudentSession | null;
   isLoading: boolean;
   login: (studentCode: string, pin: string) => Promise<{ error?: string }>;
   logout: () => void;
 }
 
 const StudentAuthContext = createContext<StudentAuthContextType | undefined>(undefined);
 
 const STORAGE_KEY = 'student_session';
 
 export function StudentAuthProvider({ children }: { children: ReactNode }) {
   const [student, setStudent] = useState<StudentSession | null>(null);
   const [isLoading, setIsLoading] = useState(true);
 
   useEffect(() => {
     // Check for existing session
     const stored = localStorage.getItem(STORAGE_KEY);
     if (stored) {
       try {
         const session = JSON.parse(stored) as StudentSession;
         // Check if session is expired
         if (new Date(session.expires_at) > new Date()) {
           setStudent(session);
         } else {
           localStorage.removeItem(STORAGE_KEY);
         }
       } catch (e) {
         localStorage.removeItem(STORAGE_KEY);
       }
     }
     setIsLoading(false);
   }, []);
 
   const login = async (studentCode: string, pin: string): Promise<{ error?: string }> => {
     try {
       const { data, error } = await supabase.functions.invoke('student-auth', {
         body: {
           action: 'login',
           student_code: studentCode,
           pin,
         },
       });
 
       if (error) {
         console.error('Student login error:', error);
         return { error: '로그인에 실패했습니다.' };
       }
 
       if (data.error) {
         return { error: data.error };
       }
 
       const session: StudentSession = {
         id: data.student.id,
         name: data.student.name,
         student_code: data.student.student_code,
         grade: data.student.grade,
         school: data.student.school,
         token: data.session.token,
         expires_at: data.session.expires_at,
       };
 
       localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
       setStudent(session);
 
       return {};
     } catch (e) {
       console.error('Student login error:', e);
       return { error: '로그인에 실패했습니다.' };
     }
   };
 
   const logout = () => {
     localStorage.removeItem(STORAGE_KEY);
     setStudent(null);
   };
 
   return (
     <StudentAuthContext.Provider value={{ student, isLoading, login, logout }}>
       {children}
     </StudentAuthContext.Provider>
   );
 }
 
 export function useStudentAuth() {
   const context = useContext(StudentAuthContext);
   if (context === undefined) {
     throw new Error('useStudentAuth must be used within a StudentAuthProvider');
   }
   return context;
 }