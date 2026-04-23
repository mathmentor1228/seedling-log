const EXAM_TYPE_MAP: Record<string, string> = {
  '중간고사': 'midterm',
  '기말고사': 'final',
  '모의고사': 'mock',
  midterm: 'midterm',
  final: 'final',
  mock: 'mock',
  performance: 'performance',
  '수행평가': 'performance',
  other: 'other',
  '기타': 'other',
};

const EXAM_TYPE_KOR_MAP: Record<string, string> = {
  midterm: '중간고사',
  final: '기말고사',
  mock: '모의고사',
  performance: '수행평가',
  other: '기타',
};

export function normalizeTextValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeGrade(value: string | number | null | undefined) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('학년')) return trimmed;
  return /^\d+$/.test(trimmed) ? `${trimmed}학년` : trimmed;
}

export function normalizeExamType(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  return EXAM_TYPE_MAP[trimmed] ?? EXAM_TYPE_MAP[trimmed.toLowerCase()] ?? trimmed;
}

export function displayExamType(value: string | null | undefined) {
  const normalized = normalizeExamType(value);
  if (!normalized) return '';
  return EXAM_TYPE_KOR_MAP[normalized] ?? normalized;
}
