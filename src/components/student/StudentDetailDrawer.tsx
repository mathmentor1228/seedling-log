import { useEffect, useRef, forwardRef } from 'react';
import { format } from 'date-fns';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ChevronUp, ChevronDown, Edit2, Trash2, Link2, AlertCircle,
  BookOpen, Calendar, Users as UsersIcon, Phone, GraduationCap, X, Key,
} from 'lucide-react';
import StudentSlotAssignment from '@/components/StudentSlotAssignment';
import StudentSubjectTeacherMapping from '@/components/StudentSubjectTeacherMapping';
import StudentPinManager from '@/components/StudentPinManager';
import { StudentCoursesTuitionTab } from '@/components/tuition/StudentCoursesTuitionTab';
import { isAdmin, isTeacher, type AppRole } from '@/lib/auth';

interface StudentLite {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  grade: string | null;
  school_level: string | null;
  grade_year: number | null;
  enrollment_status: string;
  notes: string | null;
  school: string | null;
  parent_phone: string | null;
  parent_name?: string | null;
  student_phone: string | null;
  student_code: string | null;
  payment_due_day?: number | null;
  created_at: string;
  [key: string]: any;
}

interface FlagShape {
  noSlot: boolean; noTeacher: boolean; noCourse: boolean; isNew: boolean; unvisited: boolean;
  subjects: string[]; slotCount: number;
}

interface Props {
  student: StudentLite | null;
  students: StudentLite[];
  flag?: FlagShape;
  defaultTab: string;
  flashSection: string | null;
  role: AppRole | null | undefined;
  onClose: () => void;
  onNavigate: (s: StudentLite) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyParentLink: () => void;
}

