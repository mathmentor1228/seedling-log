// EXAM-HUB-A ① 시험 정보 — 과목별 시험일·교시·범위·교과서·수행평가. 자동 수집 초안은 "확인 필요" 배지.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Pencil, Save, Settings2, X } from 'lucide-react';
import { normalizeSchool } from '@/components/exam-board/cycleUtils';
import type { ArchiveRow, Cycle, CycleSubject, TextbookRow } from './examHubUtils';

const db = supabase as any;
const SOURCE_LABEL: Record<string, string> = { manual: '직접 입력', archive: '내신 자료실', neis: '나이스', homepage: '학교 홈페이지' };
const fmtDate = (d?: string | null) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '-');

interface Props {
  cycle: Cycle;
  subjects: CycleSubject[];
  textbooks: TextbookRow[];
  archives: ArchiveRow[];
  canEdit: boolean;
  isAdmin: boolean;
  onChanged: () => void;
}

export function ExamInfoTab({ cycle, subjects, textbooks, archives, canEdit, isAdmin, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ exam_date: string; period: string; scope: string }>({ exam_date: '', period: '', scope: '' });
  const [saving, setSaving] = useState(false);

  const school = normalizeSchool(cycle.school_name);
  const textbookBySubject = useMemo(() => {
    const m = new Map<string, TextbookRow>();
    for (const t of textbooks) {
      if (t.school_name !== school) continue;
      if (t.grade != null && t.grade !== cycle.grade_year) continue;
      const prev = m.get(t.subject);
      // 학년이 명시된 것, 연도가 최신인 것 우선
      if (!prev || (t.grade != null && prev.grade == null) || ((t.year || 0) > (prev.year || 0))) m.set(t.subject, t);
    }
    return m;
  }, [textbooks, school, cycle.grade_year]);

  const archiveBySubject = useMemo(() => {
    const m = new Map<string, ArchiveRow>();
    for (const a of archives) {
      if (a.school_name !== school || a.grade_year !== cycle.grade_year) continue;
      if (a.academic_year !== cycle.academic_year || a.semester !== cycle.semester || a.exam_type !== cycle.exam_type) continue;
      m.set(a.subject, a);
    }
    return m;
  }, [archives, school, cycle]);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const list = subjects.map(s => ({ subject: s.subject, cs: s as CycleSubject | null }));
    subjects.forEach(s => seen.add(s.subject));
    // 사이클 과목 테이블에 없지만 자료실에 수행평가·범위가 있는 과목도 보여준다
    archiveBySubject.forEach((_, subject) => { if (!seen.has(subject)) list.push({ subject, cs: null }); });
    return list.sort((a, b) => a.subject.localeCompare(b.subject, 'ko'));
  }, [subjects, archiveBySubject]);

  function startEdit(cs: CycleSubject) {
    setEditing(cs.id);
    setDraft({ exam_date: cs.exam_date || '', period: cs.period != null ? String(cs.period) : '', scope: cs.scope || '' });
  }
  async function saveEdit(cs: CycleSubject) {
    setSaving(true);
    const { error } = await db.from('exam_cycle_subjects').update({
      exam_date: draft.exam_date || null,
      period: draft.period ? Number(draft.period) : null,
      scope: draft.scope || null,
      source: 'manual',
      updated_at: new Date().toISOString(),
    }).eq('id', cs.id);
    setSaving(false);
    if (error) { toast.error('저장 실패: ' + error.message); return; }
    toast.success(`${cs.subject} 저장`);
    setEditing(null);
    onChanged();
  }
  async function confirmCycle() {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from('exam_cycles').update({ status: 'confirmed', confirmed_by: user?.id ?? null, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', cycle.id);
    if (error) { toast.error('확정 실패: ' + error.message); return; }
    toast.success('사이클 확정');
    onChanged();
  }

  const draftCount = subjects.filter(s => s.source !== 'manual' && s.source !== 'archive').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">시험 기간</span>
        <span className="font-medium">{cycle.start_date ? `${fmtDate(cycle.start_date)} ~ ${fmtDate(cycle.end_date || cycle.start_date)}` : '미정'}</span>
        <Badge variant={cycle.status === 'confirmed' ? 'default' : 'outline'}>{cycle.status === 'confirmed' ? '확정' : '초안 · 확인 필요'}</Badge>
        {cycle.source && <span className="text-xs text-muted-foreground">출처: {SOURCE_LABEL[cycle.source] || cycle.source}</span>}
        {cycle.source_url && (
          <a href={cycle.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            원문 <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <span className="flex-1" />
        {isAdmin && cycle.status !== 'confirmed' && (
          <Button size="sm" variant="outline" onClick={confirmCycle}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />확정</Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/exam-schools"><Settings2 className="w-3.5 h-3.5 mr-1" />학교·일정 설정</Link>
        </Button>
      </div>

      {draftCount > 0 && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          자동 수집된 과목 정보 {draftCount}건이 있습니다. 내용을 확인한 뒤 수정하면 "직접 입력"으로 바뀝니다.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">
          아직 과목 정보가 없습니다. <Link to="/admin/exam-schools" className="text-primary underline">학교·시험 일정</Link>에서 과목을 채우거나 자동 감시를 실행하세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px]">과목</TableHead>
                <TableHead className="w-[110px]">시험일·교시</TableHead>
                <TableHead>범위</TableHead>
                <TableHead className="w-[170px]">교과서(출판사)</TableHead>
                <TableHead className="w-[220px]">수행평가</TableHead>
                <TableHead className="w-[96px]">출처</TableHead>
                {canEdit && <TableHead className="w-[60px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ subject, cs }) => {
                const tb = textbookBySubject.get(subject);
                const ar = archiveBySubject.get(subject);
                const isEditing = cs && editing === cs.id;
                const needsCheck = cs && cs.source !== 'manual' && cs.source !== 'archive';
                return (
                  <TableRow key={subject} className={needsCheck ? 'bg-amber-50/50 dark:bg-amber-950/10' : undefined}>
                    <TableCell className="font-medium align-top">{subject}</TableCell>
                    <TableCell className="align-top">
                      {isEditing ? (
                        <div className="space-y-1">
                          <Input type="date" value={draft.exam_date} onChange={e => setDraft(d => ({ ...d, exam_date: e.target.value }))} className="h-8 text-xs" />
                          <Input type="number" min={1} max={8} placeholder="교시" value={draft.period} onChange={e => setDraft(d => ({ ...d, period: e.target.value }))} className="h-8 text-xs" />
                        </div>
                      ) : (
                        <div className="text-sm">
                          {cs?.exam_date ? fmtDate(cs.exam_date) : <span className="text-muted-foreground">-</span>}
                          {cs?.period != null && <span className="ml-1 text-xs text-muted-foreground">{cs.period}교시</span>}
                          {cs?.exam_time && <div className="text-xs text-muted-foreground">{cs.exam_time}</div>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {isEditing ? (
                        <Textarea rows={3} value={draft.scope} onChange={e => setDraft(d => ({ ...d, scope: e.target.value }))} className="text-xs" placeholder="시험 범위" />
                      ) : (
                        <div className="text-sm whitespace-pre-wrap">
                          {cs?.scope || ar?.exam_scope || <span className="text-muted-foreground">범위 미입력</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {tb ? (
                        <div>
                          <div>{tb.publisher || '-'}</div>
                          {tb.textbook_name && <div className="text-xs text-muted-foreground">{tb.textbook_name}</div>}
                        </div>
                      ) : ar?.textbook_publisher ? ar.textbook_publisher : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="align-top text-xs whitespace-pre-wrap">
                      {ar?.performance_assessment_info || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="align-top text-xs">
                      {cs ? (
                        <div className="space-y-1">
                          <Badge variant={needsCheck ? 'outline' : 'secondary'} className="text-[11px]">
                            {needsCheck ? '확인 필요' : SOURCE_LABEL[cs.source] || cs.source}
                          </Badge>
                          {cs.source_url && (
                            <a href={cs.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                              원문 <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ) : <span className="text-muted-foreground">자료실</span>}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="align-top">
                        {cs && (isEditing ? (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving} onClick={() => saveEdit(cs)}><Save className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(null)}><X className="w-3.5 h-3.5" /></Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(cs)}><Pencil className="w-3.5 h-3.5" /></Button>
                        ))}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        교과서는 학교 교과서 등록(자료실) 자료를, 수행평가는 내신 자료실의 해당 학기 기록을 보여줍니다. 수행평가 구조화는 D단계에서 이 표로 통합됩니다.
      </p>
    </div>
  );
}
