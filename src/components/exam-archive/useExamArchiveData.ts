import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SchoolInfo, Schedule, Textbook, SchoolFile } from './types';
import { differenceInDays, parseISO } from 'date-fns';
import { getTodayKST } from '@/lib/utils';
import { isFinalsTitle, pickNearestFinals } from '@/lib/finalsExamUtils';

// Normalize school names (merge variants like 신길초 / 신길초등학교)
const SCHOOL_NAME_MAP: Record<string, string> = {
  '신길초등학교': '신길초',
};

const SCHOOL_SUFFIX_RULES = [
  { suffix: '초등학교', replacement: '초' },
  { suffix: '중학교', replacement: '중' },
  { suffix: '고등학교', replacement: '고' },
];

function normalizeSchoolName(name: string): string {
  const compactName = name.trim().replace(/\s+/g, '');
  if (!compactName) return compactName;
  if (SCHOOL_NAME_MAP[compactName]) return SCHOOL_NAME_MAP[compactName];

  const suffixRule = SCHOOL_SUFFIX_RULES.find(({ suffix }) => compactName.endsWith(suffix));
  if (suffixRule) {
    return `${compactName.slice(0, -suffixRule.suffix.length)}${suffixRule.replacement}`;
  }

  return compactName;
}

function getSchoolAliases(name: string) {
  const normalized = normalizeSchoolName(name);
  const aliases = new Set<string>([normalized]);

  if (normalized.endsWith('초')) aliases.add(`${normalized.slice(0, -1)}초등학교`);
  if (normalized.endsWith('중')) aliases.add(`${normalized.slice(0, -1)}중학교`);
  if (normalized.endsWith('고')) aliases.add(`${normalized.slice(0, -1)}고등학교`);

  return Array.from(aliases).map((alias) => alias.replace(/\s+/g, ''));
}

function matchesSchoolTitle(title: string, schoolName: string) {
  const compactTitle = title.replace(/\s+/g, '');
  return getSchoolAliases(schoolName).some((alias) => compactTitle.includes(alias));
}

function buildEventSchedule(event: any, schoolName: string): Schedule {
  const startDate = event.start_at ? event.start_at.split('T')[0] : null;
  const endDate = event.end_at ? event.end_at.split('T')[0] : startDate;

  return {
    id: `academy-event-${event.id}-${schoolName}`,
    school_name: schoolName,
    schedule_type: 'exam',
    title: event.title,
    start_date: startDate,
    end_date: endDate,
    grade: null,
    subject: null,
    description: null,
    source_file_url: null,
    is_ai_extracted: false,
    created_at: event.start_at,
  };
}

function normalizeGradeYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/[1-6]/);
    return match ? Number(match[0]) : null;
  }
  return null;
}

function dateInRange(date: string | null, start: string | null, end: string | null) {
  if (!date || !start) return false;
  const rangeEnd = end || start;
  return date >= start && date <= rangeEnd;
}

// Roman numeral conversion (I/II/III)
function romanToInt(roman: string): number | null {
  const map: Record<string, number> = { I: 1, II: 2, III: 3 };
  return map[roman] ?? null;
}

// Infer grade from exam title (high-school course names)
// e.g. "기말고사 - 공통영어1" → 1, "공통수학II" → 2
function inferGradeFromTitle(title: string | null | undefined): number | null {
  if (!title) return null;
  const t = title.replace(/\s+/g, '');

  // 공통XX1/2 or 공통XXI/II  (공통영어, 공통수학, 공통국어, 공통사회, 공통과학 등)
  const commonMatch = t.match(/공통[가-힣]+(III|II|I|[1-3])/);
  if (commonMatch) {
    const token = commonMatch[1];
    if (/^[1-3]$/.test(token)) return Number(token);
    const r = romanToInt(token);
    if (r) return r;
  }

  // 영어I/II, 수학I/II → 2학년/3학년
  const upperMatch = t.match(/(?:^|[^가-힣])(영어|수학|국어)(III|II|I)(?:$|[^가-힣A-Za-z])/);
  if (upperMatch) {
    const r = romanToInt(upperMatch[2]);
    if (r) return r + 1; // 영어I = 고2
  }

  return null;
}

const ROMAN_SUFFIX_MAP: Record<string, string> = { I: '1', II: '2', III: '3', Ⅰ: '1', Ⅱ: '2', Ⅲ: '3' };

function normalizeCourseName(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .replace(/[ⅠⅡⅢ]/g, (token) => ROMAN_SUFFIX_MAP[token] || token)
    .replace(/\s+/g, '')
    .replace(/[·ㆍ∙・.]/g, '')
    .replace(/(III|II|I)$/i, (token) => ROMAN_SUFFIX_MAP[token.toUpperCase()] || token)
    .toLowerCase();
}

