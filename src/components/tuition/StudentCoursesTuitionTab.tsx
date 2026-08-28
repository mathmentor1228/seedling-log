import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, Trash2, CalendarIcon, BookOpen, Receipt, Loader2, Users, Percent, Pencil, UserCog, History } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Props {
  studentId: string;
  studentName: string;
}

interface CoursePolicy {
  id: string;
  course_name: string;
  subject: string;
  grade_target: string;
  monthly_fee: number;
}

const MULTI_SUBJECT_DISCOUNT: Record<number, number> = {
  1: 0,
  2: 50000,
  3: 80000,
  4: 100000,
};
const SIBLING_DISCOUNT = 10000;

export function StudentCoursesTuitionTab({ studentId, studentName }: Props) {
  const [courses, setCourses] = useState<any[]>([]);
  const [billings, setBillings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [coursePolicies, setCoursePolicies] = useState<CoursePolicy[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [siblingCount, setSiblingCount] = useState(0);

  const [showAddCourse, setShowAddCourse] = useState(false);
  const [saving, setSaving] = useState(false);

  // 수강료 직접지정(custom_monthly_fee) 편집용 state
  const [feeEditCourse, setFeeEditCourse] = useState<any | null>(null);
  const [feeEditValue, setFeeEditValue] = useState('');
  const [feeSaving, setFeeSaving] = useState(false);

  // 담당 선생님 변경(정산 기준일 포함) state
  const [teacherChanges, setTeacherChanges] = useState<any[]>([]);
  const [changeCourse, setChangeCourse] = useState<any | null>(null);
  const [changeTeacherId, setChangeTeacherId] = useState('');
  const [changeDate, setChangeDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [changeReason, setChangeReason] = useState('');
  const [changeSaving, setChangeSaving] = useState(false);

  // Quick-add state
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [enrollDate, setEnrollDate] = useState<Date>(new Date());
  const [showCustomDate, setShowCustomDate] = useState(false);

  const [view, setView] = useState<'courses' | 'billing'>('courses');

  useEffect(() => { loadAll(); }, [studentId]);

  const loadAll = async () => {
    setLoading(true);
    const [coursesRes, billingsRes, paymentsRes, policiesRes, teachersRes, studentRes, changesRes] = await Promise.all([
      supabase.from('student_courses')
        .select('*, custom_monthly_fee, course_policies(course_name, subject, grade_target, monthly_fee)')
        .eq('student_id', studentId)
        .order('is_active', { ascending: false }),
      supabase.from('billing_schedules')
        .select('*')
        .eq('student_id', studentId)
        .order('billing_month', { ascending: false })
        .limit(12),
      supabase.from('payment_records')
        .select('*')
        .eq('student_id', studentId)
        .order('paid_date', { ascending: false })
        .limit(20),
      supabase.from('course_policies')
        .select('id, course_name, subject, grade_target, monthly_fee')
        .order('subject, grade_target'),
      supabase.from('profiles')
        .select('id, full_name')
        .not('full_name', 'is', null)
        .order('full_name'),
      supabase.from('students')
        .select('sibling_group_id')
        .eq('id', studentId)
        .single(),
      supabase.from('student_course_teacher_changes')
        .select('*')
        .eq('student_id', studentId)
        .order('effective_date', { ascending: false }),
    ]);

    setTeacherChanges((changesRes.data || []) as any);

    setCourses((coursesRes.data || []) as any);
    setBillings((billingsRes.data || []) as any);
    setPayments((paymentsRes.data || []) as any);
    setCoursePolicies((policiesRes.data || []) as CoursePolicy[]);
    setTeachers((teachersRes.data || []) as any);

    // Check sibling count
    const sibGroupId = (studentRes.data as any)?.sibling_group_id;
    if (sibGroupId) {
      const { count } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('sibling_group_id', sibGroupId)
        .neq('enrollment_status', '퇴원');
      setSiblingCount(count && count > 1 ? count : 0);
    } else {
      setSiblingCount(0);
    }

    setLoading(false);
  };

  // Group policies by subject
  const policiesBySubject = useMemo(() => {
    const map: Record<string, CoursePolicy[]> = {};
    coursePolicies.forEach(cp => {
      if (!map[cp.subject]) map[cp.subject] = [];
      map[cp.subject].push(cp);
    });
    return map;
  }, [coursePolicies]);

  // Discount calculation
  const activeCourses = courses.filter(c => c.is_active);
  const uniqueSubjects = new Set(activeCourses.map(c => (c as any).course_policies?.subject).filter(Boolean));
  const subjectCount = uniqueSubjects.size;
  const multiSubjectDiscount = MULTI_SUBJECT_DISCOUNT[Math.min(subjectCount, 4)] || (subjectCount > 4 ? 100000 : 0);
  const siblingDiscount = siblingCount > 1 ? SIBLING_DISCOUNT : 0;

  // custom_monthly_fee가 있으면 그 값을 우선 사용 (학생별 다과목/형제할인 반영된 실제 금액)
  const courseFee = (c: any): number => {
    const custom = c.custom_monthly_fee;
    if (custom != null) return Number(custom);
    return Number(c.course_policies?.monthly_fee || 0);
  };
  const hasAnyCustomFee = activeCourses.some(c => (c as any).custom_monthly_fee != null);
  const monthlyGross = activeCourses.reduce((sum, c) => sum + courseFee(c), 0);
  // custom 금액은 이미 할인 반영된 값이므로 추가 할인 적용하지 않음
  const totalDiscount = hasAnyCustomFee ? 0 : (multiSubjectDiscount + siblingDiscount);
  const monthlyNet = Math.max(0, monthlyGross - totalDiscount);

  const unpaidCount = billings.filter(b => b.status === 'pending' || b.status === 'overdue').length;

  const handleAddCourse = async () => {
    if (!selectedPolicyId) { toast.error('과정을 선택해주세요'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('student_courses').insert({
        student_id: studentId,
        course_policy_id: selectedPolicyId,
        teacher_id: selectedTeacherId || null,
        enrollment_date: format(enrollDate, 'yyyy-MM-dd'),
        is_active: true,
      } as any);
      if (error) throw error;
      toast.success('수강과정 추가 완료');
      setSelectedPolicyId('');
      setSelectedTeacherId('');
      loadAll();
    } catch (err: any) {
      toast.error(err.message || '추가 실패');
    } finally {
      setSaving(false);
    }
  };

  const toggleCourseActive = async (courseId: string, currentActive: boolean) => {
    const { error } = await supabase.from('student_courses').update({ is_active: !currentActive } as any).eq('id', courseId);
    if (error) { toast.error('변경 실패'); return; }
    toast.success(currentActive ? '수강 종료' : '수강 재개');
    loadAll();
  };

  const deleteCourse = async (courseId: string) => {
    if (!confirm('이 수강과정을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('student_courses').delete().eq('id', courseId);
    if (error) { toast.error('삭제 실패'); return; }
    toast.success('삭제 완료');
    loadAll();
  };

  const openTeacherChange = (c: any) => {
    setChangeCourse(c);
    setChangeTeacherId('');
    setChangeDate(format(new Date(), 'yyyy-MM-dd'));
    setChangeReason('');
  };

  const saveTeacherChange = async () => {
    if (!changeCourse) return;
    if (!changeTeacherId) { toast.error('새 담당 선생님을 선택해주세요'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(changeDate)) { toast.error('적용 시작일을 올바르게 입력해주세요'); return; }
    if (changeTeacherId === changeCourse.teacher_id) { toast.error('현재 담당 선생님과 동일합니다'); return; }

    setChangeSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const fromName = teachers.find(t => t.id === changeCourse.teacher_id)?.full_name || null;
      const toName = teachers.find(t => t.id === changeTeacherId)?.full_name || null;

      const { error: histErr } = await supabase.from('student_course_teacher_changes').insert({
        student_id: studentId,
        student_course_id: changeCourse.id,
        subject: (changeCourse as any).course_policies?.subject || null,
        from_teacher_id: changeCourse.teacher_id || null,
        to_teacher_id: changeTeacherId,
        from_teacher_name: fromName,
        to_teacher_name: toName,
        effective_date: changeDate,
        reason: changeReason.trim() || null,
        changed_by: userRes?.user?.id || null,
      } as any);
      if (histErr) throw histErr;

      const { error: updErr } = await supabase
        .from('student_courses')
        .update({ teacher_id: changeTeacherId } as any)
        .eq('id', changeCourse.id);
      if (updErr) throw updErr;

      toast.success(`${changeDate}부터 ${toName} 선생님으로 정산 기준 변경`);
      setChangeCourse(null);
      loadAll();
    } catch (err: any) {
      toast.error(err.message || '담당 변경 실패');
    } finally {
      setChangeSaving(false);
    }
  };

  const openFeeEdit = (c: any) => {
    setFeeEditCourse(c);
    setFeeEditValue(c.custom_monthly_fee != null ? String(c.custom_monthly_fee) : '');
  };

  const saveCustomFee = async () => {
    if (!feeEditCourse) return;
    const trimmed = feeEditValue.trim();
    const newVal = trimmed === '' ? null : Number(trimmed);
    if (newVal != null && (Number.isNaN(newVal) || newVal < 0)) {
      toast.error('올바른 금액을 입력해주세요');
      return;
    }
    setFeeSaving(true);
    const { error } = await supabase
      .from('student_courses')
      .update({ custom_monthly_fee: newVal } as any)
      .eq('id', feeEditCourse.id);
    setFeeSaving(false);
    if (error) { toast.error('수강료 수정 실패'); return; }
    toast.success(newVal == null ? '직접지정 해제 완료 (정책 금액 사용)' : '수강료 수정 완료');
    setFeeEditCourse(null);
    loadAll();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">수강과정</p>
          <p className="text-lg font-bold">{activeCourses.length}개</p>
          <p className="text-[10px] text-muted-foreground">{subjectCount}과목</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">월 수강료</p>
          <p className="text-lg font-bold">{monthlyNet.toLocaleString()}원</p>
          {totalDiscount > 0 && (
            <p className="text-[10px] text-green-600">-{totalDiscount.toLocaleString()}원 할인</p>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Percent className="w-3 h-3" />할인 내역</p>
          <div className="text-xs mt-0.5 space-y-0.5">
            {hasAnyCustomFee ? (
              <p className="text-blue-600">직접지정 금액 사용</p>
            ) : (
              <>
                {multiSubjectDiscount > 0 && <p className="text-green-600">{subjectCount}과목: -{multiSubjectDiscount.toLocaleString()}</p>}
                {siblingDiscount > 0 && <p className="text-green-600 flex items-center gap-0.5"><Users className="w-3 h-3" />형제: -{siblingDiscount.toLocaleString()}</p>}
                {totalDiscount === 0 && <p className="text-muted-foreground">없음</p>}
              </>
            )}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">미납</p>
          <p className={cn("text-lg font-bold", unpaidCount > 0 ? "text-destructive" : "")}>{unpaidCount}건</p>
        </CardContent></Card>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        <Button size="sm" variant={view === 'courses' ? 'default' : 'outline'} onClick={() => setView('courses')} className="gap-1">
          <BookOpen className="w-3.5 h-3.5" />수강과정
        </Button>
        <Button size="sm" variant={view === 'billing' ? 'default' : 'outline'} onClick={() => setView('billing')} className="gap-1">
          <Receipt className="w-3.5 h-3.5" />납부이력
        </Button>
      </div>

      {view === 'courses' && (
        <>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddCourse(true)} className="gap-1">
              <Plus className="w-3.5 h-3.5" />과정 추가
            </Button>
          </div>

          {courses.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">등록된 수강과정이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {courses.map(c => {
                const cp = (c as any).course_policies;
                const customFee = (c as any).custom_monthly_fee;
                const policyFee = Number(cp?.monthly_fee || 0);
                const effectiveFee = customFee != null ? Number(customFee) : policyFee;
                return (
                  <Card key={c.id} className={cn(!c.is_active && "opacity-60")}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{cp?.course_name || '과정'}</span>
                            <Badge variant={c.is_active ? 'default' : 'secondary'} className="text-[10px]">
                              {c.is_active ? '수강중' : '종료'}
                            </Badge>
                            {customFee != null && (
                              <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-600">
                                직접지정
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{cp?.subject}</span><span>·</span>
                            <span>{cp?.grade_target}</span><span>·</span>
                            <span className={cn(customFee != null && "font-semibold text-blue-600")}>
                              {effectiveFee.toLocaleString()}원/월
                            </span>
                            {customFee != null && policyFee > 0 && (
                              <span className="line-through opacity-60">
                                정책 {policyFee.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            시작: {c.enrollment_date}
                            {c.end_date && ` → 종료: ${c.end_date}`}
                          </div>
                          <div className="text-xs mt-0.5 flex items-center gap-1">
                            <UserCog className="w-3 h-3 text-muted-foreground" />
                            <span className="text-muted-foreground">담당:</span>
                            <span className="font-medium">
                              {teachers.find(t => t.id === c.teacher_id)?.full_name || '미배정'}
                            </span>
                          </div>
                          {teacherChanges.filter(h => h.student_course_id === c.id).length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {teacherChanges.filter(h => h.student_course_id === c.id).map(h => (
                                <div key={h.id} className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <History className="w-3 h-3" />
                                  <span>{h.effective_date}부터</span>
                                  <span>{h.from_teacher_name || '미배정'} → <span className="font-medium text-foreground">{h.to_teacher_name || '미배정'}</span></span>
                                  {h.reason && <span className="opacity-70">· {h.reason}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => openTeacherChange(c)}
                            title="담당 선생님 변경">
                            <UserCog className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => openFeeEdit(c)}
                            title="수강료 직접지정">
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => toggleCourseActive(c.id, c.is_active)}>
                            {c.is_active ? '종료' : '재개'}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive"
                            onClick={() => deleteCourse(c.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === 'billing' && (
        <BillingView billings={billings} payments={payments} />
      )}

      {/* Add course sheet - button-based UI */}
      <Sheet open={showAddCourse} onOpenChange={setShowAddCourse}>
        <SheetContent side="right" className="w-[380px] sm:w-[440px] overflow-y-auto">
          <SheetHeader><SheetTitle>수강과정 추가 — {studentName}</SheetTitle></SheetHeader>
          <div className="space-y-5 mt-4">
            {/* Step 1: Pick course by subject buttons */}
            <div>
              <Label className="text-sm font-semibold">① 과정 선택</Label>
              <div className="mt-2 space-y-3">
                {Object.entries(policiesBySubject).map(([subject, policies]) => (
                  <div key={subject}>
                    <p className="text-xs text-muted-foreground mb-1.5">{subject}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {policies.map(cp => (
                        <Button
                          key={cp.id}
                          size="sm"
                          variant={selectedPolicyId === cp.id ? 'default' : 'outline'}
                          className={cn("h-8 text-xs", selectedPolicyId === cp.id && "ring-2 ring-primary")}
                          onClick={() => setSelectedPolicyId(cp.id)}
                        >
                          {cp.course_name}
                          <span className="ml-1 opacity-60">{(cp.monthly_fee / 10000).toFixed(0)}만</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2: Pick teacher by buttons */}
            <div>
              <Label className="text-sm font-semibold">② 담당 선생님</Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Button
                  size="sm"
                  variant={!selectedTeacherId ? 'default' : 'outline'}
                  className="h-8 text-xs"
                  onClick={() => setSelectedTeacherId('')}
                >
                  미배정
                </Button>
                {teachers.map(t => (
                  <Button
                    key={t.id}
                    size="sm"
                    variant={selectedTeacherId === t.id ? 'default' : 'outline'}
                    className={cn("h-8 text-xs", selectedTeacherId === t.id && "ring-2 ring-primary")}
                    onClick={() => setSelectedTeacherId(t.id)}
                  >
                    {t.full_name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Step 3: Enrollment date */}
            <div>
              <Label className="text-sm font-semibold">③ 수업 시작일</Label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  readOnly
                  value={format(enrollDate, 'yyyy-MM-dd')}
                  className="h-8 text-sm w-[140px]"
                />
                {!showCustomDate && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowCustomDate(true)}>
                    <CalendarIcon className="w-3.5 h-3.5 mr-1" />날짜 변경
                  </Button>
                )}
              </div>
              {showCustomDate && (
                <div className="mt-2">
                  <Calendar
                    mode="single"
                    selected={enrollDate}
                    onSelect={d => { if (d) setEnrollDate(d); setShowCustomDate(false); }}
                    className="rounded-md border pointer-events-auto"
                  />
                </div>
              )}
            </div>

            {/* Preview */}
            {selectedPolicyId && (
              <Card className="bg-muted/50">
                <CardContent className="p-3 text-sm">
                  <p className="font-medium">
                    {coursePolicies.find(cp => cp.id === selectedPolicyId)?.course_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(Number(coursePolicies.find(cp => cp.id === selectedPolicyId)?.monthly_fee || 0)).toLocaleString()}원/월
                    · {format(enrollDate, 'yyyy-MM-dd')} 시작
                    {selectedTeacherId ? ` · ${teachers.find(t => t.id === selectedTeacherId)?.full_name}` : ''}
                  </p>
                </CardContent>
              </Card>
            )}

            <Button onClick={handleAddCourse} disabled={saving || !selectedPolicyId} className="w-full">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}추가
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 담당 선생님 변경 다이얼로그 */}
      <Dialog open={!!changeCourse} onOpenChange={(o) => { if (!o) setChangeCourse(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>담당 선생님 변경 — {studentName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              과정: <span className="font-medium text-foreground">
                {(changeCourse as any)?.course_policies?.course_name || '-'}
              </span>
              <span className="ml-2">
                현재 담당: {teachers.find(t => t.id === (changeCourse as any)?.teacher_id)?.full_name || '미배정'}
              </span>
            </div>
            <div>
              <Label className="text-sm">새 담당 선생님</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {teachers.map(t => (
                  <Button
                    key={t.id}
                    size="sm"
                    variant={changeTeacherId === t.id ? 'default' : 'outline'}
                    className={cn("h-8 text-xs", changeTeacherId === t.id && "ring-2 ring-primary")}
                    onClick={() => setChangeTeacherId(t.id)}
                  >
                    {t.full_name}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm">정산 적용 시작일</Label>
              <Input type="date" value={changeDate} onChange={e => setChangeDate(e.target.value)} className="h-9" />
              <p className="text-[11px] text-muted-foreground mt-1">
                * 이 날짜부터 새 선생님 기준으로 수업료가 정산됩니다. 이전 기록은 그대로 보존됩니다.
              </p>
            </div>
            <div>
              <Label className="text-sm">사유 (선택)</Label>
              <Input value={changeReason} onChange={e => setChangeReason(e.target.value)} placeholder="예: 영어 담당 교사 인계" className="h-9" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setChangeCourse(null)}>취소</Button>
            <Button onClick={saveTeacherChange} disabled={changeSaving}>
              {changeSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}변경 기록 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수강료 직접지정 다이얼로그 */}
      <Dialog open={!!feeEditCourse} onOpenChange={(o) => { if (!o) setFeeEditCourse(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>수강료 직접지정 — {studentName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              과정: <span className="font-medium text-foreground">
                {(feeEditCourse as any)?.course_policies?.course_name || '-'}
              </span>
              <span className="ml-2">
                정책 금액: {Number((feeEditCourse as any)?.course_policies?.monthly_fee || 0).toLocaleString()}원
              </span>
            </div>
            <div>
              <Label className="text-sm">월 수강료 (직접지정)</Label>
              <Input
                type="number"
                placeholder="비우면 정책 금액 사용"
                value={feeEditValue}
                onChange={e => setFeeEditValue(e.target.value)}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                * 다과목/형제 할인 등 이미 반영된 실제 청구 금액을 입력하세요. 비우면 정책 금액(다과목·형제 할인 자동 적용)으로 돌아갑니다.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFeeEditCourse(null)}>취소</Button>
            <Button onClick={saveCustomFee} disabled={feeSaving}>
              {feeSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BillingView({ billings, payments }: { billings: any[]; payments: any[] }) {
  if (billings.length === 0 && payments.length === 0) {
    return <p className="text-center text-muted-foreground py-6 text-sm">청구/납부 이력이 없습니다</p>;
  }
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">청구/납부 이력</h4>
      {billings.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>청구월</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>납부기한</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {billings.map(b => (
              <TableRow key={b.id}>
                <TableCell>{b.billing_month}</TableCell>
                <TableCell className="text-right">{Number(b.final_amount).toLocaleString()}원</TableCell>
                <TableCell>
                  <Badge variant={b.status === 'paid' ? 'default' : b.status === 'overdue' ? 'destructive' : 'secondary'}>
                    {b.status === 'paid' ? '완료' : b.status === 'overdue' ? '미납' : '대기'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{b.due_date}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {payments.length > 0 && (
        <>
          <h4 className="text-sm font-medium text-muted-foreground mt-4">납부 기록</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>납부일</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>방법</TableHead>
                <TableHead>메모</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map(p => (
                <TableRow key={p.id}>
                  <TableCell>{p.paid_date}</TableCell>
                  <TableCell className="text-right font-medium">{Number(p.amount).toLocaleString()}원</TableCell>
                  <TableCell>{p.payment_method}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.memo || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
