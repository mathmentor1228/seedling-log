// EXAM-STUDENT-ANALYSIS-V1 — 학생 결과 행에서 여는 분석 패널 (vault 19 §11 워크플로)
//   왼쪽: 시험지 PDF(있으면) · 오른쪽: 문항 그리드(틀림 클릭) → 틀린 문항별 이유 태그·메모 → AI 기본 방향 초안 → 최종 문안 → 학원의 대응(사람이 씀)
//   → 교사 컨펌 → 원장 컨펌(=즉시 공개, 학원 대응 문장 없으면 막힘). 공개된 글은 학부모 포털 "내 아이 시험 분석"에.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, CheckCircle2, Send, Save, Undo2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';
import { ANALYSIS_STATUS_META, type ResultPdf, type StudentAnalysis, type StudentSubjectRow, type WrongReasonTag } from './examHubUtils';

const db = supabase as any;
const base = (s: string) => s.startsWith('수학') || /대수|기하|미적분|확률/.test(s) ? '수학' : s.includes('영어') ? '영어' : s.startsWith('국어') || /화법|문학|독서/.test(s) ? '국어' : s.startsWith('과학') || /물리|화학|생명|지구|통합과학/.test(s) ? '과학' : s;

interface Props {
  row: StudentSubjectRow | null;
  examLabel: string;
  analysis: StudentAnalysis | null;
  tags: WrongReasonTag[];
  defaultTotalItems: number | null;   // 같은 학교·과목 분석지의 문항 수
  isAdmin: boolean;
  canEdit: boolean;                   // admin 또는 담당 교사
  onClose: () => void;
  onChanged: () => void;
}
type ItemState = { wrong: boolean; tags: string[]; memo: string };

