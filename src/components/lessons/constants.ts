// Shared constants for test/self-study/clinic system
export const ASSISTANTS = ['은서조교', '유빈조교'] as const;

export const ROOMS = [
  { value: 'general', label: '일반강의실' },
  { value: 'room10', label: '10강의실' },
  { value: 'glass', label: '유리문강의실' },
] as const;

export const TEST_TYPES = [
  { value: 'guerrilla', label: '게릴라' },
  { value: 'regular', label: '정기' },
  { value: 'retest', label: '재시험' },
] as const;

export const RECORD_TYPES = [
  { value: 'test', label: '테스트' },
  { value: 'self_study', label: '자습' },
  { value: 'clinic', label: '클리닉' },
] as const;

export function getRoomLabel(value: string) {
  return ROOMS.find(r => r.value === value)?.label || value;
}

export function getTestTypeLabel(value: string) {
  return TEST_TYPES.find(t => t.value === value)?.label || value;
}

export function isSpecialRoom(room: string) {
  return room === 'room10' || room === 'glass';
}
