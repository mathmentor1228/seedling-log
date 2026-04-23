import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarIcon, Check, RotateCcw, Search, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

type AppRole = 'admin' | 'teacher' | 'assistant';
type RecordType = '테스트' | '자습' | '클리닉' | '수업기록';
type TypeFilter = 'all' | RecordType;
type StatusFilter = 'all' | 'unconfirmed' | 'confirmed';

type StudentLite = {
  name: string | null;
  grade: string | number | null;
} | null;

type TeacherOption = {
  id: string;
  full_name: string;
};

type BaseCrossCheckRecord = {
  id: string;
  student_id: string;
  teacher_id: string | null;
  created_at: string;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  students?: StudentLite;
  type: RecordType;
};

type CrossCheckTabProps = {
  onUnconfirmedCountChange?: (count: number) => void;
};

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: '테스트', label: '테스트' },
  { value: '자습', label: '자습' },
  { value: '클리닉', label: '클리닉' },
  { value: '수업기록', label: '수업기록' },
];

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'unconfirmed', label: '미확인' },
  { value: 'confirmed', label: '확인완료' },
];

const getTableName = (type: RecordType) => ({
  테스트: 'test_records',
  자습: 'self_study_records',
  클리닉: 'clinic_records',
  수업기록: 'lesson_records',
}[type]);

const normalizeGrade = (grade: string | number | null | undefined) => {
  if (grade === null || grade === undefined || grade === '') return '-';
  return typeof grade === 'number' ? `${grade}` : grade;
};

const formatDateLabel = (value: string | null) => {
  if (!value) return '-';
  return format(new Date(value), 'yyyy.MM.dd HH:mm', { locale: ko });
};

const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

