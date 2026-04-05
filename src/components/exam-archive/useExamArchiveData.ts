import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SchoolInfo, Schedule, Textbook, SchoolFile } from './types';
import { differenceInDays, parseISO } from 'date-fns';

// Normalize school names (merge variants like 신길초 / 신길초등학교)
const SCHOOL_NAME_MAP: Record<string, string> = {
  '신길초등학교': '신길초',
};

function normalizeSchoolName(name: string): string {
  return SCHOOL_NAME_MAP[name] || name;
}

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
    const [schedulesRes, textbooksRes, filesRes, archivesRes, studentsRes, eventsRes] = await Promise.all([
      supabase.from('school_schedules').select('*').order('start_date', { ascending: true }),
      supabase.from('school_textbooks').select('*').order('grade'),
      supabase.from('school_files').select('*').order('created_at', { ascending: false }),
      supabase.from('school_exam_archives').select('*').order('updated_at', { ascending: false }),
      supabase.from('students').select('id, school').eq('enrollment_status', '재학'),
      supabase.from('academy_events').select('id, title, start_at, end_at, category').eq('category', 'exam').order('start_at', { ascending: true }),
    ]);

    // Normalize school names in all data
    const allSchedules = (schedulesRes.data || []).map((s: any) => ({ ...s, school_name: normalizeSchoolName(s.school_name) })) as Schedule[];
    const allTextbooks = (textbooksRes.data || []).map((t: any) => ({ ...t, school_name: normalizeSchoolName(t.school_name) })) as Textbook[];
    const allFiles = (filesRes.data || []).map((f: any) => ({ ...f, school_name: normalizeSchoolName(f.school_name) })) as SchoolFile[];
    const allArchives = (archivesRes.data || []).map((a: any) => ({ ...a, school_name: normalizeSchoolName(a.school_name) })) as any[];
    const students = (studentsRes.data || []).map((s: any) => ({ ...s, school: s.school ? normalizeSchoolName(s.school) : s.school })) as any[];
    const allEvents = (eventsRes.data || []) as any[];

    setSchedules(allSchedules);
    setTextbooks(allTextbooks);
    setFiles(allFiles);
    setArchives(allArchives);

    // Build school list from all sources
    const schoolSet = new Set<string>();
    allSchedules.forEach(s => schoolSet.add(s.school_name));
    allTextbooks.forEach(t => schoolSet.add(t.school_name));
    allArchives.forEach(a => schoolSet.add(a.school_name));
    allFiles.forEach(f => schoolSet.add(f.school_name));

    // Also add schools from students
    students.forEach(s => { if (s.school) schoolSet.add(s.school); });

    const today = new Date();
    const schoolInfos: SchoolInfo[] = Array.from(schoolSet)
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
      const examSchedules = allSchedules
        .filter(s => s.school_name === name && s.schedule_type === 'exam' && s.start_date)
        .map(s => ({ title: s.title, daysLeft: differenceInDays(parseISO(s.start_date!), today) }));

      // Also check academy_events whose title contains this school name
      const eventExams = allEvents
        .filter((e: any) => e.title && e.title.includes(name))
        .map((e: any) => {
          const startDate = e.start_at.split('T')[0];
          return { title: e.title, daysLeft: differenceInDays(parseISO(startDate), today) };
        });

      const allExamEntries = [...examSchedules, ...eventExams];

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

        return {
          name,
          level,
          studentCount,
          nextExam,
        };
      });

    setSchools(schoolInfos);
    if (!selectedSchool && schoolInfos.length > 0) {
      setSelectedSchool(schoolInfos[0].name);
    }
    setLoading(false);
  }, [selectedSchool]);

  useEffect(() => { fetchAll(); }, []);

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
