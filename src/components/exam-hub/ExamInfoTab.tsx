// EXAM-HUB-A ① 시험 정보 — 과목별 시험일·교시·범위·교과서·수행평가 + 학교 공지(자동 수집 글, AI 읽기).
// 자동 수집 값은 "확인 필요" 배지. 원장이 보고 수정하면 '직접 입력'이 된다. (A-2: 학교 공지 섹션 추가)
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Bell, CheckCircle2, Eraser, ExternalLink, Loader2, Pencil, RefreshCw, Save, Settings2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeSchool } from '@/components/exam-board/cycleUtils';
import type { ArchiveRow, Cycle, CycleSubject, TextbookRow, WatchPost } from './examHubUtils';
import { PerfItemsCell } from './PerformanceItems';
import { HelpTip } from '@/components/ui/help-tip';

const db = supabase as any;
const SOURCE_LABEL: Record<string, string> = { manual: '직접 입력', archive: '내신 자료실', neis: '나이스', homepage: '학교 홈페이지', record: '성적·시험지 기록(사이클 없음)' };
const POST_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: '새 글', cls: 'bg-primary/10 text-primary' },
  extracted: { label: 'AI 읽음', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  applied: { label: '반영', cls: 'bg-muted text-muted-foreground' },
  ignored: { label: '무시', cls: 'bg-muted text-muted-foreground' },
};
const fmtDate = (d?: string | null) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '-');
const READABLE = /\.(pdf|jpg|jpeg|png|webp)$/i;

interface Props {
  cycle: Cycle;
  subjects: CycleSubject[];
  textbooks: TextbookRow[];
  archives: ArchiveRow[];
  posts: WatchPost[];
  canEdit: boolean;
  isAdmin: boolean;
  onChanged: () => void;
}