export function StudentAnalysisPanel({ row, examLabel, analysis, tags, defaultTotalItems, isAdmin, canEdit, onClose, onChanged }: Props) {
  const r = row;
  const [total, setTotal] = useState<number>(analysis?.total_items || defaultTotalItems || 20);
  const [items, setItems] = useState<Map<number, ItemState>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [finalText, setFinalText] = useState(analysis?.final_text || '');
  const [actionText, setActionText] = useState(analysis?.academy_action_text || '');
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [itemsDirty, setItemsDirty] = useState(false);
  const status = analysis?.status || 'draft';
  const subjTags = useMemo(() => { const b = base(r?.subject || ''); return tags.filter(t => t.subject === b || t.subject === '공통'); }, [tags, r?.subject]);

  useEffect(() => {
    if (!r?.result) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await db.from('exam_result_items').select('item_number, is_wrong, reason_tags, memo').eq('result_id', r.result!.id);
      if (cancelled) return;
      const m = new Map<number, ItemState>();
      for (const it of (data || []) as any[]) m.set(it.item_number, { wrong: !!it.is_wrong, tags: it.reason_tags || [], memo: it.memo || '' });
      setItems(m); setItemsDirty(false);
      setTotal(analysis?.total_items || defaultTotalItems || Math.max(20, ...[...m.keys()]));
      setFinalText(analysis?.final_text || ''); setActionText(analysis?.academy_action_text || ''); setAiDraft(null); setViolations([]);
      if (r.pdf) { const u = await getCachedSignedUrl('exam-results', (r.pdf as ResultPdf).storage_path, 3600); if (!cancelled) setPdfUrl(u || null); } else setPdfUrl(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [r?.result?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return null;
  const wrongNums = [...items.entries()].filter(([, v]) => v.wrong).map(([n]) => n).sort((a, b) => a - b);
  const toggle = (n: number) => { if (!canEdit) return; setItems(prev => { const m = new Map(prev); const cur = m.get(n); if (cur?.wrong) m.delete(n); else m.set(n, { wrong: true, tags: cur?.tags || [], memo: cur?.memo || '' }); return m; }); setItemsDirty(true); };
  const toggleTag = (n: number, code: string) => { setItems(prev => { const m = new Map(prev); const cur = m.get(n)!; const t = cur.tags.includes(code) ? cur.tags.filter(c => c !== code) : [...cur.tags, code]; m.set(n, { ...cur, tags: t }); return m; }); setItemsDirty(true); };
  const setMemo = (n: number, memo: string) => { setItems(prev => { const m = new Map(prev); m.set(n, { ...m.get(n)!, memo }); return m; }); setItemsDirty(true); };

  async function saveItems(silent = false): Promise<boolean> {
    if (!r?.result) return false;
    setSaving(true);
    const rid = r.result.id;
    const { error: delErr } = await db.from('exam_result_items').delete().eq('result_id', rid);
    if (delErr) { setSaving(false); toast.error(delErr.message); return false; }
    const rows = wrongNums.map(n => ({ result_id: rid, item_number: n, is_wrong: true, reason_tags: items.get(n)!.tags, memo: items.get(n)!.memo || null }));
    if (rows.length) { const { error } = await db.from('exam_result_items').insert(rows); if (error) { setSaving(false); toast.error(error.message); return false; } }
    // 분석 행 upsert (문항 수·틀린 수)
    const payload: Record<string, unknown> = { result_id: rid, student_id: r.student.id, subject: r.subject, exam_year: r.result.exam_year, exam_period: r.result.exam_period, total_items: total || null, wrong_count: wrongNums.length, updated_at: new Date().toISOString() };
    if (!analysis) { const { data: u } = await supabase.auth.getUser(); payload.created_by = u.user?.id ?? null; payload.status = 'draft'; }
    const { error: e2 } = await db.from('exam_student_analyses').upsert(payload, { onConflict: 'result_id' });
    setSaving(false);
    if (e2) { toast.error(e2.message.includes('exam_student_analyses') ? '분석 테이블이 아직 없습니다. Lovable에서 마이그레이션을 먼저 적용해 주세요.' : e2.message); return false; }
    setItemsDirty(false); if (!silent) toast.success(`틀린 문항 ${wrongNums.length}개 저장`); onChanged(); return true;
  }
  async function generate() {
    if (!r?.result) return;
    if (itemsDirty) { const ok = await saveItems(true); if (!ok) return; }
    setGenerating(true); setViolations([]);
    try {
      const { data, error } = await supabase.functions.invoke('generate-exam-student-analysis', { body: { result_id: r.result.id } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.message || data.error);
      if (data?.ok === false) { setViolations(data.violations || []); setAiDraft(data.draft || null); toast.error('초안이 규칙에 걸려 저장하지 않았습니다. 위반 목록을 보고 다시 시도하세요.'); return; }
      setAiDraft(data.draft); if (!finalText.trim() || status === 'draft') setFinalText(data.draft);
      toast.success(`초안 생성 (${data.attempts}회 시도${data.difficulty_used ? ' · 문항 난도 반영' : ''})`); onChanged();
    } catch (e: any) { toast.error('초안 생성 실패: ' + (e.message || e)); } finally { setGenerating(false); }
  }
  async function saveText(next?: 'teacher_confirmed' | 'published' | 'draft') {
    if (!r?.result) return;
    if (itemsDirty) { const ok = await saveItems(true); if (!ok) return; }
    if (next === 'published' && actionText.trim().length < 5) { toast.error('학원의 대응 문장을 적어야 공개할 수 있습니다 (원장 확인 필요).'); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const payload: Record<string, unknown> = { result_id: r.result.id, student_id: r.student.id, subject: r.subject, exam_year: r.result.exam_year, exam_period: r.result.exam_period, total_items: total || null, wrong_count: wrongNums.length, final_text: finalText.trim() || null, academy_action_text: actionText.trim() || null, updated_at: new Date().toISOString() };
    if (!analysis) { payload.created_by = u.user?.id ?? null; payload.status = 'draft'; }
    if (next) payload.status = next;
    if (next === 'teacher_confirmed') { payload.teacher_confirmed_by = u.user?.id ?? null; payload.teacher_confirmed_at = new Date().toISOString(); }
    if (next === 'draft') { payload.teacher_confirmed_by = null; payload.teacher_confirmed_at = null; payload.published_at = null; payload.principal_confirmed_by = null; payload.principal_confirmed_at = null; }
    const { error } = await db.from('exam_student_analyses').upsert(payload, { onConflict: 'result_id' });
    setSaving(false);
    if (error) { const m = error.message || ''; toast.error(m.includes('ACADEMY_ACTION_REQUIRED') ? '학원의 대응 문장이 필요합니다' : m.includes('PRINCIPAL_ONLY_PUBLISH') ? '공개는 원장만 할 수 있습니다' : m.includes('FINAL_TEXT_REQUIRED') ? '최종 문안이 너무 짧습니다' : m); return; }
    toast.success(next === 'published' ? '원장 컨펌 · 학부모 포털에 공개됨' : next === 'teacher_confirmed' ? '교사 컨펌' : next === 'draft' ? '초안으로 되돌림' : '저장'); onChanged();
  }

  const nums = Array.from({ length: Math.max(1, Math.min(60, total || 20)) }, (_, i) => i + 1);
  const meta = ANALYSIS_STATUS_META[status];
  return (
    <Dialog open={!!r} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl h-[92vh] p-0 flex flex-col">
        <DialogHeader className="px-4 pt-3 pb-2 border-b">
          <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
            {r.student.name} · {r.subject} · {examLabel}
            {r.result && <span className="text-muted-foreground font-normal">실점수 {r.result.actual_score ?? '-'}{r.previousScore != null ? ` (직전 ${r.previousScore})` : ''}</span>}
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-normal', meta.cls)}>{meta.label}</span>
            {!canEdit && <Badge variant="outline" className="text-[10px] font-normal">보기만 (담당 교사·원장만 수정)</Badge>}
          </DialogTitle>
        </DialogHeader>
        {!r.result ? (
          <div className="p-6 text-sm text-muted-foreground">점수가 먼저 있어야 분석을 만들 수 있습니다. 시트 동기화나 원장 직접 입력으로 점수를 채운 뒤 열어 주세요.</div>
        ) : (
          <div className="flex-1 min-h-0 grid md:grid-cols-[1fr_1fr]">
            {/* 왼쪽: 시험지 */}
            <div className="hidden md:block bg-muted min-h-0 border-r">
              {pdfUrl ? <iframe title="시험지" src={`${pdfUrl}#toolbar=0&navpanes=0`} className="w-full h-full" />
                : <div className="h-full flex items-center justify-center text-xs text-muted-foreground p-6 text-center">{r.pdf ? '시험지를 불러오는 중' : '시험지 PDF가 아직 없습니다. 드라이브 제출창으로 올라오면 여기 보입니다.'}</div>}
            </div>
            {/* 오른쪽: 워크플로 */}
            <div className="min-h-0 overflow-y-auto p-4 space-y-4 text-sm">
              {loading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />불러오는 중</div> : (
                <>
                  {/* 1. 틀린 문항 */}
                  <section className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">① 틀린 문항</span>
                      <span className="text-xs text-muted-foreground">번호를 눌러 표시</span>
                      <span className="ml-auto text-xs text-muted-foreground">문항 수</span>
                      <Input type="number" min={1} max={60} value={total} onChange={e => setTotal(Number(e.target.value) || 0)} disabled={!canEdit} className="h-7 w-16 text-xs" />
                      <span className="text-xs"><b className="text-red-700">{wrongNums.length}</b>개 틀림</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {nums.map(n => { const w = items.get(n)?.wrong; return (
                        <button key={n} type="button" disabled={!canEdit} onClick={() => toggle(n)}
                          className={cn('w-8 h-8 rounded-md border text-xs tabular-nums', w ? 'bg-red-500 text-white border-red-500' : 'bg-background hover:bg-muted', !canEdit && 'cursor-default')}>{n}</button>); })}
                    </div>
                  </section>

                  {/* 2. 이유 태그 */}
                  {wrongNums.length > 0 && (
                    <section className="space-y-2">
                      <div className="font-semibold">② 틀린 이유 <span className="text-xs font-normal text-muted-foreground">문항마다 태그를 고르세요(여러 개 가능). 태그가 하나도 없으면 초안을 만들지 않습니다.</span></div>
                      <div className="space-y-1.5">
                        {wrongNums.map(n => { const it = items.get(n)!; return (
                          <div key={n} className="rounded-md border p-2 space-y-1">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="w-8 shrink-0 font-semibold text-red-700 tabular-nums">{n}번</span>
                              {subjTags.map(t => (
                                <button key={t.code} type="button" disabled={!canEdit} onClick={() => toggleTag(n, t.code)}
                                  className={cn('rounded-full border px-2 py-0.5 text-[11px]', it.tags.includes(t.code) ? 'bg-amber-500 text-white border-amber-500' : 'bg-background hover:bg-muted')}>{t.label}</button>
                              ))}
                            </div>
                            <Input value={it.memo} onChange={e => setMemo(n, e.target.value)} disabled={!canEdit} placeholder="메모(선택) — 어떤 개념·어떤 실수였는지" className="h-7 text-xs" />
                          </div>); })}
                      </div>
                      {canEdit && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving || !itemsDirty} onClick={() => saveItems()}>{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}문항·태그 저장</Button>}
                    </section>
                  )}

                  {/* 3. AI 초안 → 최종 문안 */}
                  <section className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">③ 학부모께 보낼 글</span>
                      <span className="text-xs text-muted-foreground">AI가 기록(점수·틀린 문항·태그·난도)만으로 기본 방향을 씁니다. 선생님이 고쳐서 최종 문안으로.</span>
                      {canEdit && status !== 'published' && (
                        <Button size="sm" className="h-7 text-xs ml-auto" disabled={generating || wrongNums.length === 0} onClick={generate} title={wrongNums.length === 0 ? '틀린 문항을 먼저 표시하세요' : undefined}>
                          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}AI 기본 방향 초안
                        </Button>
                      )}
                    </div>
                    {violations.length > 0 && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs">
                        <div className="flex items-center gap-1 font-medium text-amber-900"><AlertTriangle className="w-3.5 h-3.5" />규칙에 걸려 저장하지 않음: {violations.join(', ')}</div>
                        {aiDraft && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{aiDraft}</p>}
                      </div>
                    )}
                    <Textarea value={finalText} onChange={e => setFinalText(e.target.value)} disabled={!canEdit || status === 'published'} rows={7} placeholder="AI 초안을 만들거나 직접 쓰세요. 호칭은 '아이' 또는 이름(성 제외). 학원의 대응은 아래 칸에." className="text-sm leading-relaxed" />
                    <div className="text-[11px] text-muted-foreground text-right">{finalText.trim().length}자</div>
                  </section>

                  {/* 4. 학원의 대응 — 사람이 쓴다 */}
                  <section className="space-y-1.5">
                    <div className="font-semibold">④ 학원의 대응 <span className="text-xs font-normal text-amber-700">사람이 씁니다. 비어 있으면 공개할 수 없습니다(원장 확인 필요).</span></div>
                    <Textarea value={actionText} onChange={e => setActionText(e.target.value)} disabled={!canEdit || status === 'published'} rows={3} placeholder="예: 기말까지 이차함수 그래프 유형을 매주 1회 클리닉에서 다시 풀고, 숙제에 같은 유형 3문항씩 넣습니다." className="text-sm leading-relaxed" />
                  </section>

                  {/* 5. 상태·버튼 */}
                  <section className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <span className={cn('rounded px-1.5 py-0.5 text-[11px]', meta.cls)}>{meta.label}</span>
                    {analysis?.published_at && <span className="text-[11px] text-muted-foreground">공개 {analysis.published_at.slice(0, 10)}</span>}
                    <span className="flex-1" />
                    {canEdit && status !== 'published' && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={saving} onClick={() => saveText()}><Save className="w-3.5 h-3.5 mr-1" />저장</Button>}
                    {canEdit && status === 'draft' && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={saving || finalText.trim().length < 20} onClick={() => saveText('teacher_confirmed')}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />교사 컨펌</Button>}
                    {isAdmin && status !== 'published' && <Button size="sm" className="h-8 text-xs" disabled={saving || finalText.trim().length < 20 || actionText.trim().length < 5} title={actionText.trim().length < 5 ? '학원의 대응 문장이 필요합니다' : undefined} onClick={() => saveText('published')}><Send className="w-3.5 h-3.5 mr-1" />원장 컨펌 · 공개</Button>}
                    {isAdmin && status !== 'draft' && <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={saving} onClick={() => saveText('draft')}><Undo2 className="w-3.5 h-3.5 mr-1" />초안으로</Button>}
                  </section>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