function getScheduleCourseCandidates(schedule: Schedule): string[] {
  const candidates = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    candidates.add(trimmed);
    trimmed
      .split(/[/,，]|\s+및\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => candidates.add(part));
  };

  add(schedule.subject);
  add(schedule.title);
  schedule.title
    ?.split(/[-–—:：]/)
    .slice(1)
    .forEach(add);

  return Array.from(candidates);
}

function inferGradeFromTextbooks(schedule: Schedule, textbooks: Textbook[]): number | null | undefined {
  const candidates = getScheduleCourseCandidates(schedule)
    .map(normalizeCourseName)
    .filter(Boolean);
  if (candidates.length === 0) return undefined;

  const candidateSet = new Set(candidates);
  const grades = new Set<number>();

  for (const textbook of textbooks) {
    if (textbook.school_name !== schedule.school_name) continue;
    const grade = normalizeGradeYear(textbook.grade);
    if (!grade) continue;
    const textbookNames = [textbook.course_name, textbook.textbook_name]
      .map(normalizeCourseName)
      .filter(Boolean);
    if (textbookNames.some((name) => candidateSet.has(name))) {
      grades.add(grade);
    }
  }

  if (grades.size === 1) return Array.from(grades)[0];
  if (grades.size > 1) return null;
  return undefined;
}

function inferScheduleGrade(schedule: Schedule, archives: any[], students: any[], textbooks: Textbook[]): number | null {
  // School-specific course/textbook catalog is the authority: e.g. 선부고 영어1=2학년, 공통영어1=1학년.
  const fromTextbooks = inferGradeFromTextbooks(schedule, textbooks);
  if (fromTextbooks !== undefined) return fromTextbooks;

  const existing = normalizeGradeYear(schedule.grade);
  if (existing) return existing;

  // Title-based inference takes priority (most reliable for high-school courses)
  const fromTitle = inferGradeFromTitle(schedule.title);
  if (fromTitle) return fromTitle;

  const archiveGrades = new Set<number>();
  for (const archive of archives) {
    if (archive.school_name !== schedule.school_name) continue;
    if (!dateInRange(schedule.start_date, archive.exam_date_start || null, archive.exam_date_end || null)) continue;
    const grade = normalizeGradeYear(archive.grade_year);
    if (grade) archiveGrades.add(grade);
  }
  if (archiveGrades.size === 1) return Array.from(archiveGrades)[0];

  const activeStudentGrades = new Set<number>();
  for (const student of students) {
    if (student.school !== schedule.school_name) continue;
    const grade = normalizeGradeYear(student.grade_year ?? student.grade);
    if (grade) activeStudentGrades.add(grade);
  }
  if (activeStudentGrades.size === 1) return Array.from(activeStudentGrades)[0];

  return null;
}

const RECENT_PAST_EXAM_DAYS = 120;

