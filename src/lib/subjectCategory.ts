// Subject category classification for unified calendar/timetable
export type SubjectCategory = 'math' | 'english' | 'korean' | 'science' | 'other';

export const SUBJECT_CATEGORY_LABELS: Record<SubjectCategory, string> = {
  math: '수학',
  english: '영어',
  korean: '국어',
  science: '과학',
  other: '기타',
};

// Priority order (lower number = earlier/top)
export const SUBJECT_CATEGORY_PRIORITY: Record<SubjectCategory, number> = {
  math: 0,
  english: 1,
  korean: 2,
  science: 3,
  other: 9,
};

const KOREAN_KEYS = [
  '국어', '화법', '작문', '독서', '문학', '언어와매체', '언어와 매체',
  '심화국어', '독서와문법', '문법', '매체',
];
const ENGLISH_KEYS = [
  '영어', '영문', '영미', '미디어영어', '영어회화', '영어 회화',
  '독해와작문', '독해와 작문', 'english',
];
const MATH_KEYS = [
  '수학', '미적분', '확률과통계', '확률과 통계', '기하', '대수',
  '공통수학', '심화수학',
];
const SCIENCE_KEYS = [
  '과학', '물리', '화학', '생명', '지구과학', '통합과학',
];

function matchesAny(text: string, keys: string[]) {
  return keys.some((k) => text.includes(k.toLowerCase()));
}

export function classifySubject(raw: string | null | undefined): SubjectCategory {
  if (!raw) return 'other';
  const text = raw.toLowerCase().replace(/\s+/g, '');
  // Order matters: science before others to catch "통합과학"
  if (matchesAny(text, MATH_KEYS.map((k) => k.toLowerCase().replace(/\s+/g, '')))) return 'math';
  if (matchesAny(text, ENGLISH_KEYS.map((k) => k.toLowerCase().replace(/\s+/g, '')))) return 'english';
  if (matchesAny(text, KOREAN_KEYS.map((k) => k.toLowerCase().replace(/\s+/g, '')))) return 'korean';
  if (matchesAny(text, SCIENCE_KEYS.map((k) => k.toLowerCase().replace(/\s+/g, '')))) return 'science';
  return 'other';
}

// For composite subjects like "생명과학 / 세계 시민과 지리" — return the highest-priority category found
export function classifyCompositeSubject(raw: string | null | undefined): SubjectCategory {
  if (!raw) return 'other';
  const parts = raw.split(/[/,·]| 및 /).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return classifySubject(raw);
  const cats = parts.map(classifySubject);
  cats.sort((a, b) => SUBJECT_CATEGORY_PRIORITY[a] - SUBJECT_CATEGORY_PRIORITY[b]);
  return cats[0];
}

// Extract subject hint from a free-text title (e.g. "1학년 2학기 중간고사 수학")
export function classifyFromTitle(title: string | null | undefined): SubjectCategory {
  if (!title) return 'other';
  return classifySubject(title);
}

export const SUBJECT_CATEGORY_COLORS: Record<SubjectCategory, string> = {
  math: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  english: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  korean: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
  science: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
  other: 'bg-muted text-muted-foreground border-muted',
};
