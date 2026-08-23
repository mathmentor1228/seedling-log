import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarCheck, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CONSULTATION_SCHEDULE_LABEL,
  consultationSlotsForDate,
  isValidConsultationSlot,
} from '@/lib/consultationSchedule';

const SUBJECTS = ['수학', '영어', '국어', '과학'];

export default function ConsultationReservationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const intakeMode = Boolean(token);
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(Boolean(token));
  const [doneToken, setDoneToken] = useState('');
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    studentName: '', guardianName: '', guardianPhone: '', studentPhone: '',
    school: '', schoolLevel: '중', gradeYear: '1', subjects: [] as string[],
    learningConcern: '', referralSource: '', preferredDate: '', preferredTime: '',
  });

  const title = useMemo(() => intakeMode ? '상담 전 학생정보 입력' : '더멘토학원 상담 예약', [intakeMode]);
  const timeOptions = useMemo(() => consultationSlotsForDate(form.preferredDate), [form.preferredDate]);
  const set = (key: string, value: string | string[]) => setForm((v) => ({ ...v, [key]: value }));
  const toggleSubject = (subject: string) => set('subjects', form.subjects.includes(subject)
    ? form.subjects.filter((v) => v !== subject) : [...form.subjects, subject]);

  useEffect(() => {
    if (!token) return;
    supabase.functions.invoke('consultation-intake', { body: { action: 'get', token } })
      .then(({ data, error }) => {
        if (error || data?.error || !data?.lead) throw error || new Error(data?.error);
        const lead = data.lead;
        setForm((v) => ({
          ...v,
          studentName: lead.student_name || '', school: lead.school || '',
          schoolLevel: lead.school_level || '중', gradeYear: String(lead.grade_year || 1),
          subjects: lead.subjects || [], learningConcern: lead.learning_concern || '',
        }));
      })
      .catch(() => toast.error('사전정보 링크를 확인하지 못했습니다. 학원에 문의해주세요.'))
      .finally(() => setPrefillLoading(false));
  }, [token]);

  async function submit() {
    if (!intakeMode && (!form.studentName.trim() || form.guardianPhone.replace(/\D/g, '').length < 10 || !form.preferredDate || !isValidConsultationSlot(form.preferredDate, form.preferredTime))) {
      toast.error('학생 이름·연락처와 예약 가능한 날짜·시간을 확인해주세요.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('consultation-intake', {
        body: { action: intakeMode ? 'update-intake' : 'create', token, ...form },
      });
      if (error || data?.error) throw error || new Error(data.error);
      if (data?.token) setDoneToken(data.token);
      setDone(true);
    } catch {
      toast.error('제출하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  if (done) return (
    <main className="min-h-screen bg-muted/30 px-4 py-10 flex items-start justify-center">
      <Card className="w-full max-w-lg mt-10"><CardContent className="py-10 text-center space-y-3">
        <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
        <h1 className="text-xl font-bold">{intakeMode ? '학생정보를 제출했습니다' : '상담 신청이 접수되었습니다'}</h1>
        <p className="text-sm text-muted-foreground">
          {intakeMode ? '제출한 내용을 확인한 뒤 상담을 진행합니다.' : '학원에서 일정을 확인한 뒤 확정 연락을 드립니다.'}
        </p>
        {doneToken && <p className="text-xs text-muted-foreground break-all">사전정보 입력 링크: {location.origin}/consultation?token={doneToken}</p>}
      </CardContent></Card>
    </main>
  );

  if (prefillLoading) return <main className="min-h-screen bg-muted/30 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></main>;

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 flex justify-center">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center"><CalendarCheck className="w-9 h-9 text-primary mx-auto" /><CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">입력 시간 약 2분 · 상담과 학습 방향 설정에만 사용합니다.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {intakeMode && form.studentName && <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm"><b>{form.studentName}</b> 학생의 상담 전 정보입니다. 예약 때 적은 내용은 미리 채워두었습니다.</div>}
          {!intakeMode && <>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="학생 이름 *"><Input value={form.studentName} onChange={(e) => set('studentName', e.target.value)} /></Field>
              <Field label="보호자 이름"><Input value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} /></Field>
            </div>
            <Field label="보호자 연락처 *"><Input inputMode="tel" value={form.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} placeholder="010-0000-0000" /></Field>
          </>}
          {intakeMode && <Field label="학생 연락처"><Input inputMode="tel" value={form.studentPhone} onChange={(e) => set('studentPhone', e.target.value)} /></Field>}
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="학교"><Input value={form.school} onChange={(e) => set('school', e.target.value)} /></Field>
            <Field label="학교급"><Select value={form.schoolLevel} onValueChange={(v) => set('schoolLevel', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['초','중','고'].map(v => <SelectItem key={v} value={v}>{v}등학교</SelectItem>)}</SelectContent></Select></Field>
            <Field label="학년"><Select value={form.gradeYear} onValueChange={(v) => set('gradeYear', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5,6].slice(0, form.schoolLevel === '초' ? 6 : 3).map(v => <SelectItem key={v} value={String(v)}>{v}학년</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <Field label="상담 과목"><div className="flex gap-4 flex-wrap">{SUBJECTS.map(s => <label key={s} className="flex items-center gap-2 text-sm"><Checkbox checked={form.subjects.includes(s)} onCheckedChange={() => toggleSubject(s)} />{s}</label>)}</div></Field>
          <Field label="현재 가장 고민되는 점"><Textarea rows={4} value={form.learningConcern} onChange={(e) => set('learningConcern', e.target.value)} placeholder="성적, 학습습관, 과제 수행 등 상담에서 확인하고 싶은 내용을 적어주세요." /></Field>
          {!intakeMode && <>
            <div className="rounded-lg border bg-primary/5 px-3 py-2 text-sm">
              <b>상담 가능 시간</b><br />{CONSULTATION_SCHEDULE_LABEL}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="희망 날짜 *"><Input type="date" value={form.preferredDate} min={new Date().toLocaleDateString('sv-SE')} onChange={(e) => setForm((v) => ({ ...v, preferredDate: e.target.value, preferredTime: '' }))} /></Field>
              <Field label="희망 시간 *"><Select value={form.preferredTime} onValueChange={(v) => set('preferredTime', v)} disabled={!form.preferredDate || timeOptions.length === 0}><SelectTrigger><SelectValue placeholder={form.preferredDate && timeOptions.length === 0 ? '선택한 요일은 상담 불가' : '시간 선택'} /></SelectTrigger><SelectContent>{timeOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            {form.preferredDate && timeOptions.length === 0 && <p className="text-xs text-destructive">상담은 월·화·수·목요일에만 예약할 수 있습니다.</p>}
            <Field label="학원을 알게 된 경로"><Input value={form.referralSource} onChange={(e) => set('referralSource', e.target.value)} placeholder="소개, 네이버, 인스타그램 등" /></Field>
          </>}
          <Button className="w-full" onClick={submit} disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />처리 중</> : intakeMode ? '학생정보 제출' : '상담 신청'}</Button>
          <p className="text-[11px] text-muted-foreground">상담 일정은 학원 확인 후 확정됩니다. 입력 정보는 상담 및 등록 안내 목적으로만 사용합니다.</p>
        </CardContent>
      </Card>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}
