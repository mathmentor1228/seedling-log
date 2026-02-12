import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Edit2, Loader2, BookOpen, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

const TEACHER_OPTIONS = [
  { value: 'seo', label: '서미정' },
  { value: 'kim', label: '김민희' },
];

interface VocabSetting {
  id: string;
  student_id: string;
  teacher_id: string;
  book_name: string;
  days_per_test: number;
  cutline_percent: number;
  test_days: string[];
  current_day_number: number;
  is_active: boolean;
  bundle_days: boolean;
  total_days: number | null;
  notes: string | null;
  assigned_teacher: string | null;
  students?: { name: string; grade: string | null; school: string | null };
}

interface Student {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
}

const TEST_DAY_OPTIONS = [
  { value: 'mon_wed', label: '월/수' },
  { value: 'tue_thu', label: '화/목' },
  { value: 'mon_wed_fri', label: '월/수/금' },
  { value: 'tue_thu_fri', label: '화/목/금' },
  { value: 'mon_tue_wed_thu', label: '월/화/수/목' },
  { value: 'mon_tue_wed_thu_fri', label: '월~금' },
  { value: 'mon', label: '월' },
  { value: 'tue', label: '화' },
  { value: 'wed', label: '수' },
  { value: 'thu', label: '목' },
  { value: 'fri', label: '금' },
];

