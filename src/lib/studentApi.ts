// STUDENT-APP-V1: API helper for student app (uses edge function to bypass RLS)
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'student_session';

interface StudentSession {
  id: string;
  name: string;
  student_code: string;
  grade: string | null;
  school: string | null;
  token: string;
  expires_at: string;
}

function getStudentSession(): StudentSession | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  
  try {
    const session = JSON.parse(stored) as StudentSession;
    if (new Date(session.expires_at) > new Date()) {
      return session;
    }
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export async function studentApiCall<T = any>(
  action: string,
  params: Record<string, any> = {}
): Promise<{ data: T | null; error: string | null }> {
  const session = getStudentSession();
  
  if (!session) {
    return { data: null, error: 'No session' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('student-data', {
      body: {
        action,
        student_id: session.id,
        student_token: session.token,
        ...params,
      },
    });

    if (error) {
      console.error('studentApiCall error:', error);
      return { data: null, error: error.message };
    }

    if (data?.error) {
      return { data: null, error: data.error };
    }

    return { data, error: null };
  } catch (e) {
    console.error('studentApiCall exception:', e);
    return { data: null, error: 'Network error' };
  }
}

// Convenience functions
export const studentApi = {
  getDashboard: () => studentApiCall<{
    total_points: number;
    pending_homework: any[];
    upcoming_classes: any[];
    vocab_schedules?: any[];
    vocab_results?: any[];
    vocab_setting?: any;
  }>('dashboard'),

  getHomeworkList: () => studentApiCall<{ homework: any[] }>('homework_list'),

  getHomeworkSubmission: (homeworkId: string) =>
    studentApiCall<{ submission: any | null }>('homework_submission', { homework_id: homeworkId }),

  submitHomework: (homeworkId: string, imageUrl: string | null, submissionText: string | null, audioUrl: string | null = null) =>
    studentApiCall<{ success: boolean }>('submit_homework', {
      homework_id: homeworkId,
      image_url: imageUrl,
      submission_text: submissionText,
      audio_url: audioUrl,
    }),

  getPointsHistory: () => studentApiCall<{
    total_points: number;
    history: any[];
  }>('points_history'),

  getSchedule: () => studentApiCall<{ schedule: any[] }>('schedule'),

  getFeedback: () => studentApiCall<{ feedback: any[] }>('feedback'),
};