export function CrossCheckTab({ onUnconfirmedCountChange }: CrossCheckTabProps) {
  const { user, role, fullName } = useAuth();
  const [records, setRecords] = useState<BaseCrossCheckRecord[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [teacherFilter, setTeacherFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [pendingKeys, setPendingKeys] = useState<Record<string, boolean>>({});

  const isTeacher = role === 'teacher';
  const canChooseTeacher = role === 'admin' || role === 'assistant';

  const teacherNameMap = useMemo(
    () => Object.fromEntries(teachers.map((teacher) => [teacher.id, teacher.full_name])),
    [teachers],
  );

  useEffect(() => {
    if (isTeacher && user?.id) {
      setTeacherFilter(user.id);
    }
  }, [isTeacher, user?.id]);

  const fetchTeachers = useCallback(async () => {
    if (!canChooseTeacher) return;

    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'teacher');

    if (roleError) {
      throw roleError;
    }

    const teacherIds = Array.from(new Set((roleRows ?? []).map((row) => row.user_id).filter(Boolean)));
    if (teacherIds.length === 0) {
      setTeachers([]);
      return;
    }

    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', teacherIds)
      .eq('is_active', true)
      .order('full_name');

    if (profileError) {
      throw profileError;
    }

    setTeachers(profileRows ?? []);
  }, [canChooseTeacher]);

  const fetchAllRecords = useCallback(async () => {
    if (!user || !role) return;

    setLoading(true);

    const teacherId = isTeacher ? user.id : teacherFilter !== 'all' ? teacherFilter : null;
    const startDateText = startDate ? format(startDate, 'yyyy-MM-dd') : null;
    const endDateText = endDate ? format(endDate, 'yyyy-MM-dd') : null;

    const applyCommonFilters = <T extends { eq: Function; gte: Function; lte: Function }>(query: T) => {
      let nextQuery = query;

      if (teacherId) {
        nextQuery = nextQuery.eq('teacher_id', teacherId);
      }

      if (startDateText) {
        nextQuery = nextQuery.gte('created_at', `${startDateText}T00:00:00`);
      }

      if (endDateText) {
        nextQuery = nextQuery.lte('created_at', `${endDateText}T23:59:59`);
      }

      return nextQuery;
    };

    try {
      const [tests, selfStudy, clinic, lessons] = await Promise.all([
        applyCommonFilters(
          supabase
            .from('test_records')
            .select('id, student_id, teacher_id, created_at, confirmed_by, confirmed_by_name, confirmed_at, students(name, grade)')
            .order('created_at', { ascending: false }),
        ),
        applyCommonFilters(
          supabase
            .from('self_study_records')
            .select('id, student_id, teacher_id, created_at, confirmed_by, confirmed_by_name, confirmed_at, students(name, grade)')
            .order('created_at', { ascending: false }),
        ),
        applyCommonFilters(
          supabase
            .from('clinic_records')
            .select('id, student_id, teacher_id, created_at, confirmed_by, confirmed_by_name, confirmed_at, students(name, grade)')
            .order('created_at', { ascending: false }),
        ),
        applyCommonFilters(
          supabase
            .from('lesson_records')
            .select('id, student_id, teacher_id, created_at, confirmed_by, confirmed_by_name, confirmed_at, students(name, grade)')
            .order('created_at', { ascending: false }),
        ),
      ]);

      const error = tests.error || selfStudy.error || clinic.error || lessons.error;
      if (error) throw error;

      const merged: BaseCrossCheckRecord[] = [
        ...((tests.data ?? []) as Array<Omit<BaseCrossCheckRecord, 'type'>>).map((record) => ({ ...record, type: '테스트' })),
        ...((selfStudy.data ?? []) as Array<Omit<BaseCrossCheckRecord, 'type'>>).map((record) => ({ ...record, type: '자습' })),
        ...((clinic.data ?? []) as Array<Omit<BaseCrossCheckRecord, 'type'>>).map((record) => ({ ...record, type: '클리닉' })),
        ...((lessons.data ?? []) as Array<Omit<BaseCrossCheckRecord, 'type'>>).map((record) => ({ ...record, type: '수업기록' })),
      ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

      setRecords(merged);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '크로스체킹 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [endDate, isTeacher, role, startDate, teacherFilter, user]);

  useEffect(() => {
    void fetchTeachers();
  }, [fetchTeachers]);

  useEffect(() => {
    void fetchAllRecords();
  }, [fetchAllRecords]);

  useEffect(() => {
    onUnconfirmedCountChange?.(records.filter((record) => !record.confirmed_by).length);
  }, [onUnconfirmedCountChange, records]);

  const filteredRecords = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return records.filter((record) => {
      if (typeFilter !== 'all' && record.type !== typeFilter) return false;
      if (statusFilter === 'unconfirmed' && record.confirmed_by) return false;
      if (statusFilter === 'confirmed' && !record.confirmed_by) return false;

      if (!isTeacher && teacherFilter !== 'all' && record.teacher_id !== teacherFilter) {
        return false;
      }

      if (startDate) {
        const createdAt = new Date(record.created_at);
        if (createdAt < new Date(format(startDate, 'yyyy-MM-dd'))) return false;
      }

      if (endDate) {
        const createdAt = new Date(record.created_at);
        const inclusiveEnd = new Date(format(endDate, 'yyyy-MM-dd'));
        inclusiveEnd.setHours(23, 59, 59, 999);
        if (createdAt > inclusiveEnd) return false;
      }

      if (!keyword) return true;

      const studentName = record.students?.name?.toLowerCase() ?? '';
      const teacherName = record.teacher_id ? (teacherNameMap[record.teacher_id] ?? '').toLowerCase() : '';

      return [studentName, record.type.toLowerCase(), teacherName].some((value) => value.includes(keyword));
    });
  }, [endDate, isTeacher, records, searchQuery, startDate, statusFilter, teacherFilter, teacherNameMap, typeFilter]);

  const setPending = (record: BaseCrossCheckRecord, value: boolean) => {
    setPendingKeys((prev) => ({ ...prev, [`${record.type}:${record.id}`]: value }));
  };

  const handleConfirm = useCallback(async (record: BaseCrossCheckRecord) => {
    if (!user) return;

    const now = new Date().toISOString();
    const table = getTableName(record.type);
    const key = `${record.type}:${record.id}`;

    setPending(record, true);
    setRecords((prev) => prev.map((item) => (
      item.id === record.id && item.type === record.type
        ? {
            ...item,
            confirmed_by: user.id,
            confirmed_by_name: fullName ?? '확인자',
            confirmed_at: now,
          }
        : item
    )));

    try {
      const { error } = await supabase
        .from(table)
        .update({
          confirmed_by: user.id,
          confirmed_by_name: fullName ?? '확인자',
          confirmed_at: now,
        })
        .eq('id', record.id);

      if (error) throw error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '확인 처리에 실패했습니다.');
      await fetchAllRecords();
    } finally {
      setPendingKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [fetchAllRecords, fullName, user]);

  const handleUnconfirm = useCallback(async (record: BaseCrossCheckRecord) => {
    const table = getTableName(record.type);
    const key = `${record.type}:${record.id}`;

    setPending(record, true);
    setRecords((prev) => prev.map((item) => (
      item.id === record.id && item.type === record.type
        ? {
            ...item,
            confirmed_by: null,
            confirmed_by_name: null,
            confirmed_at: null,
          }
        : item
    )));

    try {
      const { error } = await supabase
        .from(table)
        .update({
          confirmed_by: null,
          confirmed_by_name: null,
          confirmed_at: null,
        })
        .eq('id', record.id);

      if (error) throw error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '확인 취소에 실패했습니다.');
      await fetchAllRecords();
    } finally {
      setPendingKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [fetchAllRecords]);

  const teacherDisplayName = isTeacher
    ? (fullName ?? teachers.find((teacher) => teacher.id === user?.id)?.full_name ?? '담당 선생님')
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-[180px_180px_220px_1fr_170px_170px]">
            <div className="space-y-2">
              <Label>유형</Label>
              <Select value={typeFilter} onValueChange={(value: TypeFilter) => setTypeFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>상태</Label>
              <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>담당선생님</Label>
              {isTeacher ? (
                <Input value={teacherDisplayName ?? ''} disabled />
              ) : (
                <Select value={teacherFilter} onValueChange={setTeacherFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="전체 선생님" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>{teacher.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>검색</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="학생명 또는 선생님명 검색"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>시작일</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !startDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP', { locale: ko }) : '시작일 선택'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>종료일</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP', { locale: ko }) : '종료일 선택'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    disabled={(date) => !!startDate && date < startDate && !sameDay(date, startDate)}
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">날짜</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead className="w-[90px]">학년</TableHead>
                  <TableHead className="w-[110px]">유형</TableHead>
                  <TableHead className="w-[150px]">입력자</TableHead>
                  <TableHead className="w-[220px]">상태</TableHead>
                  <TableHead className="w-[130px] text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center text-sm text-muted-foreground">
                      조건에 맞는 기록이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record) => {
                    const isConfirmed = !!record.confirmed_by;
                    const pending = !!pendingKeys[`${record.type}:${record.id}`];
                    const teacherName = record.teacher_id ? (teacherNameMap[record.teacher_id] ?? '미지정') : '미지정';

                    return (
                      <TableRow key={`${record.type}:${record.id}`}>
                        <TableCell className="text-muted-foreground">{formatDateLabel(record.created_at)}</TableCell>
                        <TableCell className="font-medium">{record.students?.name ?? '-'}</TableCell>
                        <TableCell>{normalizeGrade(record.students?.grade)}</TableCell>
                        <TableCell>
                          <span className="inline-flex rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                            {record.type}
                          </span>
                        </TableCell>
                        <TableCell>{teacherName}</TableCell>
                        <TableCell>
                          {isConfirmed ? (
                            <div className="inline-flex flex-col gap-1 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs text-foreground">
                              <span className="font-medium text-success">확인완료</span>
                              <span className="text-muted-foreground">
                                {record.confirmed_by_name} · {formatDateLabel(record.confirmed_at)}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning">
                              미확인
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isConfirmed ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              disabled={pending}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleUnconfirm(record);
                              }}
                            >
                              {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}
                              취소
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              className="bg-success text-success-foreground hover:bg-success/90"
                              disabled={pending}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleConfirm(record);
                              }}
                            >
                              {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                              확인
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}