import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, CalendarIcon, Users, BookOpen, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { STUDENT_STATUSES, ENROLLMENT_STATUSES } from '@/lib/constants';

interface BulkEditStudentsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStudentIds: string[];
  studentNames: Record<string, string>;
  onUpdated: () => void;
}

interface CoursePolicy {
  id: string;
  course_name: string;
  subject: string;
  grade_target: string;
  monthly_fee: number;
}

interface Teacher {
  id: string;
  full_name: string;
}

// Which fields to apply in bulk
interface BulkFields {
  enrollment_status: boolean;
  registration_date: boolean;
  payment_due_day: boolean;
  sibling_group_id: boolean;
  emergency_contact: boolean;
  tuition_memo: boolean;
  school: boolean;
  school_level: boolean;
  grade_year: boolean;
}

export function BulkEditStudents({ open, onOpenChange, selectedStudentIds, studentNames, onUpdated }: BulkEditStudentsProps) {
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('fields');

  // Toggle which fields to apply
  const [applyFields, setApplyFields] = useState<BulkFields>({
    enrollment_status: false,
    registration_date: false,
    payment_due_day: false,
    sibling_group_id: false,
    emergency_contact: false,
    tuition_memo: false,
    school: false,
    school_level: false,
    grade_year: false,
  });

  // Field values
  const [enrollmentStatus, setEnrollmentStatus] = useState('재학');
  const [registrationDate, setRegistrationDate] = useState<Date | undefined>();
  const [paymentDueDay, setPaymentDueDay] = useState('1');
  const [siblingGroupId, setSiblingGroupId] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [tuitionMemo, setTuitionMemo] = useState('');
  const [school, setSchool] = useState('');
  const [schoolLevel, setSchoolLevel] = useState('중');
  const [gradeYear, setGradeYear] = useState('1');

  // Course assignment
  const [coursePolicies, setCoursePolicies] = useState<CoursePolicy[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [courseStartDate, setCourseStartDate] = useState<Date | undefined>();
  const [courseIsActive, setCourseIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      loadOptions();
    }
  }, [open]);

  const loadOptions = async () => {
    const [cpRes, tRes] = await Promise.all([
      supabase.from('course_policies').select('id, course_name, subject, grade_target, monthly_fee').order('course_name'),
      supabase.from('profiles').select('id, full_name').not('full_name', 'is', null).order('full_name'),
    ]);
    setCoursePolicies((cpRes.data || []) as any);
    setTeachers((tRes.data || []) as any);
  };

  const toggleField = (field: keyof BulkFields) => {
    setApplyFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSaveFields = async () => {
    const activeCount = Object.values(applyFields).filter(Boolean).length;
    if (activeCount === 0) { toast.error('수정할 항목을 선택해주세요'); return; }

    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (applyFields.enrollment_status) payload.enrollment_status = enrollmentStatus;
      if (applyFields.registration_date && registrationDate) payload.registration_date = format(registrationDate, 'yyyy-MM-dd');
      if (applyFields.payment_due_day) payload.payment_due_day = parseInt(paymentDueDay);
      if (applyFields.sibling_group_id) payload.sibling_group_id = siblingGroupId ? parseInt(siblingGroupId) : null;
      if (applyFields.emergency_contact) payload.emergency_contact = emergencyContact.trim() || null;
      if (applyFields.tuition_memo) payload.tuition_memo = tuitionMemo.trim() || null;
      if (applyFields.school) payload.school = school.trim() || null;
      if (applyFields.school_level) payload.school_level = schoolLevel;
      if (applyFields.grade_year) {
        payload.grade_year = parseInt(gradeYear);
        payload.grade = `${applyFields.school_level ? schoolLevel : ''}${gradeYear}`;
      }

      const { error } = await supabase
        .from('students')
        .update(payload)
        .in('id', selectedStudentIds);

      if (error) throw error;
      toast.success(`${selectedStudentIds.length}명 학생 정보 일괄 수정 완료`);
      onUpdated();
    } catch (err) {
      console.error(err);
      toast.error('일괄 수정 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignCourse = async () => {
    if (!selectedCourseId) { toast.error('과정을 선택해주세요'); return; }
    if (!courseStartDate) { toast.error('시작일을 선택해주세요'); return; }

    setSaving(true);
    try {
      const inserts = selectedStudentIds.map(sid => ({
        student_id: sid,
        course_policy_id: selectedCourseId,
        teacher_id: selectedTeacherId || null,
        enrollment_date: format(courseStartDate, 'yyyy-MM-dd'),
        is_active: courseIsActive,
      }));

      const { error } = await supabase.from('student_courses').upsert(inserts as any, { onConflict: 'student_id,course_policy_id' });
      if (error) throw error;

      const cp = coursePolicies.find(c => c.id === selectedCourseId);
      toast.success(`${selectedStudentIds.length}명에게 "${cp?.course_name}" 과정 배정 완료`);
      onUpdated();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || '과정 배정 실패');
    } finally {
      setSaving(false);
    }
  };

  const selectedCourse = coursePolicies.find(c => c.id === selectedCourseId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            일괄 편집 ({selectedStudentIds.length}명 선택)
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1 mb-3">
          {selectedStudentIds.slice(0, 8).map(id => (
            <Badge key={id} variant="secondary" className="text-xs">{studentNames[id]}</Badge>
          ))}
          {selectedStudentIds.length > 8 && (
            <Badge variant="outline" className="text-xs">+{selectedStudentIds.length - 8}명</Badge>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="fields" className="flex-1 gap-1"><Settings className="w-3.5 h-3.5" />기본 정보</TabsTrigger>
            <TabsTrigger value="course" className="flex-1 gap-1"><BookOpen className="w-3.5 h-3.5" />수강 과정</TabsTrigger>
          </TabsList>

          <TabsContent value="fields" className="space-y-3 mt-3">
            {/* Enrollment Status */}
            <FieldRow label="재학상태" checked={applyFields.enrollment_status} onToggle={() => toggleField('enrollment_status')}>
              <Select value={enrollmentStatus} onValueChange={setEnrollmentStatus}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STUDENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>

            {/* Registration Date */}
            <FieldRow label="등록일" checked={applyFields.registration_date} onToggle={() => toggleField('registration_date')}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-8 w-full justify-start text-left text-sm", !registrationDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {registrationDate ? format(registrationDate, 'yyyy-MM-dd') : '날짜 선택'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={registrationDate} onSelect={setRegistrationDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </FieldRow>

            {/* Payment Due Day */}
            <FieldRow label="개별납부일" checked={applyFields.payment_due_day} onToggle={() => toggleField('payment_due_day')}>
              <Select value={paymentDueDay} onValueChange={setPaymentDueDay}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <SelectItem key={d} value={String(d)}>{d}일</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            {/* Sibling Group */}
            <FieldRow label="형제그룹번호" checked={applyFields.sibling_group_id} onToggle={() => toggleField('sibling_group_id')}>
              <Input className="h-8" type="number" value={siblingGroupId} onChange={e => setSiblingGroupId(e.target.value)} placeholder="예: 1" />
            </FieldRow>

            {/* School */}
            <FieldRow label="학교" checked={applyFields.school} onToggle={() => toggleField('school')}>
              <Input className="h-8" value={school} onChange={e => setSchool(e.target.value)} placeholder="OO중학교" />
            </FieldRow>

            {/* School Level */}
            <FieldRow label="학교급" checked={applyFields.school_level} onToggle={() => toggleField('school_level')}>
              <Select value={schoolLevel} onValueChange={setSchoolLevel}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="초">초등</SelectItem>
                  <SelectItem value="중">중등</SelectItem>
                  <SelectItem value="고">고등</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>

            {/* Grade Year */}
            <FieldRow label="학년" checked={applyFields.grade_year} onToggle={() => toggleField('grade_year')}>
              <Select value={gradeYear} onValueChange={setGradeYear}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(schoolLevel === '초' ? [1,2,3,4,5,6] : [1,2,3]).map(g => (
                    <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            {/* Emergency Contact */}
            <FieldRow label="긴급연락처" checked={applyFields.emergency_contact} onToggle={() => toggleField('emergency_contact')}>
              <Input className="h-8" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} placeholder="010-0000-0000" />
            </FieldRow>

            {/* Tuition Memo */}
            <FieldRow label="수업료메모" checked={applyFields.tuition_memo} onToggle={() => toggleField('tuition_memo')}>
              <Textarea value={tuitionMemo} onChange={e => setTuitionMemo(e.target.value)} placeholder="수업료 관련 메모" rows={2} className="text-sm" />
            </FieldRow>

            <Button onClick={handleSaveFields} disabled={saving} className="w-full">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              선택 항목 일괄 적용
            </Button>
          </TabsContent>

          <TabsContent value="course" className="space-y-4 mt-3">
            {/* Course Policy */}
            <div>
              <Label className="text-sm">과정 선택 *</Label>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger><SelectValue placeholder="과정을 선택하세요" /></SelectTrigger>
                <SelectContent>
                  {coursePolicies.map(cp => (
                    <SelectItem key={cp.id} value={cp.id}>
                      {cp.course_name} ({cp.subject} · {cp.grade_target} · {cp.monthly_fee.toLocaleString()}원)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCourse && (
                <div className="flex gap-1.5 mt-1.5">
                  <Badge variant="secondary">{selectedCourse.subject}</Badge>
                  <Badge variant="outline">{selectedCourse.grade_target}</Badge>
                  <Badge variant="outline">{selectedCourse.monthly_fee.toLocaleString()}원/월</Badge>
                </div>
              )}
            </div>

            {/* Teacher */}
            <div>
              <Label className="text-sm">담당 선생님</Label>
              <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                <SelectTrigger><SelectValue placeholder="선택 (선택사항)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">미배정</SelectItem>
                  {teachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div>
              <Label className="text-sm">시작일 *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !courseStartDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {courseStartDate ? format(courseStartDate, 'yyyy년 M월 d일', { locale: ko }) : '날짜 선택'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={courseStartDate} onSelect={setCourseStartDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* Status */}
            <div>
              <Label className="text-sm">수강상태</Label>
              <Select value={courseStatus} onValueChange={setCourseStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENROLLMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleAssignCourse} disabled={saving} className="w-full">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {selectedStudentIds.length}명에게 과정 배정
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ label, checked, onToggle, children }: { label: string; checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-3 p-2 rounded-md border transition-colors", checked ? "border-primary/30 bg-primary/5" : "border-transparent")}>
      <div className="pt-1">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
      </div>
      <div className="flex-1 space-y-1">
        <Label className={cn("text-sm cursor-pointer", !checked && "text-muted-foreground")} onClick={onToggle}>{label}</Label>
        <div className={cn(!checked && "opacity-50 pointer-events-none")}>{children}</div>
      </div>
    </div>
  );
}
