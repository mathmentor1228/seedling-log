// EXAM-SELF-REVIEW-V1 (vault 19 §21) — 학생 앱 "내 시험 돌아보기"
//   점수·시험지(시트·드라이브에서 온 것)를 보고 ① 틀린 번호를 누르고 ② 번호마다 이유 하나 ③ "다음 시험까지 내가 할 것" 한 줄 → 제출.
//   제출본은 담당 선생님 면담 재료가 되고, 원장이 공개하면 선생님 글·학원 대응이 여기에도 보인다. 공개 뒤에는 잠김.
//   옛 채점 루프(시험지 업로드→오버레이 채점→자가진단)는 2026-10-09 폐기. 이 페이지가 그 자리를 대신한다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { studentApi, fileToBase64 } from '@/lib/studentApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StudentStudyTabs } from '@/components/student/StudentStudyTabs';
import { CheckCircle2, ChevronRight, ClipboardCheck, FileText, Loader2, Lock, MessageCircle, Send, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ReviewList = NonNullable<Awaited<ReturnType<typeof studentApi.getExamSelfReviews>>['data']>['reviews'];
type Review = ReviewList[number];
type Tag = { subject: string; code: string; label: string; sort_order: number };
type Draft = { wrong: Map<number, { reason: string | null; memo: string }>; reflection: string; total: number };

const baseSubject = (s: string) => s.startsWith('수학') || /대수|기하|미적분|확률/.test(s) ? '수학' : s.includes('영어') ? '영어' : s.startsWith('국어') || /화법|문학|독서/.test(s) ? '국어' : s.startsWith('과학') || /물리|화학|생명|지구|통합과학/.test(s) ? '과학' : s;
function examLabel(r: Review): string {
  const y = r.exam_year ? `${r.exam_year}년 ` : '';
  const p = r.exam_period || '';
  const sem = p.startsWith('2') ? '2학기' : p.startsWith('1') ? '1학기' : p;
  const t = r.exam_type || '';
  const type = t.includes('final') || t.includes('기말') || p.endsWith('b') ? '기말' : t.includes('mid') || t.includes('중간') || p.endsWith('a') ? '중간' : t;
  return `${y}${sem} ${type}`.trim();
}
type Stage = 'todo' | 'submitted' | 'counseled' | 'published';
function stageOf(r: Review): Stage { return r.locked ? 'published' : r.counseled_at ? 'counseled' : r.student_submitted_at ? 'submitted' : 'todo'; }
const STAGE: Record<Stage, { label: string; cls: string }> = {
  todo: { label: '돌아보기 전', cls: 'bg-amber-100 text-amber-900' },
  submitted: { label: '제출함 · 면담 전', cls: 'bg-sky-100 text-sky-900' },
  counseled: { label: '면담 완료', cls: 'bg-violet-100 text-violet-900' },
  published: { label: '선생님 글 도착', cls: 'bg-emerald-100 text-emerald-900' },
};

export default function StudentExamReview() {
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await studentApi.getExamSelfReviews();
    if (error || !data) { toast.error('시험 정보를 불러오지 못했어요'); setLoading(false); return; }
    setReviews(data.reviews); setTags(data.tags); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => reviews.find(r => r.id === openId) || null, [reviews, openId]);
  const todo = reviews.filter(r => stageOf(r) === 'todo');

  return (
    <div className="space-y-4 pb-6">
      <StudentStudyTabs />
      <div className="px-1">
        <h1 className="text-lg font-bold flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />내 시험 돌아보기</h1>
        <p className="text-sm text-muted-foreground mt-1">시험지를 보면서 틀린 번호와 이유를 적어요. 적은 내용을 가지고 선생님과 1:1로 공부 방법을 이야기해요.</p>
      </div>

      <QuickPaperUpload onDone={() => void load()} />

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : reviews.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">아직 올라온 시험이 없어요. 위에서 시험지를 올리거나, 점수가 올라오면 여기서 돌아볼 수 있어요.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {todo.length > 0 && <p className="px-1 text-xs font-medium text-amber-700">아직 돌아보지 않은 시험 {todo.length}개</p>}
          {reviews.map(r => {
            const st = stageOf(r); const d = r.previous_score != null && r.actual_score != null ? r.actual_score - r.previous_score : null;
            return (
              <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className="w-full text-left rounded-xl border bg-card px-4 py-3 flex items-center gap-3 active:bg-muted">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{baseSubject(r.subject)}</span>
                    <span className="text-sm font-semibold">{examLabel(r)}</span>
                    <span className={cn('text-[11px] px-1.5 py-0.5 rounded', STAGE[st].cls)}>{STAGE[st].label}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.actual_score != null ? <>{r.actual_score}점{d != null && d !== 0 && <span className={d > 0 ? 'text-emerald-600' : 'text-red-600'}> ({d > 0 ? `+${d}` : d})</span>}</> : '점수 없음'}
                    {r.items.length > 0 && <> · 틀린 문항 {r.items.length}개</>}
                    {r.pdfs.length > 0 && <> · 시험지 {r.pdfs.length}장</>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ReviewSheet key={selected.id} review={selected} tags={tags.filter(t => t.subject === baseSubject(selected.subject) || t.subject === '공통')}
          onClose={() => setOpenId(null)} onSaved={() => { setOpenId(null); void load(); }} onUploaded={() => void load()} />
      )}
    </div>
  );
}

// 과목 + 어느 시험인지 고르고 → 사진·PDF 골라서 → 제출. 점수가 아직 없어도 올릴 수 있다.
function examOptions() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const all = [
    { key: `${y}-2-b`, label: `${y}년 2학기 기말`, year: y, semester: '2' as const, kind: 'b' as const },
    { key: `${y}-2-a`, label: `${y}년 2학기 중간`, year: y, semester: '2' as const, kind: 'a' as const },
    { key: `${y}-1-b`, label: `${y}년 1학기 기말`, year: y, semester: '1' as const, kind: 'b' as const },
    { key: `${y}-1-a`, label: `${y}년 1학기 중간`, year: y, semester: '1' as const, kind: 'a' as const },
  ];
  // 지금 시기에 맞는 시험을 기본으로
  const def = m >= 11 || m <= 1 ? `${y}-2-b` : m >= 8 ? `${y}-2-a` : m >= 6 ? `${y}-1-b` : `${y}-1-a`;
  return { all, def };
}

function QuickPaperUpload({ onDone }: { onDone: () => void }) {
  const { all, def } = useMemo(examOptions, []);
  const [subject, setSubject] = useState<string>('');
  const [examKey, setExamKey] = useState<string>(def);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!subject) { toast.error('과목을 골라 주세요'); return; }
    if (files.length === 0) { toast.error('시험지 사진이나 PDF를 골라 주세요'); return; }
    const ex = all.find(e => e.key === examKey)!;
    setBusy(true);
    let ok = 0;
    for (const f of files) {
      if (f.size > 12 * 1024 * 1024) { toast.error(`${f.name}은 12MB가 넘어요`); continue; }
      try {
        const content = await fileToBase64(f);
        const ext = (f.name.split('.').pop() || (f.type === 'application/pdf' ? 'pdf' : 'jpg')).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
        const { error } = await studentApi.uploadExamPaper({ subject, exam_year: ex.year, semester: ex.semester, exam_kind: ex.kind, content, content_type: f.type || 'image/jpeg', ext });
        if (error) { toast.error(`${f.name}: ${error === 'FILE_TOO_LARGE' ? '파일이 너무 커요' : error}`); continue; }
        ok++;
      } catch { toast.error(`${f.name}을 올리지 못했어요`); }
    }
    setBusy(false);
    if (ok > 0) {
      toast.success(`${ex.label} ${subject} 시험지 ${ok}장 제출했어요`);
      setFiles([]); if (inputRef.current) inputRef.current.value = '';
      onDone();
    }
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="p-4 space-y-3">
        <p className="font-semibold flex items-center gap-2"><Upload className="h-4 w-4 text-primary" />시험지 올리기</p>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">① 과목</p>
          <div className="grid grid-cols-4 gap-1.5">
            {['수학', '영어', '국어', '과학'].map(s => (
              <button key={s} type="button" onClick={() => setSubject(s)}
                className={cn('h-9 rounded-md border text-sm', subject === s ? 'border-primary bg-primary text-primary-foreground font-semibold' : 'bg-background')}>{s}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">② 어느 시험</p>
          <div className="grid grid-cols-2 gap-1.5">
            {all.map(e => (
              <button key={e.key} type="button" onClick={() => setExamKey(e.key)}
                className={cn('h-9 rounded-md border text-xs', examKey === e.key ? 'border-primary bg-primary/10 text-primary font-semibold' : 'bg-background')}>{e.label}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">③ 시험지 사진·PDF (여러 장 가능)</p>
          <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple className="hidden"
            onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 10))} />
          <Button type="button" variant="outline" className="w-full h-10" onClick={() => inputRef.current?.click()}>
            <FileText className="h-4 w-4 mr-1" />{files.length ? `${files.length}개 골랐어요 (다시 고르기)` : '파일 고르기 / 사진 찍기'}
          </Button>
        </div>
        <Button className="w-full h-10" disabled={busy || !subject || files.length === 0} onClick={submit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}제출하기
        </Button>
      </CardContent>
    </Card>
  );
}

function ReviewSheet({ review: r, tags, onClose, onSaved, onUploaded }: { review: Review; tags: Tag[]; onClose: () => void; onSaved: () => void; onUploaded: () => void }) {
  const stage = stageOf(r);
  const locked = r.locked;
  const [draft, setDraft] = useState<Draft>(() => ({
    wrong: new Map(r.items.map(it => [it.item_number, { reason: it.reason, memo: it.memo || '' }])),
    reflection: r.student_reflection || '',
    total: r.total_items || Math.max(25, ...r.items.map(it => it.item_number)),
  }));
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(r.items.length ? 2 : 1);
  const nums = Array.from({ length: Math.min(60, draft.total) }, (_, i) => i + 1);
  const wrongNums = [...draft.wrong.keys()].sort((a, b) => a - b);
  const missingReason = wrongNums.filter(n => !draft.wrong.get(n)?.reason);
  const tagLabel = (code: string | null) => tags.find(t => t.code === code)?.label || code || '';

  const toggle = (n: number) => { if (locked) return; setDraft(d => { const m = new Map(d.wrong); if (m.has(n)) m.delete(n); else m.set(n, { reason: null, memo: '' }); return { ...d, wrong: m }; }); };
  const setReason = (n: number, code: string) => { if (locked) return; setDraft(d => { const m = new Map(d.wrong); const cur = m.get(n)!; m.set(n, { ...cur, reason: cur.reason === code ? null : code }); return { ...d, wrong: m }; }); };
  const setMemo = (n: number, memo: string) => setDraft(d => { const m = new Map(d.wrong); m.set(n, { ...m.get(n)!, memo }); return { ...d, wrong: m }; });

  // EXAM-PAPER-STUDENT-V1: 시험지(사진·PDF)를 직접 올린다 — 서버가 시험지 저장소에 대신 저장한다
  const paperInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadPapers(files: FileList | null) {
    if (!files || files.length === 0 || locked) return;
    const list = Array.from(files).slice(0, 5);
    setUploading(true);
    let ok = 0;
    for (const f of list) {
      if (f.size > 12 * 1024 * 1024) { toast.error(`${f.name}은 12MB가 넘어요. 다른 파일로 올려 주세요`); continue; }
      try {
        const content = await fileToBase64(f);
        const ext = (f.name.split('.').pop() || (f.type === 'application/pdf' ? 'pdf' : 'jpg')).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
        const { error } = await studentApi.uploadExamPaper({ result_id: r.id, content, content_type: f.type || 'application/pdf', ext });
        if (error) { toast.error(`${f.name}: ${error === 'FILE_TOO_LARGE' ? '파일이 너무 커요' : error}`); continue; }
        ok++;
      } catch { toast.error(`${f.name}을 올리지 못했어요`); }
    }
    setUploading(false);
    if (paperInputRef.current) paperInputRef.current.value = '';
    if (ok > 0) { toast.success(`시험지 ${ok}장 올렸어요`); onUploaded(); }
  }

  async function removePaper(pdfId: string) {
    if (!confirm('올린 시험지를 지울까요?')) return;
    const { error } = await studentApi.deleteExamPaper(pdfId);
    if (error) { toast.error(error); return; }
    toast.success('지웠어요');
    onUploaded();
  }

  async function submit() {
    if (locked) return;
    if (wrongNums.length > 0 && missingReason.length > 0) { toast.error(`${missingReason.map(n => `${n}번`).join(', ')} 이유를 골라 주세요`); setStep(2); return; }
    if (draft.reflection.trim().length < 5) { toast.error('"다음 시험까지 내가 할 것"을 한 줄 적어 주세요'); setStep(3); return; }
    setSaving(true);
    const { data, error } = await studentApi.submitExamSelfReview({
      result_id: r.id, total_items: draft.total,
      items: wrongNums.map(n => ({ item_number: n, reason: draft.wrong.get(n)!.reason, memo: draft.wrong.get(n)!.memo || null })),
      reflection: draft.reflection,
    });
    setSaving(false);
    if (error || !data?.success) { toast.error(error || '저장하지 못했어요. 다시 시도해 주세요'); return; }
    toast.success('제출했어요. 선생님과 면담할 때 같이 봐요 👍');
    onSaved();
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg w-[calc(100%-1rem)] max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b sticky top-0 bg-background z-10">
          <DialogTitle className="text-base flex items-center gap-2 flex-wrap">
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{baseSubject(r.subject)}</span>
            {examLabel(r)}
            {r.actual_score != null && <span className="text-sm font-normal text-muted-foreground">{r.actual_score}점</span>}
            <span className={cn('text-[11px] px-1.5 py-0.5 rounded font-normal', STAGE[stage].cls)}>{STAGE[stage].label}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-5 text-sm">
          {/* 시험지 — 올린 걸 바로 열고, 학생도 사진·PDF를 직접 올린다 */}
          <div className="space-y-2">
            {r.pdfs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {r.pdfs.map((p, i) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                        <FileText className="h-4 w-4 text-primary" />{p.title || `시험지 ${i + 1}`} 열기
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground"><FileText className="h-4 w-4" />{p.title || `시험지 ${i + 1}`}</span>
                    )}
                    {p.source === 'student' && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-800">내가 올림</span>}
                    {p.source === 'student' && !locked && (
                      <button type="button" onClick={() => removePaper(p.id)} className="text-muted-foreground hover:text-red-600" title="지우기"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {!locked && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <input ref={paperInputRef} type="file" accept="application/pdf,image/*" multiple className="hidden"
                  onChange={e => { void uploadPapers(e.target.files); }} />
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={uploading} onClick={() => paperInputRef.current?.click()}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}시험지 올리기
                </Button>
                <span className="text-[11px] text-muted-foreground">사진이나 PDF · 여러 장도 한 번에</span>
              </div>
            )}
            {r.pdfs.length === 0 && locked && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">시험지 PDF가 아직 안 올라왔어요. 종이 시험지를 보면서 적어도 돼요.</p>
            )}
          </div>

          {/* 공개된 선생님 글 */}
          {locked && (
            <div className="space-y-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] font-semibold text-emerald-800 mb-1 flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />선생님이 보내는 글</p>
                <p className="whitespace-pre-wrap leading-relaxed text-gray-800">{r.final_text}</p>
              </div>
              {r.academy_action_text && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[11px] font-semibold text-amber-800 mb-1">면담에서 정한 것 · 학원에서는</p>
                  <p className="whitespace-pre-wrap leading-relaxed text-gray-800">{r.academy_action_text}</p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />공개된 뒤라 내가 적은 내용은 고칠 수 없어요.</p>
            </div>
          )}

          {/* 단계 표시 */}
          {!locked && (
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              {([1, 2, 3] as const).map(s => (
                <button key={s} type="button" onClick={() => setStep(s)} className={cn('rounded-md py-1.5 border', step === s ? 'border-primary bg-primary/10 text-primary font-semibold' : 'text-muted-foreground')}>
                  {s === 1 ? '① 틀린 번호' : s === 2 ? `② 이유${wrongNums.length ? ` (${wrongNums.length})` : ''}` : '③ 다음 시험까지'}
                </button>
              ))}
            </div>
          )}

          {/* ① 틀린 번호 */}
          {(locked || step === 1) && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">틀린 번호</span>
                {!locked && <span className="text-xs text-muted-foreground">번호를 눌러요</span>}
                <span className="ml-auto text-xs"><b className="text-red-600">{wrongNums.length}</b>개</span>
              </div>
              <div className="grid grid-cols-8 gap-1.5">
                {nums.map(n => { const w = draft.wrong.has(n); return (
                  <button key={n} type="button" disabled={locked} onClick={() => toggle(n)}
                    className={cn('h-9 rounded-md border text-sm tabular-nums', w ? 'bg-red-500 text-white border-red-500' : 'bg-background', locked && 'opacity-80')}>{n}</button>); })}
              </div>
              {!locked && (
                <div className="flex items-center justify-between">
                  <button type="button" className="text-xs text-primary" onClick={() => setDraft(d => ({ ...d, total: Math.min(60, d.total + 5) }))}>번호 더 보기 (+5)</button>
                  {wrongNums.length === 0 ? <span className="text-xs text-muted-foreground">다 맞았으면 바로 ③으로</span> : <Button size="sm" className="h-8" onClick={() => setStep(2)}>다음: 이유 고르기</Button>}
                </div>
              )}
            </section>
          )}

          {/* ② 이유 */}
          {(locked || step === 2) && wrongNums.length > 0 && (
            <section className="space-y-2">
              <div className="font-semibold">왜 틀렸을까? <span className="text-xs font-normal text-muted-foreground">번호마다 하나씩 골라요</span></div>
              <div className="space-y-2">
                {wrongNums.map(n => { const it = draft.wrong.get(n)!; return (
                  <div key={n} className={cn('rounded-lg border p-2.5 space-y-1.5', !it.reason && !locked && 'border-amber-300 bg-amber-50/40')}>
                    <div className="flex items-center gap-2"><span className="font-bold text-red-600 tabular-nums">{n}번</span>{locked && <span className="text-xs">{tagLabel(it.reason) || '이유 없음'}</span>}</div>
                    {!locked && (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map(t => (
                          <button key={t.code} type="button" onClick={() => setReason(n, t.code)}
                            className={cn('rounded-full border px-2.5 py-1 text-xs', it.reason === t.code ? 'bg-amber-500 text-white border-amber-500' : 'bg-background')}>{t.label}</button>
                        ))}
                      </div>
                    )}
                    {locked ? (it.memo ? <p className="text-xs text-muted-foreground">{it.memo}</p> : null)
                      : <Input value={it.memo} onChange={e => setMemo(n, e.target.value)} placeholder="한 줄 더 (선택) — 어떤 개념? 어떤 실수?" className="h-8 text-xs" maxLength={200} />}
                  </div>); })}
              </div>
              {!locked && <div className="flex justify-between"><Button size="sm" variant="outline" className="h-8" onClick={() => setStep(1)}>이전</Button><Button size="sm" className="h-8" onClick={() => setStep(3)} disabled={missingReason.length > 0}>다음: 내가 할 것</Button></div>}
            </section>
          )}
          {!locked && step === 2 && wrongNums.length === 0 && (
            <p className="text-xs text-muted-foreground">틀린 번호가 없어요. ①에서 번호를 누르거나, 다 맞았으면 ③으로 가요.</p>
          )}

          {/* ③ 다짐 */}
          {(locked || step === 3) && (
            <section className="space-y-2">
              <div className="font-semibold">다음 시험까지 내가 할 것 <span className="text-xs font-normal text-muted-foreground">한 줄이면 돼요</span></div>
              {locked ? <p className="rounded-lg bg-muted/50 px-3 py-2 whitespace-pre-wrap">{r.student_reflection || '적지 않았어요'}</p>
                : <Textarea value={draft.reflection} onChange={e => setDraft(d => ({ ...d, reflection: e.target.value }))} rows={3} maxLength={500}
                    placeholder="예: 계산 실수가 3개라서, 문제 풀고 나서 답 검산을 꼭 한 번 더 하기" className="text-sm" />}
              {!locked && (
                <div className="flex items-center justify-between gap-2">
                  <Button size="sm" variant="outline" className="h-9" onClick={() => setStep(wrongNums.length ? 2 : 1)}>이전</Button>
                  <Button className="h-9 flex-1" disabled={saving} onClick={submit}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : stage === 'todo' ? <Send className="h-4 w-4 mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    {stage === 'todo' ? '제출하기' : '고쳐서 다시 제출'}
                  </Button>
                </div>
              )}
              {!locked && stage !== 'todo' && <p className="text-[11px] text-muted-foreground">{r.student_submitted_at?.slice(0, 10)}에 제출했어요. 공개 전까지는 고칠 수 있어요.</p>}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
