import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, CalendarIcon, Copy, CheckCircle2, UserPlus } from 'lucide-react';
import { format, isAfter, startOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface NewStudentRegistrationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  onCreated: () => void;
}

const SUBJECTS = ['수학', '영어', '국어', '수학+영어', '수학+국어', '영어+국어', '수학+영어+국어'];
const SCHOOL_LEVELS = ['초', '중', '고'];
const GRADE_YEARS = [1, 2, 3, 4, 5, 6];

export function NewStudentRegistration({ open, onOpenChange, userName, onCreated }: NewStudentRegistrationProps) {
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form fields
  const [studentName, setStudentName] = useState('');
  const [schoolLevel, setSchoolLevel] = useState('중');
  const [gradeYear, setGradeYear] = useState<number>(1);
  const [school, setSchool] = useState('');
  const [subjects, setSubjects] = useState('');
  const [assignee, setAssignee] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [tuitionFee, setTuitionFee] = useState('');
  const [classTime, setClassTime] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setStudentName('');
    setSchoolLevel('중');
    setGradeYear(1);
    setSchool('');
    setSubjects('');
    setAssignee('');
    setStartDate(undefined);
    setTuitionFee('');
    setClassTime('');
    setStudentPhone('');
    setParentPhone('');
    setNotes('');
    setCreated(false);
    setCopied(false);
  };

  const handleCreate = async () => {
    if (!studentName.trim()) { toast.error('학생 이름을 입력해주세요'); return; }
    if (!startDate) { toast.error('수업 시작일을 선택해주세요'); return; }

    setCreating(true);

    const today = startOfDay(new Date());
    const start = startOfDay(startDate);
    const enrollmentStatus = isAfter(start, today) ? '재원예정' : '재원';

    // 1) Create student record
    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .insert({
        name: studentName.trim(),
        school_level: schoolLevel,
        grade_year: gradeYear,
        grade: `${schoolLevel}${gradeYear}`,
        school: school.trim() || null,
        parent_phone: parentPhone.trim() || null,
        enrollment_status: enrollmentStatus,
        notes: [
          subjects ? `수강과목: ${subjects}` : '',
          tuitionFee ? `수강료: ${tuitionFee}` : '',
          classTime ? `수업시간: ${classTime}` : '',
          notes ? notes : '',
        ].filter(Boolean).join('\n'),
      } as any)
      .select('id')
      .single();

    if (studentError) {
      toast.error('학생 등록 실패');
      console.error(studentError);
      setCreating(false);
      return;
    }

    // 2) Create admin office task
    const description = [
      `학생: ${studentName.trim()}`,
      `학년: ${schoolLevel}${gradeYear}`,
      school ? `학교: ${school}` : '',
      `수강과목: ${subjects}`,
      `수업시작일: ${format(startDate, 'yyyy-MM-dd')}`,
      tuitionFee ? `수강료: ${tuitionFee}` : '',
      classTime ? `수업시간: ${classTime}` : '',
      parentPhone ? `학부모연락처: ${parentPhone}` : '',
      `등록상태: ${enrollmentStatus}`,
      notes ? `비고: ${notes}` : '',
    ].filter(Boolean).join('\n');

    await supabase.from('admin_office_tasks').insert({
      category: '신규생 정보',
      title: `[신규] ${studentName.trim()} (${schoolLevel}${gradeYear})`,
      description,
      created_by: user!.id,
      created_by_name: userName,
      assignee_name: assignee.trim() || null,
    } as any);

    toast.success(
      enrollmentStatus === '재원예정'
        ? `${studentName} 학생이 '재원예정'으로 등록되었습니다`
        : `${studentName} 학생이 '재원'으로 등록되었습니다`
    );

    setCreated(true);
    setCreating(false);
    onCreated();
  };

  const generateMessage = () => {
    return `안녕하세요, 학부모님.

${studentName} 학생의 등록이 완료되었습니다.

📋 수업 안내
• 수강 과목: ${subjects || '-'}
• 수업 시작일: ${startDate ? format(startDate, 'yyyy년 M월 d일 (EEE)', { locale: ko }) : '-'}
• 수업 시간: ${classTime || '-'}
• 수강료: ${tuitionFee || '-'}

준비물 및 기타 안내사항은 첫 수업 시 안내드리겠습니다.
감사합니다.`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateMessage());
      setCopied(true);
      toast.success('문자 내용이 복사되었습니다');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('복사에 실패했습니다');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            신규생 등록
          </DialogTitle>
        </DialogHeader>

        {!created ? (
          <div className="space-y-4 mt-2">
            {/* 학생 이름 */}
            <div>
              <label className="text-sm font-medium text-foreground">학생 이름 *</label>
              <Input value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="홍길동" />
            </div>

            {/* 학년 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">학교급</label>
                <Select value={schoolLevel} onValueChange={setSchoolLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHOOL_LEVELS.map(l => <SelectItem key={l} value={l}>{l}등학교</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">학년</label>
                <Select value={String(gradeYear)} onValueChange={v => setGradeYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(schoolLevel === '초' ? GRADE_YEARS : GRADE_YEARS.slice(0, 3)).map(g =>
                      <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 학교 */}
            <div>
              <label className="text-sm font-medium text-foreground">학교</label>
              <Input value={school} onChange={e => setSchool(e.target.value)} placeholder="OO중학교" />
            </div>

            {/* 수강과목 */}
            <div>
              <label className="text-sm font-medium text-foreground">수강 과목</label>
              <Select value={subjects} onValueChange={setSubjects}>
                <SelectTrigger><SelectValue placeholder="과목 선택" /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* 담당자 */}
            <div>
              <label className="text-sm font-medium text-foreground">담당자</label>
              <Input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="담당자 이름" />
            </div>

            {/* 수업시작일 */}
            <div>
              <label className="text-sm font-medium text-foreground">수업 시작일 *</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'yyyy년 M월 d일 (EEE)', { locale: ko }) : '날짜 선택'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {startDate && (
                <Badge variant={isAfter(startOfDay(startDate), startOfDay(new Date())) ? 'secondary' : 'default'} className="mt-1.5">
                  {isAfter(startOfDay(startDate), startOfDay(new Date())) ? '재원예정' : '재원'}
                </Badge>
              )}
            </div>

            {/* 수강료 */}
            <div>
              <label className="text-sm font-medium text-foreground">수강료</label>
              <Input value={tuitionFee} onChange={e => setTuitionFee(e.target.value)} placeholder="예: 월 30만원" />
            </div>

            {/* 수업시간 */}
            <div>
              <label className="text-sm font-medium text-foreground">수업 시간</label>
              <Input value={classTime} onChange={e => setClassTime(e.target.value)} placeholder="예: 월수금 16:00~18:00" />
            </div>

            {/* 학부모 연락처 */}
            <div>
              <label className="text-sm font-medium text-foreground">학부모 연락처</label>
              <Input value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="010-0000-0000" />
            </div>

            {/* 비고 */}
            <div>
              <label className="text-sm font-medium text-foreground">비고</label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="특이사항 메모" rows={2} />
            </div>

            <Button onClick={handleCreate} disabled={creating} className="w-full">
              {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              신규생 등록
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Success */}
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span className="font-medium text-foreground">등록 완료</span>
              </div>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p>{studentName} ({schoolLevel}{gradeYear}) — {school || '학교 미입력'}</p>
                <p>수강과목: {subjects || '-'} / 시작일: {startDate ? format(startDate, 'yyyy-MM-dd') : '-'}</p>
                <p>등록상태: <Badge variant={isAfter(startOfDay(startDate!), startOfDay(new Date())) ? 'secondary' : 'default'} className="ml-1">
                  {isAfter(startOfDay(startDate!), startOfDay(new Date())) ? '재원예정' : '재원'}
                </Badge></p>
              </div>
            </Card>

            {/* Registration message */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">📩 등록 안내 문자</label>
              <Card className="p-3 bg-muted/30">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                  {generateMessage()}
                </pre>
              </Card>
              <Button onClick={handleCopy} variant="outline" className="w-full mt-2 gap-1.5">
                {copied ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                {copied ? '복사됨!' : '문자 내용 복사'}
              </Button>
            </div>

            <Button onClick={() => { resetForm(); onOpenChange(false); }} variant="ghost" className="w-full">
              닫기
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
