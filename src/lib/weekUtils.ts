// WEEK-UTILS-V1
export function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function getSundayOfWeek(date: Date): string {
  const mon = new Date(getMondayOfWeek(date));
  mon.setDate(mon.getDate() + 6);
  return mon.toISOString().slice(0, 10);
}
