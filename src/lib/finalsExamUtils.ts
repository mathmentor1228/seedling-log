// Utilities for detecting and counting down to "1학기 기말고사" per school.
// Sources are merged: school_schedules (exam type) + academy_events (exam category).

export function isFinalsTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return /기말|2차\s*지필|2차지필|final/i.test(title);
}

export interface FinalsCandidate {
  title: string;
  start_date: string; // YYYY-MM-DD
}

/**
 * Given a list of candidates with title + start_date, return the nearest upcoming
 * finals (or most recent past finals within `pastWindowDays`).
 */
export function pickNearestFinals(
  candidates: FinalsCandidate[],
  today: Date,
  pastWindowDays = 14,
): { title: string; daysLeft: number; start_date: string } | null {
  const finals = candidates.filter((c) => isFinalsTitle(c.title) && c.start_date);
  if (finals.length === 0) return null;

  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const enriched = finals
    .map((c) => {
      const d = new Date(c.start_date + 'T00:00:00');
      const daysLeft = Math.ceil((d.getTime() - todayMs) / (1000 * 60 * 60 * 24));
      return { title: c.title, daysLeft, start_date: c.start_date };
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const upcoming = enriched.filter((e) => e.daysLeft >= 0);
  if (upcoming.length > 0) return upcoming[0];

  const past = enriched.filter((e) => e.daysLeft >= -pastWindowDays).sort((a, b) => b.daysLeft - a.daysLeft);
  return past[0] ?? null;
}

export function finalsDdayLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'D-Day';
  if (daysLeft > 0) return `D-${daysLeft}`;
  return `D+${Math.abs(daysLeft)}`;
}

export function finalsDdayColor(daysLeft: number): string {
  if (daysLeft <= 0) return 'bg-destructive text-destructive-foreground';
  if (daysLeft <= 7) return 'bg-destructive/90 text-destructive-foreground';
  if (daysLeft <= 14) return 'bg-orange-500 text-white';
  if (daysLeft <= 30) return 'bg-amber-500 text-white';
  return 'bg-blue-500/80 text-white';
}
