export type StudentStatus = 'not_arrived' | 'checked_in' | 'checked_out';

export interface StudentEntry {
  studentId: string;
  studentName: string;
  roomId: string;
  roomLabel: string;
  status: StudentStatus;
  time?: string;
  logId?: string;
  slotStart?: string;
  teacherId?: string;
  teacherName?: string;
}

export interface RoleColors {
  bg: string;
  border: string;
  text: string;
}

export const ROOMS = [
  { id: 'room10', label: '10강' },
  { id: 'glass', label: '유리문' },
] as const;

export const ROLE_COLORS: Record<string, RoleColors> = {
  assistant: { bg: '#E1F5EE', border: '#1D9E75', text: '#1D9E75' },
  teacher: { bg: '#EEEDFE', border: '#534AB7', text: '#534AB7' },
  admin: { bg: '#FAEEDA', border: '#BA7517', text: '#BA7517' },
};

export const getDayOfWeek = (dateStr: string): string => {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[new Date(dateStr).getDay()];
};

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export const getCurrentSlot = (date: Date): string => {
  const h = date.getHours();
  const m = date.getMinutes() < 30 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
};
