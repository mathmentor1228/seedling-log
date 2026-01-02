import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
