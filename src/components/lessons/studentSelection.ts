import { supabase } from '@/integrations/supabase/client';

export interface StudentListItem {
  id: string;
  name: string;
  school: string | null;
  school_level: string | null;
  grade_year: number | null;
}

const SCHOOL_LEVEL_ORDER: Record<string, number> = { 초: 0, 중: 1, 고: 2 };
const collator = new Intl.Collator('ko');

export function sortStudents<T extends Pick<StudentListItem, 'name' | 'school_level' | 'grade_year'>>(students: T[]) {
  return [...students].sort((a, b) => {
    const levelA = SCHOOL_LEVEL_ORDER[a.school_level || ''] ?? 99;
    const levelB = SCHOOL_LEVEL_ORDER[b.school_level || ''] ?? 99;
    if (levelA !== levelB) return levelA - levelB;

    const gradeA = a.grade_year ?? 99;
    const gradeB = b.grade_year ?? 99;
    if (gradeA !== gradeB) return gradeA - gradeB;

    return collator.compare(a.name, b.name);
  });
}

export function groupStudentsByGrade<T extends { name: string; school_level: string | null; grade_year: number | null }>(students: T[]) {
  const groups = new Map<string, T[]>();

  for (const student of sortStudents(students)) {
    const level = student.school_level || '기타';
    const grade = student.grade_year ?? 0;
    const key = `${level}${grade}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(student);
  }

  return [...groups.entries()].sort(([a], [b]) => {
    const levelA = SCHOOL_LEVEL_ORDER[a[0]] ?? 99;
    const levelB = SCHOOL_LEVEL_ORDER[b[0]] ?? 99;
    if (levelA !== levelB) return levelA - levelB;
    return collator.compare(a, b);
  });
}

export function getStudentGroupLabel(key: string) {
  if (key === '기타0') return '미분류';
  const level = key[0];
  const grade = key.slice(1);
  const levelName = level === '초' ? '초등' : level === '중' ? '중등' : level === '고' ? '고등' : level;
  return `${levelName} ${grade}학년`;
}

export async function fetchTeacherStudentIds(teacherId: string, subject: string) {
  if (!teacherId || !subject) return [] as string[];

  const [{ data: directMap }, { data: classes }, { data: lessonRecords }] = await Promise.all([
    supabase
      .from('student_subject_teachers')
      .select('student_id')
      .eq('teacher_id', teacherId)
      .eq('subject', subject),
    supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('subject', subject as any),
    supabase
      .from('lesson_records')
      .select('student_id')
      .eq('teacher_id', teacherId)
      .eq('subject', subject as any),
  ]);

  const classIds = (classes || []).map((row) => row.id);
  const classStudents = classIds.length > 0
    ? await supabase.from('class_students').select('student_id').in('class_id', classIds)
    : { data: [] as { student_id: string }[] };

  const idSet = new Set<string>();
  (directMap || []).forEach((row) => idSet.add(row.student_id));
  (classStudents.data || []).forEach((row) => idSet.add(row.student_id));
  (lessonRecords || []).forEach((row) => idSet.add(row.student_id));

  return [...idSet];
}

export async function fetchStudentsByIds(studentIds?: string[] | null) {
  if (studentIds && studentIds.length === 0) {
    return [] as StudentListItem[];
  }

  let query = supabase
    .from('students')
    .select('id, name, school, school_level, grade_year')
    .in('enrollment_status', ['재학', '재등원']);

  if (studentIds) {
    query = query.in('id', studentIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  return sortStudents((data || []) as StudentListItem[]);
}
