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
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

const TEACHER_OPTIONS = [
  { value: 'seo', label: '서미정' },
  { value: 'kim', label: '김민희' },
];

interface DaysPerTestMap {
  [day: string]: number;
}

interface VocabSetting {
  id: string;
  student_id: string;
  teacher_id: string;
  book_name: string;
  days_per_test: number;
  days_per_test_map: DaysPerTestMap | null;
  cutline_percent: number;
  test_days: string[];
  current_day_number: number;
  is_active: boolean;
  bundle_days: boolean;
  total_days: number | null;
  notes: string | null;
  assigned_teacher: string | null;
  test_time_limit: number | null;
  test_level: number;
  students?: { name: string; grade: string | null; school: string | null };
}

interface Student {
  id: string;
  name: string;
  grade: string | null;
  school: string | null;
}

const DAY_LABELS: Record<string, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토',
};

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const GRADE_GROUPS = ['중1', '중2', '중3', '고1', '고2', '고3'];

function getGradeGroup(grade: string | null, school: string | null): string | null {
  if (!grade) return null;
  for (const g of GRADE_GROUPS) {
    if (grade.includes(g)) return g;
  }
  if (school) {
    const level = school.includes('중') ? '중' : school.includes('고') ? '고' : null;
    if (level) {
      const yearMatch = grade.match(/(\d)/);
      if (yearMatch) return `${level}${yearMatch[1]}`;
    }
  }
  return null;
}

// Backward compat: convert old combo values to individual day arrays
function normalizeTestDays(testDays: string[]): string[] {
  if (!testDays || testDays.length === 0) return ['mon', 'wed'];
  if (testDays.every(d => ALL_DAYS.includes(d as any))) return testDays;
  const combo = testDays[0];
  const COMBO_MAP: Record<string, string[]> = {
    mon_wed: ['mon', 'wed'],
    tue_thu: ['tue', 'thu'],
    mon_wed_fri: ['mon', 'wed', 'fri'],
    tue_thu_fri: ['tue', 'thu', 'fri'],
    mon_tue_wed_thu: ['mon', 'tue', 'wed', 'thu'],
    mon_tue_wed_thu_fri: ['mon', 'tue', 'wed', 'thu', 'fri'],
    mon: ['mon'], tue: ['tue'], wed: ['wed'], thu: ['thu'], fri: ['fri'], sat: ['sat'],
  };
  return COMBO_MAP[combo] || ['mon', 'wed'];
}

function formatTestDaysLabel(testDays: string[]): string {
  const normalized = normalizeTestDays(testDays);
  return normalized.map(d => DAY_LABELS[d] || d).join('/');
}

function getIndividualDays(testDays: string[]): string[] {
  return normalizeTestDays(testDays);
}

function formatDaysPerTestMap(map: DaysPerTestMap | null, testDays: string[]): string {
  if (!map) return '';
  const days = normalizeTestDays(testDays);
  return days
    .map(d => `${DAY_LABELS[d]}${map[d] || 1}`)
    .join(' / ');
}