export function VocabSettingsPanel() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<VocabSetting[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formStudentId, setFormStudentId] = useState('');
  const [formBookName, setFormBookName] = useState('');
  const [formDaysPerTest, setFormDaysPerTest] = useState(1);
  const [formCutline, setFormCutline] = useState(80);
  const [formTestDays, setFormTestDays] = useState('mon_wed');
  const [formCurrentDay, setFormCurrentDay] = useState(1);
  const [formBundleDays, setFormBundleDays] = useState(false);
  const [formTotalDays, setFormTotalDays] = useState<number | ''>('');
  const [formNotes, setFormNotes] = useState('');
  const [formAssignedTeacher, setFormAssignedTeacher] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VocabSetting | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [settingsRes, studentsRes] = await Promise.all([
      supabase
        .from('vocab_settings')
        .select('*, students(name, grade, school)')
        .order('created_at', { ascending: false }),
      supabase
        .from('students')
        .select('id, name, grade, school')
        .eq('enrollment_status', '재원')
        .order('name'),
    ]);

    if (settingsRes.data) setSettings(settingsRes.data as any);
    if (studentsRes.data) setStudents(studentsRes.data);
    setLoading(false);
  };

  const resetForm = () => {
    setFormStudentId('');
    setFormBookName('');
    setFormDaysPerTest(1);
    setFormCutline(80);
    setFormTestDays('mon_wed');
    setFormCurrentDay(1);
    setFormBundleDays(false);
    setFormTotalDays('');
    setFormNotes('');
    setFormAssignedTeacher('');
    setEditingId(null);
  };

  const openEdit = (s: VocabSetting) => {
    setEditingId(s.id);
    setFormStudentId(s.student_id);
    setFormBookName(s.book_name);
    setFormDaysPerTest(s.days_per_test);
    setFormCutline(s.cutline_percent);
    setFormTestDays(s.test_days[0] || 'mon_wed');
    setFormCurrentDay(s.current_day_number);
    setFormBundleDays(s.bundle_days);
    setFormTotalDays(s.total_days || '');
    setFormNotes(s.notes || '');
    setFormAssignedTeacher(s.assigned_teacher || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formStudentId || !formBookName || !formAssignedTeacher) {
      toast.error('학생, 교재명, 담당 선생님을 입력해주세요');
      return;
    }
    setSaving(true);

    const payload = {
      student_id: formStudentId,
      teacher_id: user?.id || '',
      book_name: formBookName,
      days_per_test: formDaysPerTest,
      cutline_percent: formCutline,
      test_days: [formTestDays],
      current_day_number: formCurrentDay,
      bundle_days: formBundleDays,
      total_days: formTotalDays ? Number(formTotalDays) : null,
      notes: formNotes || null,
      is_active: true,
      assigned_teacher: formAssignedTeacher,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('vocab_settings').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('vocab_settings').insert(payload));
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(editingId ? '수정 완료' : '등록 완료');
      setDialogOpen(false);
      resetForm();
      fetchData();
    }
    setSaving(false);
  };

  // Filter students who don't have settings yet (for new entries)
  const availableStudents = editingId
    ? students
    : students.filter(s => !settings.some(st => st.student_id === s.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">학생별 단어 설정</h2>
          <p className="text-xs text-muted-foreground mt-0.5">교재, DAY 수, 커트라인을 학생별로 관리합니다</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              학생 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? '설정 수정' : '단어 설정 추가'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">학생</Label>
                <Select value={formStudentId} onValueChange={setFormStudentId} disabled={!!editingId}>
                  <SelectTrigger><SelectValue placeholder="학생 선택" /></SelectTrigger>
                  <SelectContent>
                    {availableStudents.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} {s.grade ? `(${s.grade})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">담당 선생님</Label>
                  <Select value={formAssignedTeacher} onValueChange={setFormAssignedTeacher}>
                    <SelectTrigger><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                    <SelectContent>
                      {TEACHER_OPTIONS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">교재명</Label>
                  <Input value={formBookName} onChange={e => setFormBookName(e.target.value)} placeholder="예: 워드마스터 중등" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">회당 DAY 수</Label>
                  <Input type="number" min={1} value={formDaysPerTest} onChange={e => setFormDaysPerTest(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">커트라인 (%)</Label>
                  <Input type="number" min={0} max={100} value={formCutline} onChange={e => setFormCutline(Number(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">시험 요일</Label>
                  <Select value={formTestDays} onValueChange={setFormTestDays}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TEST_DAY_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">현재 DAY 번호</Label>
                  <Input type="number" min={1} value={formCurrentDay} onChange={e => setFormCurrentDay(Number(e.target.value))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">총 일차 수 (교재 전체 DAY)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formTotalDays}
                  onChange={e => setFormTotalDays(e.target.value ? Number(e.target.value) : '')}
                  placeholder="미입력 시 제한 없음"
                />
                <p className="text-xs text-muted-foreground">스케줄 생성 시 이 DAY를 초과하면 자동으로 중단됩니다</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">메모</Label>
                <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="선택 사항" />
              </div>

              {formDaysPerTest > 1 && (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label className="text-xs font-medium">DAY 묶음 시험</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formDaysPerTest}개 DAY를 하나의 시험으로 묶어서 봅니다
                    </p>
                  </div>
                  <Switch checked={formBundleDays} onCheckedChange={setFormBundleDays} />
                </div>
              )}

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                {editingId ? '수정' : '등록'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {settings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
            등록된 학생이 없습니다. 학생을 추가해주세요.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">선생님</TableHead>
                <TableHead className="w-[120px]">학생</TableHead>
                <TableHead>교재</TableHead>
                <TableHead className="text-center w-[60px]">DAY</TableHead>
                <TableHead className="text-center w-[60px]">총 일차</TableHead>
                <TableHead className="text-center w-[70px]">커트라인</TableHead>
                <TableHead className="text-center w-[60px]">요일</TableHead>
                <TableHead className="text-center w-[50px]">묶음</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="text-xs">
                    {TEACHER_OPTIONS.find(t => t.value === s.assigned_teacher)?.label || '—'}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {(s as any).students?.name || '—'}
                    {(s as any).students?.grade && (
                      <span className="text-xs text-muted-foreground ml-1">({(s as any).students.grade})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{s.book_name}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs font-mono">Day {s.current_day_number}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-xs font-mono">
                    {s.total_days ? `${s.total_days}일` : '—'}
                  </TableCell>
                  <TableCell className="text-center text-sm">{s.cutline_percent}%</TableCell>
                  <TableCell className="text-center text-xs">
                    {s.test_days.map(d => TEST_DAY_OPTIONS.find(o => o.value === d)?.label || d).join(', ')}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {s.days_per_test > 1 ? (s.bundle_days ? '묶음' : '개별') : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(s)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학생 설정 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{(deleteTarget as any).students?.name}</strong>의 단어 설정({deleteTarget.book_name})을 삭제하시겠습니까?
                  <span className="block mt-1 text-destructive">⚠️ 연결된 스케줄과 시험 결과도 함께 삭제됩니다.</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleteLoading(true);
                // Delete results linked to schedules of this setting
                const { data: schedIds } = await supabase
                  .from('vocab_schedules')
                  .select('id')
                  .eq('setting_id', deleteTarget.id);
                if (schedIds && schedIds.length > 0) {
                  await supabase.from('vocab_test_results').delete().in('schedule_id', schedIds.map(s => s.id));
                  await supabase.from('vocab_schedules').delete().in('id', schedIds.map(s => s.id));
                }
                const { error } = await supabase.from('vocab_settings').delete().eq('id', deleteTarget.id);
                if (error) {
                  toast.error(error.message);
                } else {
                  toast.success('설정이 삭제되었습니다');
                  fetchData();
                }
                setDeleteTarget(null);
                setDeleteLoading(false);
              }}
            >
              {deleteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
