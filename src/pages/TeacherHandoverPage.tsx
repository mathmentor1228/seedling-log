// TEACHER-HANDOVER-V1 — 원장용 선생님별 담당 학생 조회 및 일괄 인계
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowRight, Loader2, RefreshCw, Search, UserCog } from 'lucide-react';
import { buildTeacherChangeNote } from '@/lib/teacherChangeLog';
import { matchesHandoverQuery, validateHandover, type HandoverRow } from '@/lib/teacherHandover';
import { getTodayKST } from '@/lib/utils';

interface TeacherOpt { id: string; name: string }

function TeacherHandoverInner() {
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState<TeacherOpt[]>([]);
  const [rows, setRows] = useState<HandoverRow[]>([]);
  const [fromTeacherId, setFromTeacherId] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const [open, setOpen] = useState(false);
  const [toTeacherId, setToTeacherId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(getTodayKST());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: roleRows }, { data: profs }] = await Promise.all([
        supabase.from('user_roles').select('user_id, role').in('role', ['admin', 'teacher']),
        supabase.from('profiles').select('id, full_name').not('full_name', 'is', null).order('full_name'),
      ]);
      const ids = new Set((roleRows || []).map((r: any) => r.user_id));
      setTeachers((profs || []).filter((p: any) => ids.has(p.id)).map((p: any) => ({ id: p.id, name: p.full_name })));
    })();
  }, []);

  const loadRoster = async (teacherId: string) => {
    if (!teacherId) { setRows([]); return; }
    setLoading(true);
    setSelected([]);
    const { data, error } = await supabase
      .from('student_courses')
      .select('id, student_id, teacher_id, is_active, students(name, grade, enrollment_status), course_policies(subject, course_name)')
      .eq('teacher_id', teacherId)
      .eq('is_active', true);
    if (error) toast.error('명단을 불러오지 못했습니다');
    else {
      setRows((data || [])
        .filter((r: any) => r.students && r.students.enrollment_status !== '퇴원')
        .map((r: any) => ({
          courseId: r.id,
          studentId: r.student_id,
          studentName: r.students?.name || '(이름 없음)',
          grade: r.students?.grade ?? null,
          subject: r.course_policies?.subject ?? null,
          courseName: r.course_policies?.course_name ?? null,
          teacherId: r.teacher_id,
        }))
        .sort((a, b) => (a.subject || '').localeCompare(b.subject || '') || a.studentName.localeCompare(b.studentName)));
    }
    setLoading(false);
  };

  useEffect(() => { loadRoster(fromTeacherId); /* eslint-disable-next-line */ }, [fromTeacherId]);

  const filtered = useMemo(() => rows.filter((r) => matchesHandoverQuery(r, query)), [rows, query]);
  const allChecked = filtered.length > 0 && filtered.every((r) => selected.includes(r.courseId));

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const openDialog = () => {
    const err = validateHandover({ selected, toTeacherId: 'x', fromTeacherId, effectiveDate });
    if (err && err !== '기존 선생님과 동일합니다') { toast.error(err); return; }
    setToTeacherId('');
    setEffectiveDate(getTodayKST());
    setReason('');
    setOpen(true);
  };

  const runHandover = async () => {
    const err = validateHandover({ selected, toTeacherId, fromTeacherId, effectiveDate });
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const actor = userRes?.user?.id || null;
      const fromName = teachers.find((t) => t.id === fromTeacherId)?.name || null;
      const toName = teachers.find((t) => t.id === toTeacherId)?.name || null;
      const targets = rows.filter((r) => selected.includes(r.courseId));

      let ok = 0;
      const failed: string[] = [];
      for (const row of targets) {
        try {
          const { error: hErr } = await supabase.from('student_course_teacher_changes').insert({
            student_id: row.studentId,
            student_course_id: row.courseId,
            subject: row.subject,
            from_teacher_id: fromTeacherId,
            to_teacher_id: toTeacherId,
            from_teacher_name: fromName,
            to_teacher_name: toName,
            effective_date: effectiveDate,
            reason: reason.trim() || '원장 일괄 인계',
            changed_by: actor,
          } as any);
          if (hErr) throw hErr;

          const { error: uErr } = await supabase.from('student_courses')
            .update({ teacher_id: toTeacherId } as any).eq('id', row.courseId);
          if (uErr) throw uErr;

          if (row.subject) {
            await supabase.from('student_subject_teachers').delete()
              .eq('student_id', row.studentId).eq('subject', row.subject).eq('teacher_id', fromTeacherId);
            await supabase.from('student_subject_teachers').upsert(
              { student_id: row.studentId, subject: row.subject, teacher_id: toTeacherId } as any,
              { onConflict: 'student_id,subject,teacher_id' }
            );
          }

          if (actor) {
            const { error: nErr } = await supabase.from('team_notes').insert(
              buildTeacherChangeNote({
                studentId: row.studentId,
                subject: row.subject,
                fromTeacherName: fromName,
                toTeacherName: toName,
                effectiveDate,
                reason: reason.trim() || '원장 일괄 인계',
              }, actor) as any
            );
            if (nErr) console.warn('[handover note]', nErr.message);
          }
          ok += 1;
        } catch (e: any) {
          failed.push(`${row.studentName}(${row.subject || '과목 미지정'})`);
          console.error('[handover]', row, e);
        }
      }

      if (failed.length) toast.warning(`${ok}건 인계 완료 · 실패 ${failed.length}건: ${failed.join(', ')}`);
      else toast.success(`${ok}건을 ${effectiveDate}부터 ${toName} 선생님께 인계했습니다`);
      setOpen(false);
      loadRoster(fromTeacherId);
    } catch (e: any) {
      toast.error(e?.message || '인계 처리 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <UserCog className="w-5 h-5" /> 담당 인계
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            선생님별 담당 학생을 조회하고, 선택한 학생을 지정한 날짜부터 새 선생님께 넘깁니다. 이전 수업 기록의 담당자 표기는 그대로 보존됩니다.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadRoster(fromTeacherId)} disabled={loading || !fromTeacherId}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> 새로고침
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">기존 담당 선생님</Label>
            <Select value={fromTeacherId} onValueChange={setFromTeacherId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="선생님 선택" /></SelectTrigger>
              <SelectContent>
                {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">검색 (학생·과목·학년)</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="예: 영어 고2" className="pl-7 h-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      {!fromTeacherId ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">선생님을 선택하면 담당 학생 명단이 표시됩니다.</CardContent></Card>
      ) : loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">담당 학생이 없습니다.</CardContent></Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allChecked}
                onCheckedChange={(v) => setSelected(v ? filtered.map((r) => r.courseId) : [])}
              />
              전체 선택 ({filtered.length}건 · 선택 {selected.length}건)
            </label>
            <Button size="sm" disabled={selected.length === 0} onClick={openDialog}>
              선택 학생 인계
            </Button>
          </div>

          <div className="space-y-2">
            {filtered.map((r) => (
              <Card key={r.courseId} className={selected.includes(r.courseId) ? 'border-primary/60' : ''}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Checkbox checked={selected.includes(r.courseId)} onCheckedChange={() => toggle(r.courseId)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold">{r.studentName}</span>
                      {r.grade && <Badge variant="outline" className="text-[10px]">{r.grade}</Badge>}
                      {r.subject && <Badge variant="outline" className="text-[10px]">{r.subject}</Badge>}
                    </div>
                    {r.courseName && <p className="text-xs text-muted-foreground truncate">{r.courseName}</p>}
                  </div>
                  <Button size="sm" variant="ghost" className="text-xs shrink-0"
                    onClick={() => navigate(`/students/${r.studentId}/karte`)}>
                    카르테
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>선택 학생 담당 인계</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
              {teachers.find((t) => t.id === fromTeacherId)?.name || '미지정'}
              <ArrowRight className="w-3 h-3" />
              <span className="text-foreground font-medium">{teachers.find((t) => t.id === toTeacherId)?.name || '새 담당 선택'}</span>
              · {selected.length}건
            </p>
            <div>
              <Label className="text-[11px] text-muted-foreground">새 담당 선생님</Label>
              <Select value={toTeacherId} onValueChange={setToTeacherId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="선생님 선택" /></SelectTrigger>
                <SelectContent>
                  {teachers.filter((t) => t.id !== fromTeacherId).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">적용 시작일</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">사유 (선택)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="예: 퇴사 인계" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              적용일부터 새 선생님 명단에 표시되고, 학생 카르테와 담당 변경 이력에 자동 기록됩니다.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>취소</Button>
            <Button onClick={runHandover} disabled={saving}>
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} 인계 실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TeacherHandoverPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <TeacherHandoverInner />
    </ProtectedRoute>
  );
}
