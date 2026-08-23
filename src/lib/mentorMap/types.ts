// MENTOR-MAP-V1: 공통 타입
// 원칙: 진단/판정/능력평가 아님. '응답자가 전한 어려움'과 '수업에서 관찰할 부분'만 다룬다.

export type AuthorType = 'student' | 'parent' | 'both';
export type SchoolLevel = 'elementary' | 'middle' | 'high';
export type Perspective = 'student' | 'parent';

export const AUTHOR_LABEL: Record<AuthorType, string> = {
  student: '학생 본인',
  parent: '학부모',
  both: '함께 작성',
};

export const LEVEL_LABEL: Record<SchoolLevel, string> = {
  elementary: '초등',
  middle: '중등',
  high: '고등',
};

export const SUBJECTS = ['수학', '영어', '국어', '과학', '사회/역사'] as const;
export type SubjectKey = (typeof SUBJECTS)[number];

export const REQUEST_STATUS = ['new', 'contacting', 'consulted', 'enrolled', 'on_hold', 'archived'] as const;
export type RequestStatus = (typeof REQUEST_STATUS)[number];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  new: '신규',
  contacting: '연락예정',
  consulted: '상담완료',
  enrolled: '등록',
  on_hold: '보류',
  archived: '보관',
};

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  /** 질문 문구 */
  text: string;
  /** 보조 설명 */
  hint?: string;
  type: 'single' | 'multi' | 'text';
  options?: QuestionOption[];
  /** '잘 모르겠어요/해당 없음' 제공 여부 */
  allowUnknown?: boolean;
  optional?: boolean;
}

export interface QuestionSection {
  id: string;
  title: string;
  description?: string;
  perspective: Perspective;
  questions: Question[];
}

export interface MentorMapAnswers {
  student_name: string;
  author_type: AuthorType | '';
  school_level: SchoolLevel | '';
  contact_owner: 'parent' | 'student';
  contact_phone: string;
  school_name: string;
  grade: string;
  subjects: string[];
  priority_subjects: string[];
  preferred_method: string;
  preferred_time: string;
  student_answers: Record<string, string | string[]>;
  parent_answers: Record<string, string | string[]>;
  subject_answers: Record<string, string | string[]>;
  score_info: Record<string, string | string[]>;
  comm_pref: Record<string, string | string[]>;
  free_note: string;
  consent: boolean;
}

export const EMPTY_ANSWERS: MentorMapAnswers = {
  student_name: '',
  author_type: '',
  school_level: '',
  contact_owner: 'parent',
  contact_phone: '',
  school_name: '',
  grade: '',
  subjects: [],
  priority_subjects: [],
  preferred_method: '',
  preferred_time: '',
  student_answers: {},
  parent_answers: {},
  subject_answers: {},
  score_info: {},
  comm_pref: {},
  free_note: '',
  consent: false,
};

export const UNKNOWN_VALUE = 'unknown';
export const UNKNOWN_LABEL = '잘 모르겠어요 / 해당 없음';
