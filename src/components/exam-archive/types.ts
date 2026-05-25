// School Exam Archive - Shared types and constants
export interface SchoolInfo {
  name: string;
  level: 'elementary' | 'middle' | 'high';
  studentCount: number;
  nextExam: { title: string; daysLeft: number } | null;
  finalsExam: { title: string; daysLeft: number; start_date: string } | null;
}

export interface Schedule {
  id: string;
  school_name: string;
  schedule_type: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  grade: number | null;
  subject: string | null;
  description: string | null;
  source_file_url: string | null;
  is_ai_extracted: boolean;
  created_at: string;
}

export interface Textbook {
  id: string;
  school_name: string;
  grade: number | null;
  subject: string;
  publisher: string | null;
  textbook_name: string | null;
  year: number;
  created_at: string;
}

export interface SchoolFile {
  id: string;
  school_name: string;
  file_type: string;
  file_name: string;
  file_url: string;
  subject_filter: string;
  ai_extraction_status: string;
  ai_extracted_data: any;
  extracted_count: number;
  created_at: string;
}

export const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  exam: '시험',
  performance: '수행평가',
  holiday: '휴일',
  event: '행사',
  other: '기타',
};

export const SCHEDULE_TYPE_COLORS: Record<string, string> = {
  exam: 'bg-destructive/10 text-destructive border-destructive/20',
  performance: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  holiday: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  event: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  other: 'bg-muted text-muted-foreground border-muted',
};

export const FILE_TYPE_LABELS: Record<string, string> = {
  school_calendar: '학사일정',
  textbook_list: '교과서 목록',
  evaluation_plan: '평가계획서',
  other: '기타',
};

export const SCHOOL_LEVEL_LABELS: Record<string, string> = {
  elementary: '초등학교',
  middle: '중학교',
  high: '고등학교',
};
