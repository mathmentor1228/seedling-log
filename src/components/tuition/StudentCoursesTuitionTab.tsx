import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, CalendarIcon, BookOpen, Receipt, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  studentId: string;
  studentName: string;
}

export function StudentCoursesTuitionTab({ studentId, studentName }: Props) {
  const [courses, setCourses] = useState<any[]>([]);
  const [billings, setBillings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [coursePolicies, setCoursePolicies] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Add course form
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [formCourseId, setFormCourseId] = useState('');
  const [formTeacherId, setFormTeacherId] = useState('');
  const [formEnrollDate, setFormEnrollDate] = useState<Date>(new Date());
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // View state
  const [view, setView] = useState<'courses' | 'billing'>('courses');

  useEffect(() => {
    loadAll();
  }, [studentId]);

  const loadAll = async () => {
    setLoading(true);
    const [coursesRes, billingsRes, paymentsRes, policiesRes, teachersRes] = await Promise.all([
      supabase.from('student_courses')
        .select('*, course_policies(course_name, subject, grade_target, monthly_fee)')
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
        .order('course_name'),
      supabase.from('profiles')
        .select('id, full_name')
        .not('full_name', 'is', null)
        .order('full_name'),
    ]);
    setCourses((coursesRes.data || []) as any);
    setBillings((billingsRes.data || []) as any);
    setPayments((paymentsRes.data || []) as any);
    setCoursePolicies((policiesRes.data || []) as any);
    setTeachers((teachersRes.data || []) as any);
    setLoading(false);
  };

  const handleAddCourse = async () => {
    if (!formCourseId) { toast.error('과정을 선택해주세요'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('student_courses').insert({
        student_id: studentId,
        course_policy_id: formCourseId,
        teacher_id: formTeacherId || null,
        enrollment_date: format(formEnrollDate, 'yyyy-MM-dd'),
        is_active: true,
        notes: formNotes || null,
      } as any);
      if (error) throw error;
      toast.success('수강과정 추가 완료');
      setShowAddCourse(false);
      setFormCourseId('');
      setFormTeacherId('');
      setFormNotes('');
      loadAll();
    } catch (err: any) {
      toast.error(err.message || '추가 실패');
    } finally {
      setSaving(false);
    }
  };

  const toggleCourseActive = async (courseId: string, currentActive: boolean) => {
    const { error } = await supabase
      .from('student_courses')
      .update({ is_active: !currentActive } as any)
      .eq('id', courseId);
    if (error) { toast.error('변경 실패'); return; }
    toast.success(currentActive ? '수강 비활성' : '수강 활성');
    loadAll();
  };

  const deleteCourse = async (courseId: string) => {
    if (!confirm('이 수강과정을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('student_courses').delete().eq('id', courseId);
    if (error) { toast.error('삭제 실패'); return; }
    toast.success('삭제 완료');
    loadAll();
  };

  const monthlyTotal = courses
    .filter(c => c.is_active)
    .reduce((sum, c) => sum + (Number((c as any).course_policies?.monthly_fee) || 0), 0);

  const unpaidCount = billings.filter(b => b.status === 'pending' || b.status === 'overdue').length;

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">수강과정</p>
            <p className="text-lg font-bold">{courses.filter(c => c.is_active).length}개</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">월 수강료</p>
            <p className="text-lg font-bold">{monthlyTotal.toLocaleString()}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">미납</p>
            <p className={cn("text-lg font-bold", unpaidCount > 0 ? "text-red-600" : "")}>{unpaidCount}건</p>
          </CardContent>
        </Card>
      </div>

      {/* Toggle */}
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
                          </div>
                          <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                            <span>{cp?.subject}</span>
                            <span>·</span>
                            <span>{cp?.grade_target}</span>
                            <span>·</span>
                            <span>{Number(cp?.monthly_fee || 0).toLocaleString()}원/월</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            시작: {c.enrollment_date}
                            {c.end_date && ` → 종료: ${c.end_date}`}
                          </div>
                          {c.notes && <p className="text-xs text-muted-foreground mt-1">{c.notes}</p>}
                        </div>
                        <div className="flex gap-1">
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
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">청구/납부 이력</h4>
          {billings.length === 0 && payments.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">청구/납부 이력이 없습니다</p>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      {/* Add course dialog */}
      <Dialog open={showAddCourse} onOpenChange={setShowAddCourse}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>수강과정 추가 - {studentName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">과정 *</Label>
              <Select value={formCourseId} onValueChange={setFormCourseId}>
                <SelectTrigger><SelectValue placeholder="과정 선택" /></SelectTrigger>
                <SelectContent>
                  {coursePolicies.map(cp => (
                    <SelectItem key={cp.id} value={cp.id}>
                      {cp.course_name} ({cp.subject} · {Number(cp.monthly_fee).toLocaleString()}원)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">담당 선생님</Label>
              <Select value={formTeacherId} onValueChange={setFormTeacherId}>
                <SelectTrigger><SelectValue placeholder="선택 (선택사항)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">미배정</SelectItem>
                  {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">시작일</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 w-full justify-start text-left text-sm">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(formEnrollDate, 'yyyy-MM-dd')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formEnrollDate} onSelect={d => d && setFormEnrollDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-sm">메모</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleAddCourse} disabled={saving} className="w-full">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}추가
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
