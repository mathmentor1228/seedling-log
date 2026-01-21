// DASH-LATEST-TEST-TOGGLE-V1: Hook for fetching latest test per subject for a student
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

type SubjectType = '수학' | '과학' | '영어' | '국어';

export interface LatestTest {
  subject: SubjectType;
  lesson_date: string;
  test_title: string | null;
  test_result_text: string | null;
  english_pass_fail: string | null;
}

interface StudentLatestTests {
  studentId: string;
  tests: LatestTest[];
  loading: boolean;
  error: string | null;
}

// DASH-ROW-TEST-SNIPPET-V1: Helper to format compact test snippet for roster row
export function formatTestSnippet(test: LatestTest, maxLength: number = 35): string {
  const titlePart = test.test_title || '';
  const resultPart = test.test_result_text || '';
  
  let snippet = '테스트: ';
  if (titlePart) {
    snippet += titlePart;
  }
  if (resultPart) {
    snippet += titlePart ? ` – ${resultPart}` : resultPart;
  }
  
  // English: append pass/fail if present
  if (test.subject === '영어' && test.english_pass_fail) {
    const passFail = test.english_pass_fail === 'pass' ? '통과' : test.english_pass_fail === 'fail' ? '불통과' : '';
    if (passFail) {
      snippet += ` (${passFail})`;
    }
  }
  
  // Truncate if too long
  if (snippet.length > maxLength) {
    return snippet.slice(0, maxLength - 1) + '…';
  }
  
  return snippet;
}

// Cache for fetched tests - keyed by studentId
const latestTestsCache = new Map<string, { tests: LatestTest[]; timestamp: number }>();
const CACHE_TTL_MS = 60000; // 1 minute cache

export function useStudentLatestTests() {
  const [studentTests, setStudentTests] = useState<Map<string, StudentLatestTests>>(new Map());

  const fetchLatestTests = useCallback(async (studentId: string): Promise<LatestTest[]> => {
    // Check cache first
    const cached = latestTestsCache.get(studentId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.tests;
    }

    // Fetch from DB - latest test for each subject
    const subjects: SubjectType[] = ['수학', '과학', '영어', '국어'];
    const tests: LatestTest[] = [];

    for (const subject of subjects) {
      const { data, error } = await supabase
        .from('lesson_records')
        .select('lesson_date, test_title, test_result_text, english_pass_fail, subject')
        .eq('student_id', studentId)
        .eq('subject', subject)
        .or('test_title.neq.,test_result_text.neq.')
        .order('lesson_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data && (data.test_title || data.test_result_text)) {
        tests.push({
          subject,
          lesson_date: data.lesson_date,
          test_title: data.test_title,
          test_result_text: data.test_result_text,
          english_pass_fail: data.english_pass_fail,
        });
      }
    }

    // Update cache
    latestTestsCache.set(studentId, { tests, timestamp: Date.now() });

    return tests;
  }, []);

  const toggleStudent = useCallback(async (studentId: string) => {
    setStudentTests(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(studentId);

      if (existing && !existing.loading) {
        // Already expanded - collapse
        newMap.delete(studentId);
        return newMap;
      }

      // Start loading
      newMap.set(studentId, {
        studentId,
        tests: [],
        loading: true,
        error: null,
      });
      return newMap;
    });

    try {
      const tests = await fetchLatestTests(studentId);
      setStudentTests(prev => {
        const newMap = new Map(prev);
        newMap.set(studentId, {
          studentId,
          tests,
          loading: false,
          error: null,
        });
        return newMap;
      });
    } catch (error: any) {
      setStudentTests(prev => {
        const newMap = new Map(prev);
        newMap.set(studentId, {
          studentId,
          tests: [],
          loading: false,
          error: error.message || 'Failed to load tests',
        });
        return newMap;
      });
    }
  }, [fetchLatestTests]);

  const getStudentState = useCallback((studentId: string): StudentLatestTests | null => {
    return studentTests.get(studentId) || null;
  }, [studentTests]);

  const isExpanded = useCallback((studentId: string): boolean => {
    return studentTests.has(studentId);
  }, [studentTests]);

  const collapseAll = useCallback(() => {
    setStudentTests(new Map());
  }, []);

  return {
    toggleStudent,
    getStudentState,
    isExpanded,
    collapseAll,
  };
}

// Helper to format test display line
export function formatTestLine(test: LatestTest): string {
  const datePart = format(new Date(test.lesson_date), 'MM/dd');
  const titlePart = test.test_title || '';
  const resultPart = test.test_result_text || '';
  
  let line = `${datePart}`;
  if (titlePart) {
    line += ` ${titlePart}`;
  }
  if (resultPart) {
    line += titlePart ? ` – ${resultPart}` : ` ${resultPart}`;
  }
  
  // English: append pass/fail if present
  if (test.subject === '영어' && test.english_pass_fail) {
    const passFail = test.english_pass_fail === 'pass' ? '통과' : test.english_pass_fail === 'fail' ? '불통과' : '';
    if (passFail) {
      line += ` (${passFail})`;
    }
  }
  
  return line;
}
