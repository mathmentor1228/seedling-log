import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const DAYS_OF_WEEK = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
];

interface ScheduleRow {
  classId: string;
  className: string;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  studentCount: number;
}

interface TeacherScheduleTableProps {
  scheduleRows: ScheduleRow[];
  onRowClick?: (classId: string) => void;
  highlightClassId?: string | null;
}

export function TeacherScheduleTable({ 
  scheduleRows, 
  onRowClick,
  highlightClassId 
}: TeacherScheduleTableProps) {
  const sortedRows = useMemo(() => {
    return [...scheduleRows].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [scheduleRows]);

  const formatTime = (time: string) => time.slice(0, 5);

  if (sortedRows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        등록된 시간표가 없습니다
      </p>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader className="sticky top-0 bg-muted/50">
          <TableRow className="text-xs">
            <TableHead className="py-2 px-3">요일</TableHead>
            <TableHead className="py-2 px-3">시작</TableHead>
            <TableHead className="py-2 px-3">종료</TableHead>
            <TableHead className="py-2 px-3">과목</TableHead>
            <TableHead className="py-2 px-3">클래스명</TableHead>
            <TableHead className="py-2 px-3 text-center">학생</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row, idx) => (
            <TableRow
              key={`${row.classId}-${row.dayOfWeek}-${idx}`}
              className={`text-sm cursor-pointer hover:bg-muted/30 ${
                highlightClassId === row.classId ? 'bg-primary/10' : ''
              }`}
              onClick={() => onRowClick?.(row.classId)}
            >
              <TableCell className="py-2 px-3">
                <Badge variant="outline" className="text-xs">
                  {DAYS_OF_WEEK.find((d) => d.value === row.dayOfWeek)?.label}
                </Badge>
              </TableCell>
              <TableCell className="py-2 px-3 font-mono text-xs">
                {formatTime(row.startTime)}
              </TableCell>
              <TableCell className="py-2 px-3 font-mono text-xs">
                {formatTime(row.endTime)}
              </TableCell>
              <TableCell className="py-2 px-3">
                <Badge variant="secondary" className="text-xs">
                  {row.subject}
                </Badge>
              </TableCell>
              <TableCell className="py-2 px-3 text-xs truncate max-w-[120px]">
                {row.className}
              </TableCell>
              <TableCell className="py-2 px-3 text-center text-xs">
                {row.studentCount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
