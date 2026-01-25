// TEST-CONTENT-DISPLAY-V2: Hook for fetching latest test per subject for a student
// Priority: test_content is primary, test_title is fallback, test_result_text is secondary
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

type SubjectType = '수학' | '과학' | '영어' | '국어';

export interface LatestTest {
  subject: SubjectType;
  lesson_date: string;
  test_content: string | null;  // Primary field for test scope/description
  test_title: string | null;    // Fallback if test_content is empty
  test_result_text: string | null;  // This is the test RESULT
  english_pass_fail: string | null;
}

interface StudentLatestTests {
  studentId: string;
  tests: LatestTest[];
  loading: boolean;
  error: string | null;
}

// TEST-CONTENT-DISPLAY-V2: Helper to get display content (content-first)
export function getTestDisplayContent(test: LatestTest): string {
  if (test.test_content?.trim()) return test.test_content.trim();
  if (test.test_title?.trim()) return test.test_title.trim();
  return '';
}

// TEST-CONTENT-DISPLAY-V2: Helper to format compact test snippet for roster row
// Priority: test_content first, then test_title, then result
export function formatTestSnippet(test: LatestTest, maxLength: number = 35): string {
  const contentPart = getTestDisplayContent(test);
  const resultPart = test.test_result_text || '';
  
  // If no content (test_content or test_title), don't show test section
  if (!contentPart) {
    return '';
  }
  
  let snippet = '테스트: ';
  
  // Truncate content to ~30 chars if needed for compact view
  const maxContentLength = 30;
  const truncatedContent = contentPart.length > maxContentLength 
    ? contentPart.slice(0, maxContentLength - 1) + '…' 
    : contentPart;
  
  snippet += truncatedContent;
  
  // Add result
  if (resultPart) {
    snippet += ` – ${resultPart}`;
  }
  
  // English: append pass/fail if present
  if (test.subject === '영어' && test.english_pass_fail) {
    const passFail = test.english_pass_fail === 'pass' ? '통과' : test.english_pass_fail === 'fail' ? '불통과' : '';
    if (passFail) {
      snippet += ` (${passFail})`;
    }
  }
  
  // Final truncation for overall length
  if (snippet.length > maxLength) {
    return snippet.slice(0, maxLength - 1) + '…';
  }
  
  return snippet;
}

// Helper to get full tooltip text (untruncated)
export function formatTestTooltip(test: LatestTest): string {
  const contentPart = getTestDisplayContent(test);
  const resultPart = test.test_result_text || '';
  
  if (!contentPart) return '';
  
  let tooltip = `내용: ${contentPart}`;
  if (resultPart) {
    tooltip += ` → 결과: ${resultPart}`;
  }
  
  if (test.subject === '영어' && test.english_pass_fail) {
    const passFail = test.english_pass_fail === 'pass' ? '통과' : test.english_pass_fail === 'fail' ? '불통과' : '';
    if (passFail) {
      tooltip += ` (${passFail})`;
    }
  }
  
  return tooltip;
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
      // TEST-CONTENT-DISPLAY-V2: Fetch records with either test_content or test_title
      const { data, error } = await supabase
        .from('lesson_records')
        .select('lesson_date, test_content, test_title, test_result_text, english_pass_fail, subject')
        .eq('student_id', studentId)
        .eq('subject', subject)
        .or('test_content.neq.,test_title.neq.')
        .order('lesson_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const testContent = data?.test_content?.trim() || '';
      const testTitle = data?.test_title?.trim() || '';
      
      // Only add if we have some content
      if (!error && data && (testContent || testTitle)) {
        tests.push({
          subject,
          lesson_date: data.lesson_date,
          test_content: data.test_content,
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

// TEST-CONTENT-DISPLAY-V2: Helper to format expanded test display line
// Format: [MM/dd] 내용: {test_content or test_title} 결과: {test_result_text}
export function formatTestLine(test: LatestTest): string {
  const datePart = format(new Date(test.lesson_date), 'MM/dd');
  const contentPart = getTestDisplayContent(test);
  const resultPart = test.test_result_text || '';
  
  // If no content, return empty (shouldn't happen with new query filter)
  if (!contentPart) return '';
  
  let line = `[${datePart}] 내용: ${contentPart}`;
  
  if (resultPart) {
    line += ` 결과: ${resultPart}`;
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

// TEST-CONTENT-DISPLAY-V2: Structured format for expanded view
export interface FormattedTestDetails {
  date: string;
  content: string;
  result: string | null;
  passFail: string | null;
}

export function getTestDetails(test: LatestTest): FormattedTestDetails | null {
  const content = getTestDisplayContent(test);
  if (!content) return null;
  
  return {
    date: format(new Date(test.lesson_date), 'MM/dd'),
    content,
    result: test.test_result_text || null,
    passFail: test.subject === '영어' && test.english_pass_fail 
      ? (test.english_pass_fail === 'pass' ? '통과' : test.english_pass_fail === 'fail' ? '불통과' : null)
      : null,
  };
}
