// EXAM-PAPER-MATERIALS-V1: 과목 카드의 자료 5칸 (원본/학생용/답안해설/교사용분석지/학부모 카드뉴스)
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Eye, Loader2, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReportRow } from './examHubUtils';

type SingleKey = 'original_pdf_path' | 'student_paper_path' | 'answer_pdf_path' | 'teacher_analysis_pdf_path';
const SLOTS: { key: SingleKey | 'card_image_paths'; label: string; accept: string; prefix: string; hint?: string }[] = [
  { key: 'original_pdf_path', label: '원본 PDF', accept: '.pdf,image/*', prefix: 'original' },
  { key: 'student_paper_path', label: '학생용 시험지', accept: '.pdf,image/*', prefix: 'student-paper' },
  { key: 'answer_pdf_path', label: '답안·해설지', accept: '.pdf,image/*', prefix: 'answer' },
  { key: 'teacher_analysis_pdf_path', label: '교사용 분석지', accept: '.pdf', prefix: 'teacher-analysis', hint: '내부 전용' },
  { key: 'card_image_paths', label: '학부모용 카드뉴스', accept: 'image/*,.pdf', prefix: 'cardnews', hint: '여러 장' },
];

const extOf = (f: File) => (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';

interface Props {
  report: ReportRow | undefined;
  ensureReport: () => Promise<string | null>;
  onChanged: () => void;
}

export function PaperMaterialsSlots({ report, ensureReport, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const cards: string[] = report && Array.isArray(report.card_image_paths) ? (report.card_image_paths as string[]) : [];

  async function upload(slot: typeof SLOTS[number], files: File[]) {
    if (files.length === 0) return;
    setBusy(slot.key);
    try {
      const id = report?.id || await ensureReport();
      if (!id) throw new Error('분석보고서를 만들지 못했습니다');
      const paths: string[] = [];
      for (const f of files) {
        const path = `exam-analysis/${id}/${slot.prefix}-${Date.now()}-${crypto.randomUUID()}.${extOf(f)}`;
        const { error } = await supabase.storage.from('exam-analysis').upload(path, f, { contentType: f.type || undefined, upsert: true });
        if (error) throw error;
        paths.push(path);
      }
      const patch = slot.key === 'card_image_paths'
        ? { card_image_paths: [...cards, ...paths] }
        : { [slot.key]: paths[0] };
      const { error } = await (supabase as any).from('exam_analysis_reports').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      const old = slot.key !== 'card_image_paths' ? (report as any)?.[slot.key] : null;
      if (old) await supabase.storage.from('exam-analysis').remove([old]);
      toast.success(`${slot.label} 올림`);
      onChanged();
    } catch (e: any) {
      toast.error('업로드 실패: ' + (e?.message || e));
    } finally { setBusy(null); }
  }

  async function view(path: string) {
    const url = await getCachedSignedUrl('exam-analysis', path, 600);
    if (url) window.open(url, '_blank'); else toast.error('파일을 열 수 없습니다');
  }

  async function remove(slot: typeof SLOTS[number], path: string) {
    if (!report || !confirm(`${slot.label} 파일을 지울까요?`)) return;
    setBusy(slot.key);
    try {
      const patch = slot.key === 'card_image_paths' ? { card_image_paths: cards.filter(p => p !== path) } : { [slot.key]: null };
      const { error } = await (supabase as any).from('exam_analysis_reports').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', report.id);
      if (error) throw error;
      await supabase.storage.from('exam-analysis').remove([path]);
      toast.success('지웠습니다');
      onChanged();
    } catch (e: any) { toast.error('삭제 실패: ' + (e?.message || e)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-1">
      {SLOTS.map(slot => {
        const single = slot.key !== 'card_image_paths' ? ((report as any)?.[slot.key] as string | null) : null;
        const list = slot.key === 'card_image_paths' ? cards : single ? [single] : [];
        const ok = list.length > 0;
        return (
          <div key={slot.key} className="flex items-center gap-1.5 text-xs">
            <span className={cn('inline-flex items-center gap-1 w-32 shrink-0', ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
              {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              {slot.label}{slot.key === 'card_image_paths' && ok ? ` ${list.length}장` : ''}
            </span>
            {slot.hint && <span className="text-[10px] text-muted-foreground">{slot.hint}</span>}
            <span className="flex-1" />
            {list.length === 1 && (
              <>
                <Button size="icon" variant="ghost" className="h-6 w-6" title="보기" onClick={() => void view(list[0])}><Eye className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" title="지우기" onClick={() => void remove(slot, list[0])}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </>
            )}
            {list.length > 1 && list.map((p, i) => (
              <span key={p} className="inline-flex items-center">
                <Button size="sm" variant="ghost" className="h-6 px-1 text-[11px]" onClick={() => void view(p)}>{i + 1}</Button>
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => void remove(slot, p)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
              </span>
            ))}
            <input ref={el => { inputs.current[slot.key] = el; }} type="file" className="hidden" accept={slot.accept}
              multiple={slot.key === 'card_image_paths'}
              onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; void upload(slot, fs); }} />
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busy !== null}
              onClick={() => inputs.current[slot.key]?.click()}>
              {busy === slot.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
              {slot.key === 'card_image_paths' ? (ok ? '추가' : '올리기') : ok ? '바꾸기' : '올리기'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
