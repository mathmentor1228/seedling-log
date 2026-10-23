export type TuitionStatusFilter = 'all' | 'unpaid' | 'paid';

interface FilterableStudent {
  name: string;
  school: string | null;
  grade: string | null;
  totalFee: number;
  isPaid: boolean;
}

export function filterTuitionStudents<T extends FilterableStudent>(
  students: T[],
  search: string,
  status: TuitionStatusFilter,
): T[] {
  const query = search.trim().toLocaleLowerCase();
  return students.filter(student => {
    const matchesSearch = !query || [student.name, student.school, student.grade]
      .some(value => value?.toLocaleLowerCase().includes(query));
    const matchesStatus = status === 'all'
      || (status === 'unpaid' && student.totalFee > 0 && !student.isPaid)
      || (status === 'paid' && student.isPaid);
    return matchesSearch && matchesStatus;
  });
}