export function ExamInfoTab({ cycle, subjects, textbooks, archives, posts, canEdit, isAdmin, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ exam_date: string; period: string; scope: string }>({ exam_date: '', period: '', scope: '' });
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const school = normalizeSchool(cycle.school_name);
  const textbookBySubject = useMemo(() => {
    const m = new Map<string, TextbookRow>();
    for (const t of textbooks) {
      if (t.school_name !== school) continue;
      if (t.grade != null && t.grade !== cycle.grade_year) continue;
      const prev = m.get(t.subject);
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
    archiveBySubject.forEach((_, subject) => { if (!seen.has(subject)) list.push({ subject, cs: null }); });
    return list.sort((a, b) => a.subject.localeCompare(b.subject, 'ko'));
  }, [subjects, archiveBySubject]);

  // 이 학교의 공지 (사이클에 연결된 글 우선, 그다음 최근 글)
  const schoolPosts = useMemo(() => posts
    .filter(p => normalizeSchool(p.school_name) === school)
    .sort((a, b) => (a.cycle_id === cycle.id ? -1 : 0) - (b.cycle_id === cycle.id ? -1 : 0) || (b.posted_on || b.created_at).localeCompare(a.posted_on || a.created_at))
    .slice(0, 8), [posts, school, cycle.id]);
  const newPosts = schoolPosts.filter(p => p.status === 'new').length;

  function startEdit(cs: CycleSubject) {
    setEditing(cs.id);
    setDraft({ exam_date: cs.exam_date || '', period: cs.period != null ? String(cs.period) : '', scope: cs.scope || '' });
  }
  async function saveEdit(cs: CycleSubject) {
    setSaving(true);
    const { error } = await db.from('exam_cycle_subjects').update({
      exam_date: draft.exam_date || null, period: draft.period ? Number(draft.period) : null, scope: draft.scope || null,
      source: 'manual', updated_at: new Date().toISOString(),
    }).eq('id', cs.id);
    setSaving(false);
    if (error) { toast.error('저장 실패: ' + error.message); return; }
    toast.success(`${cs.subject} 저장`); setEditing(null); onChanged();
  }
  async function confirmCycle() {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from('exam_cycles').update({ status: 'confirmed', confirmed_by: user?.id ?? null, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', cycle.id);
    if (error) { toast.error('확정 실패: ' + error.message); return; }
    toast.success('사이클 확정'); onChanged();
  }
  async function extractPost(p: WatchPost) {
    setExtracting(p.id);
    try {
      const { data, error } = await supabase.functions.invoke('extract-school-notice', { body: { post_id: p.id, grade: cycle.grade_year } });
      if (error) throw new Error(error.message);
      const r = data?.report?.[0];
      if (!r || r.error) throw new Error(r?.error || '결과 없음');
      toast.success(`${cycle.grade_year}학년 기준 읽기 완료 — 일정 ${r.schedule}건 · 범위 ${r.scope}건 · 수행 ${r.performance}건 → 과목 ${r.subjects}개 채움${r.ungraded ? ` · 학년 미상 ${r.ungraded}건 건너뜀` : ''}${r.warnings?.length ? ` (주의 ${r.warnings.length})` : ''}`);
      onChanged();
    } catch (e: any) {
      toast.error('AI 읽기 실패: ' + (e.message || e));
    } finally { setExtracting(null); }
  }
  async function clearAuto(cs: CycleSubject) {
    if (!window.confirm(`${cs.subject}의 자동 수집 값(시험일·시간·범위·수행평가)을 비울까요? 다시 'AI로 읽어 채우기'를 누르면 이 학년 기준으로 다시 채워집니다.`)) return;
    const { error } = await db.from('exam_cycle_subjects').update({ exam_date: null, exam_time: null, period: null, scope: null, notes: null, updated_at: new Date().toISOString() }).eq('id', cs.id);
    if (error) { toast.error('비우기 실패: ' + error.message); return; }
    toast.success(`${cs.subject} 자동값 비움`); onChanged();
  }
  async function setPostStatus(p: WatchPost, status: string) {
    const { error } = await db.from('school_watch_log').update({ status }).eq('id', p.id);
    if (error) toast.error('변경 실패: ' + error.message); else onChanged();
  }
  async function runWatch() {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('watch-school-exams', { body: cycle.school_id ? { school_id: cycle.school_id } : {} });
      if (error) throw new Error(error.message);
      const n = (data?.schools || []).reduce((s: number, x: any) => s + (x.boards?.newPosts || 0), 0);
      toast.success(`확인 완료 — 새 글 ${n}건${data?.extraction?.processed ? ` · AI 읽음 ${data.extraction.processed}건` : ''}`);
      onChanged();
    } catch (e: any) { toast.error('확인 실패: ' + (e.message || e)); } finally { setChecking(false); }
  }

  const draftCount = subjects.filter(s => s.source !== 'manual' && s.source !== 'archive').length;
  const perfLines = (cs: CycleSubject | null) => (cs?.notes || '').split('\n').filter(l => l.startsWith('수행평가:')).map(l => l.replace(/^수행평가:\s*/, ''));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">시험 기간</span>
        <span className="font-medium">{cycle.start_date ? `${fmtDate(cycle.start_date)} ~ ${fmtDate(cycle.end_date || cycle.start_date)}` : '미정'}</span>
        <Badge variant={cycle.status === 'confirmed' ? 'default' : 'outline'}>{cycle.status === 'confirmed' ? '확정' : '초안 · 확인 필요'}</Badge>
        {cycle.source && <span className="text-xs text-muted-foreground">출처: {SOURCE_LABEL[cycle.source] || cycle.source}</span>}
        {cycle.source_url && (
          <a href={cycle.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">원문 <ExternalLink className="w-3 h-3" /></a>
        )}
        <span className="flex-1" />
        {isAdmin && cycle.status !== 'confirmed' && (
          <Button size="sm" variant="outline" onClick={confirmCycle}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />확정</Button>
        )}
        <Button asChild size="sm" variant="ghost"><Link to="/admin/exam-schools"><Settings2 className="w-3.5 h-3.5 mr-1" />학교·일정 설정</Link></Button>
      </div>

      {draftCount > 0 && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          자동 수집된 과목 정보 {draftCount}건이 있습니다. 내용을 확인한 뒤 수정하면 "직접 입력"으로 바뀝니다.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">
          아직 과목 정보가 없습니다. 아래 학교 공지에서 "AI로 읽어 채우기"를 누르거나 <Link to="/admin/exam-schools" className="text-primary underline">학교·시험 일정</Link>에서 과목을 채우세요.
        </div>
      ) : (
        <>
        {/* 모바일: 과목 카드 (표는 휴대폰에서 글자가 세로로 찌그러짐) */}
        <div className="md:hidden space-y-2">
          {rows.map(({ subject, cs }) => {
            const tb = textbookBySubject.get(subject);
            const ar = archiveBySubject.get(subject);
            const isEditing = cs && editing === cs.id;
            const needsCheck = cs && cs.source !== 'manual' && cs.source !== 'archive';
            const perf = perfLines(cs);
            return (
              <div key={subject} className={cn('rounded-lg border p-3 space-y-1.5', needsCheck && 'bg-amber-50/50 dark:bg-amber-950/10')}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{subject}</span>
                  <span className="text-sm">{cs?.exam_date ? fmtDate(cs.exam_date) : <span className="text-muted-foreground">시험일 -</span>}{cs?.period != null ? ` ${cs.period}교시` : ''}{cs?.exam_time ? ` ${cs.exam_time}` : ''}</span>
                  {needsCheck && <Badge variant="outline" className="text-[10px]">확인 필요</Badge>}
                  <span className="flex-1" />
                  {canEdit && cs && !isEditing && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(cs)} title="수정"><Pencil className="w-3.5 h-3.5" /></Button>}
                </div>
                {isEditing ? (
                  <div className="space-y-1.5">
                    <div className="flex gap-1.5">
                      <Input type="date" value={draft.exam_date} onChange={e => setDraft(d => ({ ...d, exam_date: e.target.value }))} className="h-8 text-xs" />
                      <Input type="number" min={1} max={8} placeholder="교시" value={draft.period} onChange={e => setDraft(d => ({ ...d, period: e.target.value }))} className="h-8 w-20 text-xs" />
                    </div>
                    <Textarea rows={3} value={draft.scope} onChange={e => setDraft(d => ({ ...d, scope: e.target.value }))} className="text-xs" placeholder="시험 범위" />
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>취소</Button>
                      <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => saveEdit(cs!)}>저장</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-sm"><span className="text-xs text-muted-foreground mr-1">범위</span><ScopeText text={cs?.scope || ar?.exam_scope || null} /></div>
                    <div className="text-xs text-muted-foreground">교과서 {tb ? `${tb.publisher || '-'}${tb.textbook_name ? ` · ${tb.textbook_name}` : ''}` : ar?.textbook_publisher || '-'}</div>
                    <PerfItemsCell lines={perf} fallback={ar?.performance_assessment_info || null} />
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="hidden md:block overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px]">과목</TableHead>
                <TableHead className="w-[120px]">시험일·시간</TableHead>
                <TableHead>범위</TableHead>
                <TableHead className="w-[160px]">교과서(출판사)</TableHead>
                <TableHead className="w-[200px]">수행평가</TableHead>
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
                const perf = perfLines(cs);
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
                        <ScopeText text={cs?.scope || ar?.exam_scope || null} />
                      )}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {tb ? (<div><div>{tb.publisher || '-'}</div>{tb.textbook_name && <div className="text-xs text-muted-foreground">{tb.textbook_name}</div>}</div>)
                        : ar?.textbook_publisher ? ar.textbook_publisher : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="align-top">
                      <PerfItemsCell lines={perf} fallback={ar?.performance_assessment_info || null} />
                    </TableCell>
                    <TableCell className="align-top text-xs">
                      {cs ? (
                        <div className="space-y-1">
                          <Badge variant={needsCheck ? 'outline' : 'secondary'} className="text-[11px]">{needsCheck ? '확인 필요' : SOURCE_LABEL[cs.source] || cs.source}</Badge>
                          {cs.source_url && <a href={cs.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">원문 <ExternalLink className="w-3 h-3" /></a>}
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
                          <div className="flex flex-col gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(cs)} title="수정"><Pencil className="w-3.5 h-3.5" /></Button>
                            {needsCheck && <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => clearAuto(cs)} title="자동값 지우기"><Eraser className="w-3.5 h-3.5" /></Button>}
                          </div>
                        ))}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      {/* 학교 공지 — 매일 06:00 자동 수집 + AI 읽기 */}
      <div className="rounded-md border">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{cycle.school_name} 학교 공지</span>
          {newPosts > 0 && <Badge variant="outline" className="text-[11px] text-primary border-primary/40">새 글 {newPosts}</Badge>}
          <span className="text-xs text-muted-foreground hidden md:inline">매일 06:00 홈페이지·나이스 자동 확인 · 첨부 PDF는 AI가 읽어 위 표에 초안으로 채웁니다</span>
          <span className="flex-1" />
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={checking} onClick={runWatch}>
              {checking ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}지금 확인
            </Button>
          )}
        </div>
        {schoolPosts.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">아직 모아온 글이 없습니다. 학교가 홈페이지에 시험 범위·시간표·평가계획을 올리면 여기 나타납니다.</div>
        ) : (
          <ul className="divide-y">
            {schoolPosts.map(p => {
              const st = POST_STATUS[p.status] || POST_STATUS.new;
              const readable = (p.attachments || []).some(a => READABLE.test(a.url));
              const sum = p.extracted?.summary;
              return (
                <li key={p.id} className={cn('px-3 py-2 flex flex-wrap items-center gap-2', p.status === 'ignored' && 'opacity-60')}>
                  <span className={cn('rounded px-1.5 py-0.5 text-[11px] shrink-0', st.cls)}>{st.label}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{p.posted_on || p.created_at.slice(0, 10)}</span>
                  <a href={p.post_url ?? '#'} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline inline-flex items-center gap-1 min-w-0">
                    <span className="truncate max-w-[420px]">{p.title}</span><ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  {(p.attachments || []).map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer" className={cn('text-[11px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/70 max-w-[200px] truncate', !READABLE.test(a.url) && 'line-through decoration-muted-foreground/50')} title={a.name || a.url}>
                      {a.name || `첨부 ${i + 1}`}
                    </a>
                  ))}
                  {sum && (
                    <span className="text-[11px] text-muted-foreground">
                      일정 {sum.schedule} · 범위 {sum.scope} · 수행 {sum.performance} → 과목 {sum.subjects}개{sum.warnings?.length ? ` · 주의 ${sum.warnings.length}` : ''}
                    </span>
                  )}
                  {p.extracted?.error && <span className="text-[11px] text-destructive">{p.extracted.error}</span>}
                  {canEdit && (
                    <div className="ml-auto flex gap-1 shrink-0">
                      {readable && p.status !== 'ignored' && (
                        <Button size="sm" variant={p.status === 'new' ? 'default' : 'outline'} className="h-7 text-xs" disabled={extracting === p.id} onClick={() => extractPost(p)}>
                          {extracting === p.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                          {p.status === 'extracted' ? '다시 읽기' : 'AI로 읽어 채우기'}
                        </Button>
                      )}
                      {p.status !== 'applied' && p.status !== 'ignored' && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPostStatus(p, 'applied')}>반영했음</Button>}
                      {p.status === 'new' && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPostStatus(p, 'ignored')}>무시</Button>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="text-xs"><HelpTip>교과서는 학교 교과서 등록(자료실) 자료를, 수행평가는 학교 공지에서 AI가 읽은 내용(없으면 내신 자료실 기록)을 보여줍니다. 수행평가는 비율 높은 순이며 빨강 = 20% 이상, 노랑 = 서술·논술형입니다. hwp·xlsx 첨부는 AI가 읽지 못하므로 직접 열어 옮겨 적어야 합니다.</HelpTip></div>
    </div>
  );
}

/** 긴 범위(세부 과목 여러 개)는 앞 3줄만 보여주고 펼친다 */
function ScopeText({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  if (!text) return <span className="text-sm text-muted-foreground">범위 미입력</span>;
  const lines = text.split('\n');
  const long = lines.length > 3 || text.length > 220;
  const shown = open || !long ? text : lines.slice(0, 3).join('\n').slice(0, 220) + '…';
  return (
    <div className="text-sm whitespace-pre-wrap">
      {shown}
      {long && <button type="button" onClick={() => setOpen(o => !o)} className="ml-1 text-xs text-primary hover:underline">{open ? '접기' : `더보기 (${lines.length}줄)`}</button>}
    </div>
  );
}
