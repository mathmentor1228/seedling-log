import { describe, it, expect } from 'vitest';
import { filterActiveTeacherClasses } from './activeClasses';

describe('filterActiveTeacherClasses', () => {
  const retired = new Set(['t-retired']);

  it('퇴사 선생님 반은 제외한다', () => {
    const rows = [
      { id: 'a', teacher_id: 't-retired' },
      { id: 'b', teacher_id: 't-active' },
    ];
    expect(filterActiveTeacherClasses(rows, retired).map((r) => r.id)).toEqual(['b']);
  });

  it('담당 미지정 반은 유지한다', () => {
    const rows = [{ id: 'c', teacher_id: null }];
    expect(filterActiveTeacherClasses(rows, retired)).toHaveLength(1);
  });

  it('빈 입력은 빈 배열', () => {
    expect(filterActiveTeacherClasses(null, retired)).toEqual([]);
  });
});
