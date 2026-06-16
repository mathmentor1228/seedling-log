import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StudentGradeInput {
  grade?: string | null;
  school_level?: string | null;
  grade_year?: number | null;
}

export function formatStudentGrade(student?: StudentGradeInput | null): string | null {
  if (!student) return null;
  if (student.school_level && student.grade_year) {
    return `${student.school_level}${student.grade_year}`;
  }
  return student.grade || null;
}

/**
 * Get today's date in KST (Korea Standard Time) as yyyy-MM-dd string.
 * Safe for any user's local timezone.
 */
export function getTodayKST(): string {
  const now = new Date();
  // Format in Asia/Seoul timezone
  const kstString = now.toLocaleString('en-CA', { 
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // en-CA locale gives yyyy-MM-dd format
  return kstString;
}

/**
 * Get current Date object representing "now" in KST for calendar display.
 * Returns a Date whose local date matches KST date.
 */
export function getKSTDateObject(): Date {
  const kstDateStr = getTodayKST();
  // Parse as local date (midnight)
  const [year, month, day] = kstDateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * DUE-TODAY-END-OF-DAY-KST-V1
 * Parse a due date string to end-of-day KST for proper overdue comparison.
 * @param dueDateStr - Date string in YYYY-MM-DD format
 * @returns Date object representing 23:59:59 KST of that day
 */
export function parseDueDateToEndOfDayKST(dueDateStr: string): Date {
  // Parse as end of day (23:59:59) in KST
  // KST is UTC+9, so 23:59:59 KST = 14:59:59 UTC same day
  const [year, month, day] = dueDateStr.split('-').map(Number);
  // Create date as 23:59:59 KST by creating UTC time that corresponds to it
  // 23:59:59 KST = 14:59:59 UTC
  return new Date(Date.UTC(year, month - 1, day, 14, 59, 59));
}

/**
 * DUE-TODAY-END-OF-DAY-KST-V1
 * Get due badge info for assistant tasks with proper KST end-of-day logic.
 * @param dueDateStr - Due date string in YYYY-MM-DD format (or with time)
 * @param nowKST - Current KST date string (YYYY-MM-DD)
 * @returns Object with type ('overdue' | 'today' | 'future') and label
 */
export function getDueBadgeInfo(dueDateStr: string, nowKSTStr?: string): { type: 'overdue' | 'today' | 'future'; label: string } {
  // Extract just the date part if time is included
  const dateOnly = dueDateStr.split('T')[0];
  const todayKST = nowKSTStr || getTodayKST();
  
  // Parse end of day KST for the due date
  const dueEndOfDay = parseDueDateToEndOfDayKST(dateOnly);
  const now = new Date();
  
  // Compare: overdue only if now > end of due day
  if (now > dueEndOfDay) {
    return { type: 'overdue', label: '기한초과' };
  }
  
  // Check if due date is today
  if (dateOnly === todayKST) {
    return { type: 'today', label: '오늘까지' };
  }
  
  // Future date - format as MM/DD까지
  const [, month, day] = dateOnly.split('-').map(Number);
  return { type: 'future', label: `${month}/${day}까지` };
}
