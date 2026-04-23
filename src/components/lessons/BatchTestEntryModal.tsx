// BATCH-TEST-ENTRY-V3: Enhanced with time slot selection + improved design
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin as checkIsAdmin, isAssistant as checkIsAssistant } from '@/lib/auth';
import { CheckCircle2, XCircle, Minus, Loader2, Users, Search, Clock, UserCheck } from 'lucide-react';
import { ASSISTANTS } from './constants';
import { useTeachersList } from './useTeachersList';
import { getTodayKST } from '@/lib/utils';
import { fetchStudentsByIds, fetchTeacherStudentIds, getStudentGroupLabel, groupStudentsByGrade } from './studentSelection';

interface StudentEntry {
  student_id: string;
  student_name: string;
  name: string;
  school_name: string;
  school_level: string;
  grade_year: number | null;
  selected: boolean;
  test_result_text: string;
  test_result: 'pass' | 'fail' | 'none';
}

interface BatchTestEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSubject?: string;
  defaultDate?: string;
  onSaved?: () => void;
}

interface TimeSlotOption {
  id: string;
  label: string;
  class_id: string;
  class_name: string;
}

const SUBJECTS = ['수학', '영어', '과학', '국어'] as const;

export function BatchTestEntryModal({
  open, onOpenChange, defaultSubject, defaultDate, onSaved,
}: BatchTestEntryModalProps) {
  const { toast } = useToast();
  const { user, role } = useAuth();
  const isAssistant = checkIsAssistant(role);
  const isAdmin = checkIsAdmin(role);
  const canSelectTeacher = isAssistant || isAdmin;
  const { teachers } = useTeachersList();
  const [subject, setSubject] = useState(defaultSubject || '');
  const [date, setDate] = useState(defaultDate || getTodayKST());
  const [testContent, setTestContent] = useState('');
  const [testAssistant, setTestAssistant] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('미정');
  const [timeSlots, setTimeSlots] = useState<TimeSlotOption[]>([]);
  const [entries, setEntries] = useState<StudentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testSlot, setTestSlot] = useState<1 | 2>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const effectiveTeacherId = canSelectTeacher ? teacherId : (user?.id || '');

  // Fetch time slots for selected teacher + date
  const fetchTimeSlots = useCallback(async (tid: string, d: string) => {
    if (!tid || !d) { setTimeSlots([]); return; }
    const dateObj = new Date(d + 'T12:00:00');
    const dayOfWeek = dateObj.getDay();

    const { data } = await supabase
      .from('class_schedules')
      .select('id, start_time, end_time, class_id, classes!inner(name, subject)')
      .eq('teacher_id', tid)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .order('start_time');

    const slots: TimeSlotOption[] = ((data || []) as any[]).map(s => ({
      id: s.id,
      label: `${s.start_time?.slice(0, 5)}~${s.end_time?.slice(0, 5)} · ${s.classes?.name || ''}`,
      class_id: s.class_id,
      class_name: s.classes?.name || '',
    }));
    setTimeSlots(slots);
  }, []);

  const fetchStudents = useCallback(async (subj: string, selectedTeacherId?: string) => {
    if (!subj) { setEntries([]); return; }
    const resolvedTeacherId = canSelectTeacher ? (selectedTeacherId || teacherId) : (user?.id || '');
    if (!resolvedTeacherId) { setEntries([]); return; }

    setLoading(true);
    try {
      const studentIds = await fetchTeacherStudentIds(resolvedTeacherId, subj);
      const students = await fetchStudentsByIds(studentIds);

      setEntries(students.map((s) => ({
        student_id: s.id,
        student_name: s.name,
        name: s.name,
        school_name: s.school || '',
        school_level: s.school_level || '',
        grade_year: s.grade_year,
        selected: true,
        test_result_text: '',
        test_result: 'none',
      })));
    } catch (error) {
      console.error('학생 목록 로딩 실패:', error);
      setEntries([]);
      toast({ title: '학생 목록 로딩 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [canSelectTeacher, teacherId, toast, user?.id]);

  useEffect(() => {
    if (open) {
      setSubject(defaultSubject || '');
      setDate(defaultDate || getTodayKST());
      setTestContent('');
      setTestAssistant('');
      setTeacherId('');
      setSelectedTimeSlot('미정');
      setTimeSlots([]);
      setTestSlot(1);
      setSearchQuery('');
      setEntries([]);
    }
  }, [open, defaultSubject, defaultDate]);

  // When teacher or date changes, fetch time slots
  useEffect(() => {
    if (!open) return;
    fetchTimeSlots(effectiveTeacherId, date);
  }, [open, effectiveTeacherId, date, fetchTimeSlots]);

  // When teacher + subject selected, fetch students
  useEffect(() => {
    if (!open || !subject) return;
    if (canSelectTeacher && !teacherId) { setEntries([]); return; }
    void fetchStudents(subject, teacherId);
  }, [open, subject, teacherId, canSelectTeacher, fetchStudents]);

  function toggleResult(idx: number) {
    setEntries(prev => prev.map((e, i) => {
      if (i !== idx) return e;
      const next = e.test_result === 'none' ? 'pass' : e.test_result === 'pass' ? 'fail' : 'none';
      return { ...e, test_result: next };
    }));
  }

  function toggleSelect(idx: number) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, selected: !e.selected } : e));
  }

  function selectAll(selected: boolean) {
    setEntries(prev => prev.map(e => ({ ...e, selected })));
  }

  function setAllPass() {
    setEntries(prev => prev.map(e => e.selected ? { ...e, test_result: 'pass' } : e));
  }

  async function handleSave() {
    const selected = entries.filter(e => e.selected);
    if (!testContent.trim()) {
      toast({ title: '테스트 내용을 입력해주세요', variant: 'destructive' }); return;
    }
    if (selected.length === 0) {
      toast({ title: '학생을 선택해주세요', variant: 'destructive' }); return;
    }
    if (!effectiveTeacherId) {
      toast({ title: '담당 선생님을 선택해주세요', variant: 'destructive' }); return;
    }

    setSaving(true);
    try {
      // BATCH-TEST-AUTOCREATE-V2: Auto-create lesson records for students without one
      const { data: existingRecords } = await supabase
        .from('lesson_records')
        .select('id, student_id')
        .eq('lesson_date', date)
        .eq('subject', subject as any)
        .in('student_id', selected.map(s => s.student_id));

      const recordMap = new Map((existingRecords || []).map(r => [r.student_id, r.id]));

      const missingStudents = selected.filter(e => !recordMap.has(e.student_id));
      if (missingStudents.length > 0) {
        // Resolve per-student teacher_id via student_subject_teachers mapping (fallback to effectiveTeacherId)
        const { data: sstMappings } = await supabase
          .from('student_subject_teachers')
          .select('student_id, teacher_id')
          .eq('subject', subject)
          .in('student_id', missingStudents.map(s => s.student_id));
        const teacherMap = new Map((sstMappings || []).map(m => [m.student_id, m.teacher_id]));

        const cleanAssistant = (testAssistant && testAssistant !== 'none_selected') ? testAssistant : null;

        // Insert one-by-one so a single failure doesn't drop the whole batch
        for (const s of missingStudents) {
          const resolvedTeacherId = teacherMap.get(s.student_id) || effectiveTeacherId;
          const newRecord = {
            student_id: s.student_id,
            teacher_id: resolvedTeacherId,
            lesson_date: date,
            subject: subject as any,
            lesson_types: ['테스트'] as string[],
            understanding_score: null,
            homework_status: 'none_assigned', // HW-STATUS-ENUM-V2: must be valid enum
            lesson_range: '테스트',
            submitted: true,
            submitted_at: new Date().toISOString(),
            test_content: testContent,
            test_name: testContent,
            test_date: date,
            test_assistant: cleanAssistant,
          };
          const { data: inserted, error: insertError } = await supabase
            .from('lesson_records')
            .insert(newRecord)
            .select('id, student_id')
            .single();
          if (insertError) {
            console.error(`[BATCH-TEST-AUTOCREATE-V2] Insert failed for ${s.student_name}:`, insertError);
          } else if (inserted) {
            recordMap.set(inserted.student_id, inserted.id);
          }
        }
      }

      let successCount = 0;
      const savedRecordIds: string[] = [];

      for (const entry of selected) {
        const recordId = recordMap.get(entry.student_id);
        if (!recordId) continue;
        const { error } = await supabase.rpc('update_lesson_test_fields', {
          _lesson_id: recordId,
          _test_content: testContent,
          _test_name: testContent,
          _test_result_text: entry.test_result_text || null,
          _test_result: entry.test_result,
          _test_date: date,
          _test_assistant: (testAssistant && testAssistant !== 'none_selected') ? testAssistant : null,
          _test_slot: testSlot,
        });
        if (!error) { successCount++; savedRecordIds.push(recordId); }
      }

      if (savedRecordIds.length > 0) {
        const { data: currentRecords } = await supabase
          .from('lesson_records').select('id, lesson_types, student_id').in('id', savedRecordIds);
        if (currentRecords) {
          for (const rec of currentRecords) {
            const currentTypes: string[] = (rec.lesson_types as string[]) || [];
            const entry = selected.find(e => e.student_id === rec.student_id);
            const updatePayload: Record<string, any> = {};
            if (!currentTypes.includes('테스트')) updatePayload.lesson_types = [...currentTypes, '테스트'];
            if (subject === '영어' && entry) {
              updatePayload.english_pass_fail = entry.test_result === 'pass' ? 'pass' : entry.test_result === 'fail' ? 'fail' : null;
            }
            if (Object.keys(updatePayload).length > 0) {
              await supabase.from('lesson_records').update(updatePayload).eq('id', rec.id);
            }
          }
        }
      }

      toast({ title: '일괄 저장 완료', description: `${successCount}명의 테스트 결과를 저장했습니다.` });
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast({ title: '저장 실패', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) =>
      entry.student_name.toLowerCase().includes(q) ||
      entry.school_name.toLowerCase().includes(q) ||
      `${entry.school_level}${entry.grade_year ?? ''}`.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  const selectedCount = entries.filter(e => e.selected).length;
  const grouped = groupStudentsByGrade<StudentEntry>(filteredEntries);
  const selectedTeacherName = teachers.find(t => t.id === effectiveTeacherId)?.full_name || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-5 pt-5 pb-3 border-b bg-primary/5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="w-5 h-5 text-primary" />
            테스트 일괄 입력
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 px-5 py-4">
          {/* Step 1: Teacher + Date + Time */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3 space-y-3">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" /> 1단계: 담당선생님 · 과목 · 날짜 · 타임
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">담당 선생님 <span className="text-destructive">*</span></Label>
                  {canSelectTeacher ? (
                    <Select value={teacherId} onValueChange={(v) => { setTeacherId(v); setSelectedTimeSlot('미정'); }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                      <SelectContent>
                        {teachers.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-9 flex items-center px-3 rounded-md border bg-muted/50 text-sm">
                      {selectedTeacherName || '본인'}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">과목 <span className="text-destructive">*</span></Label>
                  <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="과목 선택" /></SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">수업 날짜</Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> 타임</Label>
                  <Select value={selectedTimeSlot} onValueChange={setSelectedTimeSlot}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="미정">미정 (시간 없음)</SelectItem>
                      {timeSlots.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Test Details */}
          <Card className="border-muted">
            <CardContent className="p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">2단계: 테스트 정보</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">테스트 내용/범위 <span className="text-destructive">*</span></Label>
                  <Input value={testContent} onChange={e => setTestContent(e.target.value)} placeholder="예: 단원평가 3단원, 영단어 Day 5" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">테스트 슬롯</Label>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant={testSlot === 1 ? 'default' : 'outline'} onClick={() => setTestSlot(1)} className="text-xs flex-1 h-9">① 테스트 1</Button>
                    <Button type="button" size="sm" variant={testSlot === 2 ? 'default' : 'outline'} onClick={() => setTestSlot(2)} className="text-xs flex-1 h-9">② 테스트 2</Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">조교</Label>
                  <Select value={testAssistant} onValueChange={setTestAssistant}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="선택 (선택사항)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none_selected">선택 안함</SelectItem>
                      {ASSISTANTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Students */}
          {(effectiveTeacherId && subject) && (
            <Card className="border-muted">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">3단계: 학생 선택 · 결과 입력</p>
                  {selectedTeacherName && (
                    <Badge variant="outline" className="text-[10px]">
                      {selectedTeacherName} 선생님
                    </Badge>
                  )}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="이름/학교/학년 검색" className="pl-8 h-8 text-xs" />
                </div>

                {/* Bulk actions */}
                {entries.length > 0 && (
                  <div className="flex items-center justify-between gap-2 py-1 border-b pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={selectedCount === entries.length} onCheckedChange={checked => selectAll(!!checked)} />
                      <span className="text-xs text-muted-foreground">전체 ({selectedCount}/{entries.length})</span>
                    </label>
                    <Button variant="outline" size="sm" className="text-xs gap-1 h-7" onClick={setAllPass}>
                      <CheckCircle2 className="w-3 h-3 text-green-600" /> 선택 전체 통과
                    </Button>
                  </div>
                )}

                {/* Student list */}
                {loading ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 학생 로딩 중...
                  </div>
                ) : filteredEntries.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-xs">
                      {canSelectTeacher && !teacherId ? '선생님을 먼저 선택해주세요' : '조건에 맞는 학생이 없습니다'}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {grouped.map(([groupKey, students]) => (
                      <div key={groupKey}>
                        <div className="flex items-center gap-2 mb-1 sticky top-0 bg-background py-0.5 z-10">
                          <Badge variant="secondary" className="text-[10px] font-medium">{getStudentGroupLabel(groupKey)}</Badge>
                          <span className="text-[10px] text-muted-foreground">{students.length}명</span>
                        </div>
                        <div className="space-y-0.5">
                          {students.map(entry => {
                            const idx = entries.findIndex(e => e.student_id === entry.student_id);
                            return (
                              <div key={entry.student_id} className={`flex items-center gap-2 p-1.5 rounded-lg border transition-colors ${entry.selected ? 'bg-primary/5 border-primary/20' : 'bg-muted/20 border-transparent'}`}>
                                <Checkbox checked={entry.selected} onCheckedChange={() => toggleSelect(idx)} className="shrink-0" />
                                <span className="text-xs font-medium min-w-[48px] truncate">{entry.student_name}</span>
                                {entry.school_name && <span className="text-[10px] text-muted-foreground truncate max-w-[50px]">{entry.school_name}</span>}
                                <button type="button" onClick={() => toggleResult(idx)} className="shrink-0 ml-auto">
                                  {entry.test_result === 'pass' && (
                                    <Badge className="bg-green-500/15 text-green-700 border-green-500/30 text-[10px] cursor-pointer hover:bg-green-500/25 px-1.5">
                                      <CheckCircle2 className="w-3 h-3 mr-0.5" /> 통과
                                    </Badge>
                                  )}
                                  {entry.test_result === 'fail' && (
                                    <Badge className="bg-red-500/15 text-red-700 border-red-500/30 text-[10px] cursor-pointer hover:bg-red-500/25 px-1.5">
                                      <XCircle className="w-3 h-3 mr-0.5" /> 불합
                                    </Badge>
                                  )}
                                  {entry.test_result === 'none' && (
                                    <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-accent px-1.5">
                                      <Minus className="w-3 h-3 mr-0.5" /> 미정
                                    </Badge>
                                  )}
                                </button>
                                <Input
                                  value={entry.test_result_text}
                                  onChange={e => setEntries(prev => prev.map((en, i) => i === idx ? { ...en, test_result_text: e.target.value } : en))}
                                  placeholder="점수"
                                  className="w-16 h-7 text-xs"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-muted/30">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-muted-foreground">
              {selectedCount > 0 ? `${selectedCount}명 선택됨` : '학생을 선택해주세요'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
              <Button onClick={handleSave} disabled={saving || selectedCount === 0 || !testContent.trim()}>
                {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 저장 중...</> : `${selectedCount}명 저장`}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