export function useExamArchiveData() {
  const [schools, setSchools] = useState<SchoolInfo[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [files, setFiles] = useState<SchoolFile[]>([]);
  const [archives, setArchives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
    const [schedulesRes, textbooksRes, filesRes, archivesRes, studentsRes, eventsRes] = await Promise.all([
      supabase.from('school_schedules').select('*').order('start_date', { ascending: true }),
      supabase.from('school_textbooks').select('*').order('grade'),
      supabase.from('school_files').select('*').order('created_at', { ascending: false }),
      supabase.from('school_exam_archives').select('*').order('updated_at', { ascending: false }),
      supabase.from('students').select('id, school, grade, school_level, grade_year').in('enrollment_status', ['재학', '재등원']),
      supabase.from('academy_events').select('id, title, start_at, end_at, category').eq('category', 'exam').order('start_at', { ascending: true }),
    ]);

    // Normalize school names in all data
    const allSchedules = (schedulesRes.data || []).map((s: any) => ({ ...s, school_name: normalizeSchoolName(s.school_name) })) as Schedule[];
    const allTextbooks = (textbooksRes.data || []).map((t: any) => ({ ...t, school_name: normalizeSchoolName(t.school_name) })) as Textbook[];
    const allFiles = (filesRes.data || []).map((f: any) => ({ ...f, school_name: normalizeSchoolName(f.school_name) })) as SchoolFile[];
    const allArchives = (archivesRes.data || []).map((a: any) => ({ ...a, school_name: normalizeSchoolName(a.school_name) })) as any[];
    const students = (studentsRes.data || []).map((s: any) => ({ ...s, school: s.school ? normalizeSchoolName(s.school) : s.school })) as any[];
    const allEvents = (eventsRes.data || []) as any[];

    // Build school list from all sources
    const schoolSet = new Set<string>();
    allSchedules.forEach(s => schoolSet.add(s.school_name));
    allTextbooks.forEach(t => schoolSet.add(t.school_name));
    allArchives.forEach(a => schoolSet.add(a.school_name));
    allFiles.forEach(f => schoolSet.add(f.school_name));

    // Also add schools from students
    students.forEach(s => { if (s.school) schoolSet.add(s.school); });

    const schoolNames = Array.from(schoolSet).filter(Boolean);
    const eventSchedules = schoolNames.flatMap((schoolName) =>
      allEvents
        .filter((event) => event.title && matchesSchoolTitle(event.title, schoolName))
        .map((event) => buildEventSchedule(event, schoolName))
    );

    const mergedSchedules = Array.from(
      new Map(
        [...allSchedules, ...eventSchedules].map((schedule) => [
          [
            schedule.school_name,
            schedule.schedule_type,
            schedule.start_date || '',
            schedule.end_date || '',
            schedule.title,
          ].join('|'),
          schedule,
        ])
      ).values()
    )
      .map((schedule) => ({
        ...schedule,
        grade: inferScheduleGrade(schedule, allArchives, students, allTextbooks),
      }))
      .sort((a, b) => (a.start_date || '9999-12-31').localeCompare(b.start_date || '9999-12-31'));

    setSchedules(mergedSchedules);
    setTextbooks(allTextbooks);
    setFiles(allFiles);
    setArchives(allArchives);

    const today = parseISO(getTodayKST());
    const schoolInfos: SchoolInfo[] = schoolNames
      .filter(Boolean)
      .sort((a, b) => {
        if (a === '전체일정') return -1;
        if (b === '전체일정') return 1;
        return a.localeCompare(b, 'ko');
      })
      .map(name => {
      const studentCount = students.filter(s => s.school === name).length;

      // Determine school level
      const archive = allArchives.find(a => a.school_name === name);
      let level: 'elementary' | 'middle' | 'high' = 'middle';
      if (archive?.school_level === '고' || archive?.school_level === 'high') level = 'high';
      else if (archive?.school_level === '초' || archive?.school_level === 'elementary') level = 'elementary';
      else if (name.includes('고등') || name.includes('고')) level = 'high';
      else if (name.includes('초등') || name.includes('초')) level = 'elementary';

      // Collect exam D-day from BOTH school_schedules AND academy_events
      const examSchedules = mergedSchedules
        .filter(s => s.school_name === name && s.schedule_type === 'exam' && s.start_date)
        .map(s => ({ title: s.title, daysLeft: differenceInDays(parseISO(s.start_date!), today) }));

      const allExamEntries = examSchedules.filter((entry) => entry.daysLeft >= -RECENT_PAST_EXAM_DAYS);

      const upcomingExams = allExamEntries
        .filter(e => e.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft);

      // If no upcoming exams, show the most recent past exam
      let nextExam = upcomingExams[0] || null;
      if (!nextExam) {
        const pastExams = allExamEntries
          .filter(e => e.daysLeft < 0)
          .sort((a, b) => b.daysLeft - a.daysLeft); // most recent first (closest to 0)
        if (pastExams.length > 0) {
          nextExam = pastExams[0];
        }
      }

        // 1학기 기말고사 D-Day: merge school_schedules (exam) + academy_events for this school
        const finalsCandidates: { title: string; start_date: string }[] = [];
        for (const s of mergedSchedules) {
          if (s.school_name === name && s.schedule_type === 'exam' && s.start_date && isFinalsTitle(s.title)) {
            finalsCandidates.push({ title: s.title, start_date: s.start_date });
          }
        }
        for (const ev of allEvents) {
          if (!ev.title || !ev.start_at) continue;
          if (!matchesSchoolTitle(ev.title, name)) continue;
          if (!isFinalsTitle(ev.title)) continue;
          finalsCandidates.push({ title: ev.title, start_date: ev.start_at.split('T')[0] });
        }
        const finalsExam = pickNearestFinals(finalsCandidates, today);

        return {
          name,
          level,
          studentCount,
          nextExam,
          finalsExam,
        };
      });

    setSchools(schoolInfos);
    if (!selectedSchool) {
      setSelectedSchool('__hub__');
    }
    } catch (err) {
      console.error('useExamArchiveData fetchAll error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSchool]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return {
    schools,
    schedules,
    textbooks,
    files,
    archives,
    loading,
    selectedSchool,
    setSelectedSchool,
    refetch: fetchAll,
  };
}
