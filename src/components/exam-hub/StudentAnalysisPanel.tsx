// EXAM-SELF-REVIEW-V1 (vault 19 §21) — 학생 결과 행에서 여는 패널. 선생님 일은 "보고 → 면담 → 메모 한 칸".
//   왼쪽: 시험지 PDF. 오른쪽: ① 학생이 제출한 셀프 피드백(틀린 번호·이유·다짐) 읽기 — 미제출이면 선생님이 대신 표시(폴백)
//   {method === 'comment' ? '전체 개별 코멘트' : '추가 코멘트 (선택)'} 한 칸(AI 초안은 선택) ③ 면담 메모 · 학원 대응 한 칸 → [저장 = 면담 완료] → [공개](원장, 트리거 가드).
//   교사 컨펌 단계·문항 메모·다중 태그는 뺐다(이전 EXAM-STUDENT-ANALYSIS-V1 §11 흐름).
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { feedbackError, feedbackText, type FeedbackMethod } from '@/lib/examFeedback';
import { Loader2, Sparkles, Send, Save, Undo2, AlertTriangle, User, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';
import { ANALYSIS_STAGE_META, analysisStage, type ResultPdf, type StudentAnalysis, type StudentSubjectRow, type WrongReasonTag } from './examHubUtils';

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
type Item = { reason: string | null; memo: string | null; source: 'student' | 'teacher' };

export function StudentAnalysisPanel({ row, examLabel, analysis, tags, defaultTotalItems, isAdmin, canEdit, onClose, onChanged }: Props) {
  const r = row;
  const [items, setItems] = useState<Map<number, Item>>(new Map());
  const [total, setTotal] = useState<number>(analysis?.total_items || defaultTotalItems || 25);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [finalText, setFinalText] = useState(analysis?.final_text || '');
  const [actionText, setActionText] = useState(analysis?.academy_action_text || '');
  const [violations, setViolations] = useState<string[]>([]);
  const [rejectedDraft, setRejectedDraft] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [method, setMethod] = useState<FeedbackMethod>(analysis?.feedback_method || 'comment');
  const [fallback, setFallback] = useState(false);     // 학생 미제출 → 선생님이 대신 표시 모드
  const [itemsDirty, setItemsDirty] = useState(false);
  const stage = analysisStage(analysis);
  const published = stage === 'published';
  const studentSubmitted = !!analysis?.student_submitted_at;
  const subjTags = useMemo(() => { const b = base(r?.subject || ''); return tags.filter(t => t.subject === b || t.subject === '공통'); }, [tags, r?.subject]);
  const tagLabel = (code: string | null) => subjTags.find(t => t.code === code)?.label || code || '이유 없음';

  useEffect(() => {
    if (!r?.result) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await db.from('exam_result_items').select('item_number, is_wrong, reason_tags, memo, source').eq('result_id', r.result.id);
      if (cancelled) return;
      const m = new Map<number, Item>();
      const savedItems = analysis?.feedback_method === 'items' && Array.isArray(analysis.feedback_items) ? analysis.feedback_items.map(it => ({ ...it, is_wrong: true, source: 'teacher' })) : data || [];
      for (const it of savedItems as any[]) if (it.is_wrong) m.set(it.item_number, { reason: (it.reason_tags || [])[0] || null, memo: it.memo || null, source: it.source === 'student' ? 'student' : 'teacher' });
      setItems(m); setItemsDirty(false); setFallback(false); setMethod(analysis?.feedback_method || (m.size ? 'items' : 'comment'));
      setTotal(analysis?.total_items || defaultTotalItems || Math.max(25, ...[...m.keys()]));
      setFinalText(analysis?.feedback_method === 'items' ? '' : analysis?.final_text || ''); setActionText(analysis?.academy_action_text || ''); setViolations([]); setRejectedDraft(null);
      if (r.pdf) { const u = await getCachedSignedUrl('exam-results', (r.pdf as ResultPdf).storage_path, 3600); if (!cancelled) setPdfUrl(u || null); } else setPdfUrl(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [r?.result?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return null;
  const wrongNums = [...items.keys()].sort((a, b) => a - b);
  const editingItems = canEdit && !published && method === 'items';
  const selectedItems = wrongNums.map(n => { const item = items.get(n); return { item_number: n, reason_tags: item?.reason ? [item.reason] : [], memo: item?.memo || null }; });
  const submissionError = feedbackError(method, finalText, selectedItems);

  const toggle = (n: number) => { if (!editingItems) return; setItems(prev => { const m = new Map(prev); if (m.has(n)) m.delete(n); else m.set(n, { reason: null, memo: null, source: 'teacher' }); return m; }); setItemsDirty(true); };
  const setReason = (n: number, code: string) => { setItems(prev => { const m = new Map(prev); const cur = m.get(n); if (!cur) return m; m.set(n, { ...cur, reason: cur.reason === code ? null : code, source: 'teacher' }); return m; }); setItemsDirty(true); };

  function basePayload(): Record<string, unknown> {
    if (!r?.result) return {};
    return { result_id: r.result.id, student_id: r.student.id, subject: r.subject, exam_year: r.result.exam_year, exam_period: r.result.exam_period, total_items: total || null, wrong_count: wrongNums.length, feedback_method: method, feedback_items: selectedItems, updated_at: new Date().toISOString() };
  }
  async function saveItems(silent = false): Promise<boolean> {
    if (!r?.result) return false;
    setSaving(true);
    const payload = basePayload();
    if (!analysis) { const { data: u } = await supabase.auth.getUser(); payload.created_by = u.user?.id ?? null; payload.status = 'draft'; }
    const { error } = await db.from('exam_student_analyses').upsert(payload, { onConflict: 'result_id' });
    setSaving(false);
    if (error) { toast.error(error.message); return false; }
    setItemsDirty(false); if (!silent) toast.success('문항 초안 저장'); onChanged(); return true;
  }
  async function generate() {
    if (!r?.result) return;
    if (itemsDirty) { const ok = await saveItems(true); if (!ok) return; }
    setGenerating(true); setViolations([]); setRejectedDraft(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-exam-student-analysis', { body: { result_id: r.result.id } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.message || data.error);
      if (data?.ok === false) { setViolations(data.violations || []); setRejectedDraft(data.draft || null); toast.error('초안이 규칙에 걸려 저장하지 않았습니다.'); return; }
      setFinalText(data.draft);
      toast.success(`초안을 글 칸에 넣었습니다${data.difficulty_used ? ' · 문항 난도 반영' : ''}. 고쳐서 쓰세요.`); onChanged();
    } catch (e: any) { toast.error('초안 생성 실패: ' + (e.message || e)); } finally { setGenerating(false); }
  }
  /** 저장 = 면담 완료(학원 대응 5자↑이면 counseled_at 찍힘). publish = 원장 공개. unpublish = 공개 취소(원장). */
  async function save(mode: 'save' | 'submit' | 'publish' | 'unpublish') {
    if (!r?.result) return;
    if (itemsDirty) { const ok = await saveItems(true); if (!ok) return; }
    if ((mode === 'publish' || mode === 'submit') && submissionError) { toast.error(submissionError); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
    const payload = basePayload();
    payload.final_text = mode === 'save' || mode === 'unpublish' ? finalText.trim() || null : feedbackText(method, finalText, selectedItems, code => tagLabel(code)); payload.academy_action_text = actionText.trim() || null;
    if (!analysis) { payload.created_by = uid; payload.status = 'draft'; }
    if (mode !== 'unpublish' && actionText.trim().length >= 5 && !analysis?.counseled_at) { payload.counseled_at = new Date().toISOString(); payload.counseled_by = uid; }
    if (mode === 'submit') { payload.status = 'teacher_confirmed'; payload.teacher_confirmed_by = uid; payload.teacher_confirmed_at = new Date().toISOString(); }
    if (mode === 'publish') payload.status = 'published';
    if (mode === 'unpublish') { payload.status = 'draft'; payload.published_at = null; payload.principal_confirmed_by = null; payload.principal_confirmed_at = null; }
    const { error } = await db.from('exam_student_analyses').upsert(payload, { onConflict: 'result_id' });
    setSaving(false);
    if (error) { const m = error.message || ''; toast.error(m.includes('ACADEMY_ACTION_REQUIRED') ? '면담 메모 · 학원 대응이 필요합니다' : m.includes('PRINCIPAL_ONLY_PUBLISH') ? '공개는 원장만 할 수 있습니다' : m.includes('FINAL_TEXT_REQUIRED') ? '학부모께 보낼 글이 너무 짧습니다' : m); return; }
    toast.success(mode === 'publish' ? '공개됨 · 학부모 포털과 학생 앱에 보입니다' : mode === 'unpublish' ? '공개 취소' : mode === 'submit' ? '제출 완료 · 원장 확인 대기' : actionText.trim().length >= 5 ? '저장 · 면담 완료' : '저장'); onChanged();
  }

  const nums = Array.from({ length: Math.max(1, Math.min(60, total || 25)) }, (_, i) => i + 1);
  const meta = ANALYSIS_STAGE_META[stage];
  const textLocked = !canEdit || published;
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
          <div className="p-6 text-sm text-muted-foreground">점수가 먼저 있어야 합니다. 시트 동기화나 원장 직접 입력으로 점수를 채운 뒤 열어 주세요.</div>
        ) : (
          <div className="flex-1 min-h-0 grid md:grid-cols-[1fr_1fr]">
            {/* 왼쪽: 시험지 */}
            <div className="hidden md:block bg-muted min-h-0 border-r">
              {pdfUrl ? <iframe title="시험지" src={`${pdfUrl}#toolbar=0&navpanes=0`} className="w-full h-full" />
                : <div className="h-full flex items-center justify-center text-xs text-muted-foreground p-6 text-center">{r.pdf ? '시험지를 불러오는 중' : '시험지 PDF가 아직 없습니다. 드라이브 제출창으로 올라오면 여기 보입니다.'}</div>}
            </div>
            {/* 오른쪽 */}
            <div className="min-h-0 overflow-y-auto p-4 space-y-4 text-sm">
              {loading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />불러오는 중</div> : (
                <>
                  <RadioGroup value={method} onValueChange={value => { if (value === 'items' || value === 'comment') setMethod(value); }} disabled={!canEdit || published} aria-label="개별 분석 제출 방식" className="flex flex-wrap gap-4 border-b pb-3">
                    <label className="flex items-center gap-2"><RadioGroupItem value="items" />문항별 오답·이유</label>
                    <label className="flex items-center gap-2"><RadioGroupItem value="comment" />전체 개별 코멘트</label>
                  </RadioGroup>
                  {method === 'items' && <>
                  {/* ① 학생이 돌아본 것 */}
                  <section className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">문항별 오답 분석</span>
                      {studentSubmitted
                        ? <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />{analysis?.student_submitted_at?.slice(0, 10)} 학생 앱에서 제출</span>
                        : <span className="text-xs text-amber-700">아직 제출 전 — 학생 앱 '시험 돌아보기'에서 적게 해 주세요</span>}
                      <span className="ml-auto text-xs"><b className="text-red-700">{wrongNums.length}</b>개 틀림{total ? ` / ${total}문항` : ''}</span>
                    </div>

                    {editingItems ? (
                      <>
                        <div className="flex flex-wrap gap-1">
                          {nums.map(n => { const w = items.has(n); return (
                            <Button key={n} type="button" variant={w ? 'destructive' : 'outline'} size="icon" onClick={() => toggle(n)}
                              className={cn('w-8 h-8 rounded-md border text-xs tabular-nums', w ? '' : 'bg-background hover:bg-muted')}>{n}</Button>); })}
                          <Button type="button" variant="outline" className="h-8 px-2 text-[11px] text-muted-foreground" onClick={() => setTotal(t => Math.min(60, (t || 25) + 5))}>+5</Button>
                        </div>
                        {wrongNums.length > 0 && (
                          <div className="space-y-1">
                            {wrongNums.map(n => { const it = items.get(n); if (!it) return null; return (
                              <div key={n} className="flex flex-wrap items-center gap-1 rounded-md border p-1.5">
                                <span className="w-8 shrink-0 font-semibold text-red-700 tabular-nums">{n}번</span>
                                {subjTags.map(t => (
                                  <Button key={t.code} type="button" variant={it.reason === t.code ? 'secondary' : 'outline'} onClick={() => setReason(n, t.code)}
                                    className="h-7 px-2 text-[11px]">{t.label}</Button>
                                ))}
                                <Textarea aria-label={`${n}번 틀린 이유`} value={it.memo || ''} onChange={e => { const memo = e.target.value; setItems(prev => { const m = new Map(prev); const current = m.get(n); if (current) m.set(n, { ...current, memo, source: 'teacher' }); return m; }); setItemsDirty(true); }} placeholder="틀린 이유·개별 지도 내용" rows={2} className="w-full text-xs" />
                              </div>); })}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving || !itemsDirty} onClick={() => saveItems()}>{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}문항 저장 (선생님 표시)</Button>
                          <span className="text-[11px] text-muted-foreground">학생이 제출한 원본은 별도로 보존됩니다.</span>
                        </div>
                      </>
                    ) : wrongNums.length === 0 ? (
                      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground flex items-center justify-between gap-2">
                        <span>{studentSubmitted ? '학생이 "틀린 문항 없음"으로 제출했습니다.' : '학생 제출을 기다리는 중입니다.'}</span>
                        {canEdit && !published && !studentSubmitted && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFallback(true)}><Pencil className="w-3 h-3 mr-1" />선생님이 대신 표시</Button>}
                      </div>
                    ) : (
                      <div className="rounded-md border divide-y">
                        {wrongNums.map(n => { const it = items.get(n); if (!it) return null; return (
                          <div key={n} className="flex items-start gap-2 px-2 py-1.5">
                            <span className="w-9 shrink-0 font-semibold text-red-700 tabular-nums">{n}번</span>
                            <span className="rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 text-[11px] shrink-0">{tagLabel(it.reason)}</span>
                            {it.memo && <span className="text-xs text-muted-foreground">{it.memo}</span>}
                            {it.source === 'teacher' && <span className="ml-auto text-[10px] text-muted-foreground">선생님 표시</span>}
                          </div>); })}
                      </div>
                    )}
                    {analysis?.student_reflection && (
                      <div className="rounded-md bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900 p-2.5">
                        <div className="text-[11px] font-semibold text-sky-800 dark:text-sky-200 mb-0.5">다음 시험까지 내가 할 것 (학생이 씀)</div>
                        <p className="whitespace-pre-wrap">{analysis.student_reflection}</p>
                      </div>
                    )}
                  </section>

                  </>}
                  {/* {method === 'comment' ? '전체 개별 코멘트' : '추가 코멘트 (선택)'} */}
                  <section className="space-y-2 border-t pt-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{method === 'comment' ? '전체 개별 코멘트' : '추가 코멘트 (선택)'}</span>
                      <span className="text-xs text-muted-foreground">직접 쓰거나 AI 초안으로 시작. 호칭은 '아이' 또는 이름.</span>
                      {canEdit && !published && (
                        <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" disabled={generating || wrongNums.length === 0} onClick={generate} title={wrongNums.length === 0 ? '틀린 문항이 있어야 초안을 만듭니다' : undefined}>
                          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}AI 초안
                        </Button>
                      )}
                    </div>
                    {violations.length > 0 && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs">
                        <div className="flex items-center gap-1 font-medium text-amber-900"><AlertTriangle className="w-3.5 h-3.5" />규칙에 걸려 넣지 않음: {violations.join(', ')}</div>
                        {rejectedDraft && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{rejectedDraft}</p>}
                      </div>
                    )}
                    <Textarea value={finalText} onChange={e => setFinalText(e.target.value)} disabled={textLocked} rows={6} placeholder="예: 민준이는 이번 시험에서 계산 실수로 3문항을 놓쳤습니다. 개념은 알고 있었고 … 다음 시험까지는 검산 습관을 살펴봅니다." className="text-sm leading-relaxed" />
                  </section>

                  {/* ③ 면담 메모 · 학원 대응 */}
                  <section className="space-y-1.5">
                    <div className="font-semibold">학원 대응 (선택)</div>
                    <Textarea value={actionText} onChange={e => setActionText(e.target.value)} disabled={textLocked} rows={3} placeholder="예: 면담에서 검산 안 하는 습관 확인. 기말까지 매주 1회 클리닉에서 이차함수 유형 다시 풀고, 숙제에 같은 유형 3문항씩." className="text-sm leading-relaxed" />
                  </section>

                  {/* 버튼 */}
                  <section className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <span className={cn('rounded px-1.5 py-0.5 text-[11px]', meta.cls)}>{meta.label}</span>
                    {analysis?.counseled_at && <span className="text-[11px] text-muted-foreground">면담 {analysis.counseled_at.slice(0, 10)}</span>}
                    {analysis?.published_at && <span className="text-[11px] text-muted-foreground">공개 {analysis.published_at.slice(0, 10)}</span>}
                    <span className="flex-1" />
                    {canEdit && !published && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={saving} onClick={() => save('save')}><Save className="w-3.5 h-3.5 mr-1" />{actionText.trim().length >= 5 ? '저장 · 면담 완료' : '저장'}</Button>}
                    {canEdit && !published && <Button size="sm" variant="secondary" disabled={saving || loading || !!submissionError} onClick={() => save('submit')}><Send className="w-3.5 h-3.5 mr-1" />분석 제출</Button>}
                    {isAdmin && !published && <Button size="sm" className="h-8 text-xs" disabled={saving || loading || !!submissionError} title={submissionError || undefined} onClick={() => save('publish')}><Send className="w-3.5 h-3.5 mr-1" />학부모에게 공개</Button>}
                    {isAdmin && published && <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={saving} onClick={() => save('unpublish')}><Undo2 className="w-3.5 h-3.5 mr-1" />공개 취소</Button>}
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