export function VocabSettingsPanel() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<VocabSetting[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showUnset, setShowUnset] = useState(false);

  // Form state
  const [formStudentId, setFormStudentId] = useState('');
  const [formBookName, setFormBookName] = useState('');
  const [formDaysPerTest, setFormDaysPerTest] = useState(1);
  const [formDaysPerTestMap, setFormDaysPerTestMap] = useState<DaysPerTestMap>({});
  const [formUsePerDayConfig, setFormUsePerDayConfig] = useState(false);
  const [formCutline, setFormCutline] = useState(80);
  const [formTestDays, setFormTestDays] = useState<string[]>(['mon', 'wed']);
  const [formCurrentDay, setFormCurrentDay] = useState(1);
  const [formBundleDays, setFormBundleDays] = useState(false);
  const [formTotalDays, setFormTotalDays] = useState<number | ''>('');
  const [formNotes, setFormNotes] = useState('');
  const [formAssignedTeacher, setFormAssignedTeacher] = useState('');
  const [formTimeLimit, setFormTimeLimit] = useState<number | ''>('');
  const [formTestLevel, setFormTestLevel] = useState(1);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VocabSetting | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterName, setFilterName] = useState('');
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
        .in('enrollment_status', ['재원', '재원예정'])
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
    setFormDaysPerTestMap({});
    setFormUsePerDayConfig(false);
    setFormCutline(80);
    setFormTestDays(['mon', 'wed']);
    setFormCurrentDay(1);
    setFormBundleDays(false);
    setFormTotalDays('');
    setFormNotes('');
    setFormAssignedTeacher('');
    setFormTimeLimit('');
    setFormTestLevel(1);
    setEditingId(null);
  };

  const openEdit = (s: VocabSetting) => {
    setEditingId(s.id);
    setFormStudentId(s.student_id);
    setFormBookName(s.book_name);
    setFormDaysPerTest(s.days_per_test);
    const hasMap = s.days_per_test_map && Object.keys(s.days_per_test_map).length > 0;
    setFormUsePerDayConfig(!!hasMap);
    setFormDaysPerTestMap(hasMap ? s.days_per_test_map! : {});
    setFormCutline(s.cutline_percent);
    setFormTestDays(normalizeTestDays(s.test_days));
    setFormCurrentDay(s.current_day_number);
    setFormBundleDays(s.bundle_days);
    setFormTotalDays(s.total_days || '');
    setFormNotes(s.notes || '');
    setFormAssignedTeacher(s.assigned_teacher || '');
    setFormTimeLimit(s.test_time_limit || '');
    setFormTestLevel(s.test_level || 1);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formStudentId || !formBookName || !formAssignedTeacher) {
      toast.error('학생, 교재명, 담당 선생님을 입력해주세요');
      return;
    }
    setSaving(true);

    const perDayMap = formUsePerDayConfig ? formDaysPerTestMap : null;
    // Use max of per-day values as the fallback days_per_test
    const effectiveDaysPerTest = formUsePerDayConfig
      ? Math.max(1, ...Object.values(formDaysPerTestMap).map(Number).filter(Boolean))
      : formDaysPerTest;

    const payload = {
      student_id: formStudentId,
      teacher_id: user?.id || '',
      book_name: formBookName,
      days_per_test: effectiveDaysPerTest,
      days_per_test_map: perDayMap,
      cutline_percent: formCutline,
      test_days: formTestDays,
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

              <div className="space-y-1.5">
                <Label className="text-xs">시험 요일</Label>
                <div className="flex gap-2 flex-wrap">
                  {ALL_DAYS.map(day => {
                    const checked = formTestDays.includes(day);
                    return (
                      <label key={day} className="flex items-center gap-1 cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = v
                              ? [...formTestDays, day].sort((a, b) => ALL_DAYS.indexOf(a as any) - ALL_DAYS.indexOf(b as any))
                              : formTestDays.filter(d => d !== day);
                            if (next.length === 0) return; // at least 1
                            setFormTestDays(next);
                            if (formUsePerDayConfig) {
                              const newMap: DaysPerTestMap = {};
                              next.forEach(d => { newMap[d] = formDaysPerTestMap[d] || 1; });
                              setFormDaysPerTestMap(newMap);
                            }
                          }}
                        />
                        <span className="text-xs">{DAY_LABELS[day]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">현재 DAY 번호</Label>
                <Input type="number" min={1} value={formCurrentDay} onChange={e => setFormCurrentDay(Number(e.target.value))} />
              </div>

              {/* DAY 수 설정: 공통 or 요일별 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">회당 DAY 수</Label>
                  {getIndividualDays(formTestDays).length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        const next = !formUsePerDayConfig;
                        setFormUsePerDayConfig(next);
                        if (next) {
                          const days = getIndividualDays(formTestDays);
                          const newMap: DaysPerTestMap = {};
                          days.forEach(d => { newMap[d] = formDaysPerTest; });
                          setFormDaysPerTestMap(newMap);
                        }
                      }}
                    >
                      {formUsePerDayConfig ? '공통으로 설정' : '요일별로 다르게'}
                    </button>
                  )}
                </div>

                {formUsePerDayConfig ? (
                  <div className="grid gap-2">
                    {getIndividualDays(formTestDays).map(day => (
                      <div key={day} className="flex items-center gap-2">
                        <span className="text-xs font-medium w-6 text-center">{DAY_LABELS[day]}</span>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 text-sm"
                          value={formDaysPerTestMap[day] || 1}
                          onChange={e => setFormDaysPerTestMap(prev => ({ ...prev, [day]: Number(e.target.value) || 1 }))}
                        />
                        <span className="text-xs text-muted-foreground">DAY</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Input type="number" min={1} value={formDaysPerTest} onChange={e => setFormDaysPerTest(Number(e.target.value))} />
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">커트라인 (%)</Label>
                <Input type="number" min={0} max={100} value={formCutline} onChange={e => setFormCutline(Number(e.target.value))} />
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

              {(() => {
                const maxDays = formUsePerDayConfig
                  ? Math.max(0, ...Object.values(formDaysPerTestMap).map(Number).filter(Boolean))
                  : formDaysPerTest;
                if (maxDays <= 1) return null;
                return (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label className="text-xs font-medium">DAY 묶음 시험</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        여러 DAY를 하나의 시험으로 묶어서 봅니다
                      </p>
                    </div>
                    <Switch checked={formBundleDays} onCheckedChange={setFormBundleDays} />
                  </div>
                );
              })()}

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                {editingId ? '수정' : '등록'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterTeacher} onValueChange={setFilterTeacher}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 선생님</SelectItem>
            {TEACHER_OPTIONS.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterGrade} onValueChange={setFilterGrade}>
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 학년</SelectItem>
            {GRADE_GROUPS.map(g => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="이름 검색..."
          value={filterName}
          onChange={e => setFilterName(e.target.value)}
          className="w-28 h-8 text-xs"
        />
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox checked={showUnset} onCheckedChange={(v) => setShowUnset(!!v)} />
          <span className="text-xs text-muted-foreground">미설정 학생</span>
        </label>
        <Badge variant="secondary" className="text-xs">
          {(() => {
            const filtered = settings.filter(s => {
              if (filterTeacher !== 'all' && s.assigned_teacher !== filterTeacher) return false;
              if (filterGrade !== 'all') {
                const st = (s as any).students;
                const group = st ? getGradeGroup(st.grade, st.school) : null;
                if (group !== filterGrade) return false;
              }
              if (filterName) {
                const st = (s as any).students;
                if (!st?.name?.includes(filterName)) return false;
              }
              return true;
            });
            return `${filtered.length}명`;
          })()}
        </Badge>
      </div>

      {/* Unset students list */}
      {showUnset && (() => {
        const settingStudentIds = new Set(settings.map(s => s.student_id));
        const unsetStudents = students.filter(s => !settingStudentIds.has(s.id));
        const filtered = unsetStudents.filter(s => {
          if (filterName && !s.name.includes(filterName)) return false;
          if (filterGrade !== 'all') {
            const group = getGradeGroup(s.grade, s.school);
            if (group !== filterGrade) return false;
          }
          return true;
        });
        return (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="py-3">
              <p className="text-xs font-semibold text-warning mb-2">단어 설정 미등록 학생 ({filtered.length}명)</p>
              <div className="flex flex-wrap gap-1.5">
                {filtered.map(s => (
                  <Badge key={s.id} variant="outline" className="text-xs border-warning/40 text-warning">
                    {s.name} {s.grade ? `(${s.grade})` : ''}
                  </Badge>
                ))}
                {filtered.length === 0 && <span className="text-xs text-muted-foreground">없음</span>}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {settings.length === 0 && !showUnset ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
            등록된 학생이 없습니다. 학생을 추가해주세요.
          </CardContent>
        </Card>
      ) : settings.length > 0 && (
        <Card>
          <div className="overflow-auto max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 bg-card z-10">
                  <TableHead className="w-[80px] sticky top-0 bg-card">선생님</TableHead>
                  <TableHead className="w-[120px] sticky top-0 bg-card">학생</TableHead>
                  <TableHead className="sticky top-0 bg-card">교재</TableHead>
                  <TableHead className="text-center w-[60px] sticky top-0 bg-card">DAY</TableHead>
                  <TableHead className="text-center w-[80px] sticky top-0 bg-card">회당 DAY</TableHead>
                  <TableHead className="text-center w-[60px] sticky top-0 bg-card">총 일차</TableHead>
                  <TableHead className="text-center w-[70px] sticky top-0 bg-card">커트라인</TableHead>
                  <TableHead className="text-center w-[60px] sticky top-0 bg-card">요일</TableHead>
                  <TableHead className="w-[50px] sticky top-0 bg-card"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.filter(s => {
                  if (filterTeacher !== 'all' && s.assigned_teacher !== filterTeacher) return false;
                  if (filterGrade !== 'all') {
                    const st = (s as any).students;
                    const group = st ? getGradeGroup(st.grade, st.school) : null;
                    if (group !== filterGrade) return false;
                  }
                  if (filterName) {
                    const st = (s as any).students;
                    if (!st?.name?.includes(filterName)) return false;
                  }
                  return true;
                }).map(s => {
                  const teacherOpt = TEACHER_OPTIONS.find(t => t.value === s.assigned_teacher);
                  return (
                    <TableRow key={s.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="text-xs">
                        {teacherOpt ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              s.assigned_teacher === 'seo' ? 'border-primary/40 text-primary bg-primary/5' :
                              s.assigned_teacher === 'kim' ? 'border-emerald-400/40 text-emerald-700 bg-emerald-500/5' :
                              ''
                            )}
                          >
                            {teacherOpt.label}
                          </Badge>
                        ) : '—'}
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
                      <TableCell className="text-center text-xs">
                        {s.days_per_test_map
                          ? formatDaysPerTestMap(s.days_per_test_map, s.test_days)
                          : `${s.days_per_test}DAY`}
                      </TableCell>
                      <TableCell className="text-center text-xs font-mono">
                        {s.total_days ? `${s.total_days}일` : (
                          <Badge variant="outline" className="text-[10px] border-warning/40 text-warning bg-warning/5">미설정</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm">{s.cutline_percent}%</TableCell>
                      <TableCell className="text-center text-xs">
                        {formatTestDaysLabel(s.test_days)}
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
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
