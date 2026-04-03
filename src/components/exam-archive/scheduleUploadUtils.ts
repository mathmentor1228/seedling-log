import type { Database } from '@/integrations/supabase/types';

type SchoolScheduleInsert = Database['public']['Tables']['school_schedules']['Insert'];

const MOCK_EXAM_KEYWORDS = ['모의고사', '전국연합', '학력평가', '교육청'];
const HOLIDAY_KEYWORDS = ['재량휴업', '재량 휴업', '휴업일', '휴교', '방학', '개교기념일'];
const EVENT_KEYWORDS = ['소풍', '현장체험', '체험학습', '체육대회', '축제', '수련회', '개학식', '종업식', '입학식', '졸업식'];
const PERFORMANCE_KEYWORDS = ['수행평가', '수행', '발표평가', '프로젝트'];
const EXAM_KEYWORDS = ['중간고사', '기말고사', '시험', '고사', '지필평가'];

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeScheduleType(item: any) {
  const rawType = typeof item?.schedule_type === 'string' ? item.schedule_type : '';
  if (['exam', 'performance', 'holiday', 'event', 'other'].includes(rawType)) {
    return rawType;
  }

  const text = `${item?.title || ''} ${item?.description || ''} ${item?.subject || ''}`;

  if (includesAny(text, MOCK_EXAM_KEYWORDS) || includesAny(text, EXAM_KEYWORDS)) return 'exam';
  if (includesAny(text, PERFORMANCE_KEYWORDS)) return 'performance';
  if (includesAny(text, HOLIDAY_KEYWORDS)) return 'holiday';
  if (includesAny(text, EVENT_KEYWORDS)) return 'event';
  return 'other';
}

export function isGlobalMockExam(item: any) {
  const text = `${item?.title || ''} ${item?.description || ''} ${item?.subject || ''}`;
  return includesAny(text, MOCK_EXAM_KEYWORDS);
}

export function buildSchoolCalendarScheduleRow(
  item: any,
  schoolName: string,
  createdBy?: string | null,
): SchoolScheduleInsert | null {
  const title = typeof item?.title === 'string' ? item.title.trim() : '';
  if (!title) return null;

  return {
    school_name: isGlobalMockExam(item) ? '전체일정' : schoolName,
    schedule_type: normalizeScheduleType(item),
    title,
    start_date: item?.start_date || null,
    end_date: item?.end_date || null,
    grade: typeof item?.grade === 'number' ? item.grade : null,
    subject: item?.subject || null,
    description: item?.description || null,
    source_file_url: null,
    is_ai_extracted: true,
    created_by: createdBy || null,
  };
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('파일을 읽지 못했습니다.'));
    };
    reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}