export function StudentDetailDrawer({
  student, students, flag, defaultTab, flashSection, role,
  onClose, onNavigate, onEdit, onDelete, onCopyParentLink,
}: Props) {
  const infoRef = useRef<HTMLDivElement>(null);
  const coursesRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  const teachersRef = useRef<HTMLDivElement>(null);

  const refs: Record<string, React.RefObject<HTMLDivElement>> = {
    info: infoRef, courses: coursesRef, slots: slotsRef, teachers: teachersRef,
  };

  useEffect(() => {
    if (!flashSection) return;
    const r = refs[flashSection];
    if (r?.current) {
      r.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [flashSection, student?.id]);

  if (!student) return null;

  const idx = students.findIndex((s) => s.id === student.id);
  const prev = idx > 0 ? students[idx - 1] : null;
  const next = idx >= 0 && idx < students.length - 1 ? students[idx + 1] : null;

  const subjects = flag?.subjects || [];
  const slotCount = flag?.slotCount ?? 0;
  const teacherCount = subjects.filter((s) => ['수학', '영어'].includes(s)).length;

  const issues: { key: string; label: string; section: string }[] = [];
  if (flag?.noCourse) issues.push({ key: 'no-course', label: '미수강', section: 'courses' });
  if (flag?.noSlot) issues.push({ key: 'no-slot', label: '시간표 미배정', section: 'slots' });
  if (flag?.noTeacher) issues.push({ key: 'no-teacher', label: '담당 미지정', section: 'teachers' });
  if (flag?.unvisited) issues.push({ key: 'unvisited', label: '학부모 미열람', section: 'info' });

  function scrollTo(section: string) {
    refs[section]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const subjectColor: Record<string, string> = {
    '수학': 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    '영어': 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    '국어': 'bg-rose-500/15 text-rose-500 border-rose-500/30',
    '과학': 'bg-purple-500/15 text-purple-500 border-purple-500/30',
  };

  const statusBadgeClass =
    student.enrollment_status === '퇴원' ? 'text-muted-foreground border-muted-foreground/30'
      : student.enrollment_status === '휴학' ? 'bg-warn/15 text-warn border-warn/30'
      : student.enrollment_status === '재등원' ? 'bg-info/15 text-info border-info/30'
      : '';

  return (
    <Sheet open={!!student} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden"
      >
        {/* Sticky header */}
        <div className="border-b border-border bg-card/95 backdrop-blur px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold shrink-0">
              {student.name.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground truncate">{student.name}</h2>
                <Badge variant="outline" className={statusBadgeClass}>
                  {student.enrollment_status || '재학'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1"><GraduationCap className="w-3 h-3" />{student.school || '-'} · {student.school_level && student.grade_year ? `${student.school_level}${student.grade_year}` : (student.grade || '-')}</span>
                <span className="text-border">|</span>
                <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{student.student_phone || student.phone || '-'}</span>
              </p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!prev} onClick={() => prev && onNavigate(prev)} title="이전 학생">
                <ChevronUp className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!next} onClick={() => next && onNavigate(next)} title="다음 학생">
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <QuickStat icon={<BookOpen className="w-3.5 h-3.5" />} label="수강 과목" value={`${subjects.length}개`} />
            <QuickStat icon={<Calendar className="w-3.5 h-3.5" />} label="배정 슬롯" value={`${slotCount}회`} tone={slotCount === 0 ? 'danger' : undefined} />
            <QuickStat icon={<UsersIcon className="w-3.5 h-3.5" />} label="담당 선생님" value={`${teacherCount}명`} />
          </div>
        </div>

        {/* Tabs */}
        <Tabs key={student.id} defaultValue={defaultTab === 'pin-manager' ? 'app' : 'overview'} className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-3 shrink-0">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="overview">개요</TabsTrigger>
              <TabsTrigger value="app"><Key className="w-3.5 h-3.5 mr-1" />앱 접근</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="flex-1 overflow-y-auto px-5 pb-24 mt-0 data-[state=inactive]:hidden">
            {/* Issue banner */}
            {issues.length > 0 && (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-destructive text-xs font-semibold mb-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  처리 필요 ({issues.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {issues.map((i) => (
                    <button
                      key={i.key}
                      onClick={() => scrollTo(i.section)}
                      className="text-[11px] px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/15 border border-destructive/20 transition-colors"
                    >
                      {i.label} →
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Basic info */}
            <Section ref={infoRef} title="기본 정보" flash={flashSection === 'info'}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="학생 연락처" value={student.student_phone || '-'} />
                <Field label="학부모 연락처" value={student.parent_phone || '-'} />
                <Field label="학부모 성함" value={(student as any).parent_name || '-'} />
                <Field label="이메일" value={student.email || '-'} />
                <Field label="학교" value={student.school || '-'} />
                <Field label="학년" value={student.school_level && student.grade_year ? `${student.school_level}${student.grade_year}` : (student.grade || '-')} />
                <Field label="등록일" value={format(new Date(student.created_at), 'yyyy-MM-dd')} />
                <Field label="학생번호" value={student.student_code || '-'} />
                <div className="col-span-2">
                  <Label className="text-[11px] text-muted-foreground">메모</Label>
                  <p className="text-sm mt-1">{student.notes || '-'}</p>
                </div>
              </div>
              {isAdmin(role) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={onCopyParentLink}
                >
                  <Link2 className="w-3.5 h-3.5 mr-2" />
                  학부모 포털 링크 복사
                </Button>
              )}
            </Section>

            {/* Courses */}
            {isAdmin(role) && (
              <Section ref={coursesRef} title="수강 과정" flash={flashSection === 'courses'} subjects={subjects} subjectColor={subjectColor}>
                <StudentCoursesTuitionTab studentId={student.id} studentName={student.name} />
              </Section>
            )}

            {/* Slots */}
            {(isAdmin(role) || isTeacher(role)) && (
              <Section ref={slotsRef} title="배정된 슬롯" flash={flashSection === 'slots'}>
                <StudentSlotAssignment studentId={student.id} studentName={student.name} readOnly={!isAdmin(role)} />
              </Section>
            )}

            {/* Subject teachers */}
            {isAdmin(role) && (
              <Section ref={teachersRef} title="과목별 담당 선생님" flash={flashSection === 'teachers'}>
                <StudentSubjectTeacherMapping studentId={student.id} studentName={student.name} />
              </Section>
            )}
          </TabsContent>

          <TabsContent value="app" className="flex-1 overflow-y-auto px-5 pb-24 mt-0 data-[state=inactive]:hidden">
            <div className="mt-4">
              {isAdmin(role) ? (
                <StudentPinManager studentId={student.id} studentName={student.name} studentCode={student.student_code} />
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">권한이 없습니다.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Sticky footer */}
        <div className="absolute bottom-0 inset-x-0 border-t border-border bg-card/95 backdrop-blur px-5 py-3 flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground truncate">
            ID: <span className="font-mono">{student.student_code || student.id.slice(0, 8)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin(role) && (
              <>
                <Button variant="outline" size="sm" onClick={onCopyParentLink}>
                  <Link2 className="w-3.5 h-3.5 mr-1.5" />
                  학부모 링크
                </Button>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                  편집
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} title="삭제">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QuickStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'danger' }) {
  return (
    <div className={cn(
      'rounded-lg border bg-muted/30 px-3 py-2',
      tone === 'danger' ? 'border-destructive/30 bg-destructive/5' : 'border-border'
    )}>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
        {icon}{label}
      </div>
      <div className={cn('text-base font-bold mt-0.5', tone === 'danger' && 'text-destructive')}>{value}</div>
    </div>
  );
}

const Section = forwardRef<
  HTMLDivElement,
  { title: string; children: React.ReactNode; flash?: boolean; subjects?: string[]; subjectColor?: Record<string, string> }
>(({ title, children, flash, subjects, subjectColor }, ref) => (
  <div
    ref={ref}
    className={cn(
      'mt-4 rounded-xl border border-border bg-card p-4 shadow-card transition-all',
      flash && 'ring-2 ring-primary bg-primary/5'
    )}
  >
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {subjects && subjects.length > 0 && (
        <div className="flex gap-1">
          {subjects.map((s) => (
            <span key={s} className={cn('text-[10px] px-1.5 py-0.5 rounded border', subjectColor?.[s] || 'bg-muted text-muted-foreground border-border')}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
    {children}
  </div>
));
Section.displayName = 'Section';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <p className="font-medium text-foreground text-sm truncate">{value}</p>
    </div>
  );
}
