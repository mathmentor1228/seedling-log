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
import { Checkbox } from '@/components/ui/checkbox';
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

const SUBJECTS = ['수학', '영어', '국어'];
const SCHOOL_LEVELS = ['초', '중', '고'];
const GRADE_YEARS = [1, 2, 3, 4, 5, 6];

const TEACHERS = [
  { name: '최윤기', room: '4층 2강의실' },
  { name: '조준희', room: '4층 4강의실' },
  { name: '서미정', room: '4층 5강의실' },
  { name: '이나연', room: '3층 6강의실' },
  { name: '정선호', room: '3층 7강의실' },
  { name: '김민희', room: '3층 8강의실' },
  { name: '황은지(원장)', room: '3층 9강의실' },
];

export function NewStudentRegistration({ open, onOpenChange, userName, onCreated }: NewStudentRegistrationProps) {
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [parentPortalUrl, setParentPortalUrl] = useState('');

  // Form fields
  const [studentName, setStudentName] = useState('');
  const [schoolLevel, setSchoolLevel] = useState('중');
  const [gradeYear, setGradeYear] = useState<number>(1);
  const [school, setSchool] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
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
    setSelectedSubjects([]);
    setSelectedAssignees([]);
    setStartDate(undefined);
    setTuitionFee('');
    setClassTime('');
    setStudentPhone('');
    setParentPhone('');
    setNotes('');
    setCreated(false);
    setCopied(false);
    setParentPortalUrl('');
  };

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  const subjectsText = selectedSubjects.join(', ') || '-';
  const assigneeText = selectedAssignees.join(', ') || '-';

  // Build classroom info for the message based on selected assignees
  const getClassroomInfo = () => {
    return selectedAssignees
      .map(name => {
        const t = TEACHERS.find(t => t.name === name);
        return t ? `• ${t.name} 선생님: ${t.room}` : null;
      })
      .filter(Boolean);
  };

  const handleCreate = async () => {
    if (!studentName.trim()) { toast.error('학생 이름을 입력해주세요'); return; }
    if (!startDate) { toast.error('수업 시작일을 선택해주세요'); return; }

    setCreating(true);

    const today = startOfDay(new Date());
    const start = startOfDay(startDate);
    const enrollmentStatus = isAfter(start, today) ? '재원예정' : '재원';

    // Generate parent token
    const { data: tokenData } = await supabase.rpc('generate_parent_token' as any);
    const parentToken = tokenData as string || '';

    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .insert({
        name: studentName.trim(),
        school_level: schoolLevel,
        grade_year: gradeYear,
        grade: `${schoolLevel}${gradeYear}`,
        school: school.trim() || null,
        parent_phone: parentPhone.trim() || null,
        student_phone: studentPhone.trim() || null,
        enrollment_status: enrollmentStatus,
        parent_token: parentToken || null,
        notes: [
          selectedSubjects.length ? `수강과목: ${subjectsText}` : '',
          selectedAssignees.length ? `담당: ${assigneeText}` : '',
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

    // Build parent portal URL
    if (parentToken) {
      const baseUrl = window.location.origin;
      setParentPortalUrl(`${baseUrl}/parent?token=${parentToken}`);
    }

    const description = [
      `학생: ${studentName.trim()}`,
      `학년: ${schoolLevel}${gradeYear}`,
      school ? `학교: ${school}` : '',
      `수강과목: ${subjectsText}`,
      `담당자: ${assigneeText}`,
      `수업시작일: ${format(startDate, 'yyyy-MM-dd')}`,
      tuitionFee ? `수강료: ${tuitionFee}` : '',
      classTime ? `수업시간: ${classTime}` : '',
      parentPhone ? `학부모연락처: ${parentPhone}` : '',
      studentPhone ? `학생연락처: ${studentPhone}` : '',
      `등록상태: ${enrollmentStatus}`,
      notes ? `비고: ${notes}` : '',
    ].filter(Boolean).join('\n');

    await supabase.from('admin_office_tasks').insert({
      category: '신규생 정보',
      title: `[신규] ${studentName.trim()} (${schoolLevel}${gradeYear})`,
      description,
      created_by: user!.id,
      created_by_name: userName,
      assignee_name: assigneeText !== '-' ? assigneeText : null,
    } as any);

    // Create teacher notification requests for the day before start date
    if (selectedAssignees.length > 0) {
      const dayBefore = new Date(startDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const taskDate = format(dayBefore, 'yyyy-MM-dd');

      // Look up teacher profiles by name
      const { data: teacherProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('full_name', selectedAssignees);

      const classroomLines = getClassroomInfo();
      const taskNotes = [
        `📋 신규생 기본정보`,
        `• 이름: ${studentName.trim()}`,
        `• 학교: ${school.trim() || '미입력'}`,
        `• 학년: ${schoolLevel}${gradeYear}`,
        `• 수업시간: ${classTime || '미정'}`,
        classroomLines.length > 0 ? `\n🏫 강의실\n${classroomLines.join('\n')}` : '',
      ].filter(Boolean).join('\n');

      if (teacherProfiles && teacherProfiles.length > 0) {
        const taskInserts = teacherProfiles.map(tp => ({
          title: `[신규생 안내] ${studentName.trim()} (${schoolLevel}${gradeYear}) — ${format(startDate, 'M/d')} 수업 시작`,
          task_type: '공지',
          task_date: taskDate,
          due_date: taskDate,
          assignee: tp.full_name,
          related_teacher_id: tp.id,
          related_student_id: (studentData as any)?.id || null,
          notes: taskNotes,
          status: 'todo',
          priority: 'high',
          created_by: user!.id,
          created_by_role: 'admin',
        }));

        await supabase.from('assistant_tasks').insert(taskInserts as any);
      }
    }

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
    const classroomLines = getClassroomInfo();
    const classroomSection = classroomLines.length > 0
      ? `\n🏫 강의실 안내\n${classroomLines.join('\n')}\n`
      : '';

    const studentPageUrl = `${window.location.origin}/student`;
    const portalSection = parentPortalUrl
      ? `\n📱 수업 관리 페이지\n• 학부모 수업관리: ${parentPortalUrl}\n• 학생 로그인: ${studentPageUrl}\n`
      : `\n📱 학생 로그인: ${studentPageUrl}\n`;

    return `안녕하세요, 학부모님.

${studentName} 학생의 등록이 완료되었습니다.

📋 수업 안내
• 수강 과목: ${subjectsText}
• 담당 선생님: ${assigneeText}
• 수업 시작일: ${startDate ? format(startDate, 'yyyy년 M월 d일 (EEE)', { locale: ko }) : '-'}
• 수업 시간: ${classTime || '-'}
• 수강료: ${tuitionFee || '-'}
${classroomSection}${portalSection}
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

            {/* 수강과목 - 복수선택 */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">수강 과목 (복수선택)</label>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map(s => (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={selectedSubjects.includes(s)}
                      onCheckedChange={() => toggleItem(selectedSubjects, s, setSelectedSubjects)}
                    />
                    <span className="text-sm">{s}</span>
                  </label>
                ))}
              </div>
              {selectedSubjects.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {selectedSubjects.map(s => <Badge key={s} variant="secondary">{s}</Badge>)}
                </div>
              )}
            </div>

            {/* 담당자 - 복수선택 */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">담당자 (복수선택)</label>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {TEACHERS.map(t => (
                  <label key={t.name} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={selectedAssignees.includes(t.name)}
                      onCheckedChange={() => toggleItem(selectedAssignees, t.name, setSelectedAssignees)}
                    />
                    <span className="text-sm">{t.name}</span>
                    <span className="text-xs text-muted-foreground">({t.room})</span>
                  </label>
                ))}
              </div>
              {selectedAssignees.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {selectedAssignees.map(n => {
                    const t = TEACHERS.find(t => t.name === n);
                    return <Badge key={n} variant="outline">{n} · {t?.room}</Badge>;
                  })}
                </div>
              )}
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

            {/* 학생 연락처 */}
            <div>
              <label className="text-sm font-medium text-foreground">학생 연락처</label>
              <Input value={studentPhone} onChange={e => setStudentPhone(e.target.value)} placeholder="010-0000-0000" />
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
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span className="font-medium text-foreground">등록 완료</span>
              </div>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p>{studentName} ({schoolLevel}{gradeYear}) — {school || '학교 미입력'}</p>
                <p>수강과목: {subjectsText} / 담당: {assigneeText}</p>
                <p>시작일: {startDate ? format(startDate, 'yyyy-MM-dd') : '-'}</p>
                <p>등록상태: <Badge variant={isAfter(startOfDay(startDate!), startOfDay(new Date())) ? 'secondary' : 'default'} className="ml-1">
                  {isAfter(startOfDay(startDate!), startOfDay(new Date())) ? '재원예정' : '재원'}
                </Badge></p>
              </div>
            </Card>

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
