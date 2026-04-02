import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SchoolInfo, Schedule, Textbook, SchoolFile } from './types';
import { differenceInDays, parseISO } from 'date-fns';

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
    const [schedulesRes, textbooksRes, filesRes, archivesRes, studentsRes] = await Promise.all([
      supabase.from('school_schedules').select('*').order('start_date', { ascending: true }),
      supabase.from('school_textbooks').select('*').order('grade'),
      supabase.from('school_files').select('*').order('created_at', { ascending: false }),
      supabase.from('school_exam_archives').select('*').order('updated_at', { ascending: false }),
      supabase.from('students').select('id, school').eq('enrollment_status', '재학'),
    ]);

    const allSchedules = (schedulesRes.data || []) as Schedule[];
    const allTextbooks = (textbooksRes.data || []) as Textbook[];
    const allFiles = (filesRes.data || []) as SchoolFile[];
    const allArchives = (archivesRes.data || []) as any[];
    const students = (studentsRes.data || []) as any[];

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
    const schoolInfos: SchoolInfo[] = Array.from(schoolSet).filter(Boolean).sort().map(name => {
      const studentCount = students.filter(s => s.school === name).length;

      // Determine school level
      const archive = allArchives.find(a => a.school_name === name);
      let level: 'elementary' | 'middle' | 'high' = 'middle';
      if (archive?.school_level === '고' || archive?.school_level === 'high') level = 'high';
      else if (archive?.school_level === '초' || archive?.school_level === 'elementary') level = 'elementary';
      else if (name.includes('고등') || name.includes('고')) level = 'high';
      else if (name.includes('초등') || name.includes('초')) level = 'elementary';

      // Find next exam
      const upcomingExams = allSchedules
        .filter(s => s.school_name === name && s.schedule_type === 'exam' && s.start_date)
        .map(s => ({ title: s.title, daysLeft: differenceInDays(parseISO(s.start_date!), today) }))
        .filter(e => e.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft);

      return {
        name,
        level,
        studentCount,
        nextExam: upcomingExams[0] || null,
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
