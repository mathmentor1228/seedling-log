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

// STUDENT-UPLOAD-V2: base64 encode a File/Blob for secure server-side upload
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.includes(',') ? res.split(',')[1] : res);
    };
    reader.onerror = () => reject(new Error('READ_ERROR'));
    reader.readAsDataURL(file);
  });
}

// Convenience functions
export const studentApi = {
  uploadFile: (params: {
    bucket: string;
    homework_id?: string;
    content: string;
    content_type: string;
    ext?: string;
  }) => studentApiCall<{ path: string; url: string; bucket: string }>('upload_file', params),

  signUrls: (urls: string[]) =>
    studentApiCall<{ signed: Record<string, string> }>('sign_urls', { urls }),


  getDashboard: () => studentApiCall<{
    total_points: number;
    pending_homework: any[];
    upcoming_classes: any[];
    vocab_schedules?: any[];
    vocab_results?: any[];
    vocab_setting?: any;
    guerrilla_alerts?: any[];
    test_schedules?: any[];
    supplementary_lessons?: any[];
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

  getWeeklyReports: () => studentApiCall<{ reports: any[] }>('weekly_reports'),

  getExamReviews: (examYear?: number | null) => studentApiCall<{
    reviews: any[];
    school_report?: any | null;
    deep_reports?: any[];
    available_years?: number[];
    selected_exam_year?: number | null;
  }>('exam_reviews', examYear ? { exam_year: examYear } : {}),

  saveExamSelfCheck: (reviewId: string, itemNumber: number, answers: {
    remembered: boolean | null;
    conceptConfused: boolean | null;
    academyHelped: boolean | null;
    needMore: string;
    customReason?: string;
    selfErrorTypes: string[];
  }) => studentApiCall<{ success: boolean }>('save_exam_self_check', {
    review_id: reviewId,
    item_number: itemNumber,
    answers,
  }),

  completeExamSelfCheck: (reviewId: string) =>
    studentApiCall<{ success: boolean; points_awarded: number }>('complete_exam_self_check', { review_id: reviewId }),

  getVocabCards: () => studentApiCall<{ sets: any[]; completions: any[]; test_level?: number; test_time_limit?: number | null; active_test_assignment?: any | null; enhanced_features_enabled?: boolean }>('vocab_cards'),

  // AUTOVOCA-SPRINT2-A2/A3: 단어별 숙련도 + "오늘 복습할 단어" 큐
  getVocabMastery: () => studentApiCall<{
    mastery: any[];
    total_words: number;
    mastered_count: number;
    due_count: number;
    due_words: { english: string; meaning: string | null; level: number }[];
    level_distribution: number[];
  }>('vocab_mastery'),

  submitVocabCompletion: (
    wordSetIds: string[],
    correctCount: number,
    wrongCount: number,
    totalCount: number,
    mode: string,
    isSelfTest: boolean = false,
    testSource: string = 'assigned',
    extra?: {
      startedAt?: string;
      finishedAt?: string;
      durationSeconds?: number;
      expectedSeconds?: number;
      options?: Record<string, any>;
      wordResults?: { english: string; meaning?: string | null; correct: boolean }[];
    }
  ) =>
    studentApiCall<{ success: boolean }>('submit_vocab_completion', {
      word_set_ids: wordSetIds,
      correct_count: correctCount,
      wrong_count: wrongCount,
      total_count: totalCount,
      mode,
      is_self_test: isSelfTest,
      test_source: testSource,
      started_at: extra?.startedAt ?? null,
      finished_at: extra?.finishedAt ?? null,
      duration_seconds: extra?.durationSeconds ?? null,
      expected_seconds: extra?.expectedSeconds ?? null,
      self_test_options: extra?.options ?? null,
      word_results: extra?.wordResults ?? null,
    }),

  getMathQuizzes: () => studentApiCall<{ quizzes: any[]; submissions: any[] }>('math_quizzes'),

  submitMathQuiz: (quizId: string, conceptId: string, imageUrls: string[]) =>
    studentApiCall<{ submission_id: string; grading: any; points_awarded: number }>('submit_math_quiz', {
      quiz_id: quizId,
      concept_id: conceptId,
      image_urls: imageUrls,
    }),

  getExamPrepSchedules: () => studentApiCall<any[]>('exam_prep_schedules'),

  confirmExamPrepSchedule: (scheduleId: string) =>
    studentApiCall<{ success: boolean }>('confirm_exam_prep', { schedule_id: scheduleId }),

  // Study sessions
  getStudySessions: () => studentApiCall<{ sessions: any[]; vocab_assignments: any[] }>('study_sessions'),

  startStudySession: (sessionId: string) =>
    studentApiCall<{ success: boolean }>('start_study_session', { session_id: sessionId }),

  endStudySession: (sessionId: string) =>
    studentApiCall<{ success: boolean }>('end_study_session', { session_id: sessionId }),

  toggleStudyTask: (sessionId: string, taskId: string, completed: boolean) =>
    studentApiCall<{ success: boolean }>('toggle_study_task', { session_id: sessionId, task_id: taskId, completed }),

  // Math Question Room
  getMathQuestions: () => studentApiCall<{ questions: any[]; daily_count: number }>('math_questions_list'),

  submitMathQuestion: (params: {
    title: string;
    description: string | null;
    photo_problem_url: string;
    photo_solution_url: string;
    grade: string;
    subject: string;
    source_text: string;
  }) => studentApiCall<{ success: boolean; question_id: string }>('submit_math_question', params),
};
