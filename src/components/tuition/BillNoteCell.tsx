import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { updateBillNote } from '@/lib/tuitionLedgerApi';

// #35: owner note per bill, edited in place. Notes never change amounts, so no ledger refresh.
export function BillNoteCell({ billId, value, onSaved, label, studentMemo }: { billId: string | null; value: string | null; onSaved: (next: string | null) => void; label: string; studentMemo?: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [shown, setShown] = useState(value);
  const [saving, setSaving] = useState(false);
  const done = useRef(false);
  useEffect(() => { setShown(value); }, [value]);
  const memoTitle = studentMemo ? `학생 메모: ${studentMemo}` : undefined;

  if (!billId) return <span className="block max-w-[200px] cursor-not-allowed truncate text-xs text-muted-foreground/50" title={['청구를 먼저 생성해 주세요', memoTitle].filter(Boolean).join('\n')} aria-disabled="true">비고 입력</span>;

  async function save() {
    if (done.current) return; done.current = true;
    const next = draft.trim() || null;
    setEditing(false);
    if (next === (shown || null)) return;
    const prev = shown;
    setShown(next); setSaving(true);
    try { await updateBillNote(billId!, next); onSaved(next); }
    catch { setShown(prev); toast.error('비고를 저장하지 못했습니다'); }
    finally { setSaving(false); }
  }
  if (editing) return <Input autoFocus aria-label="비고" className="h-7 min-w-40 max-w-[220px] text-xs" value={draft}
    onChange={e => setDraft(e.target.value)} onBlur={save}
    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done.current = true; setEditing(false); } }} />;
  return <button type="button" aria-label={`비고 편집: ${label}`} title={[shown, memoTitle].filter(Boolean).join('\n') || undefined}
    className="flex max-w-[200px] items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onClick={() => { done.current = false; setDraft(shown || ''); setEditing(true); }}>
    <span className={cn('truncate', !shown && 'text-muted-foreground/60')}>{shown || '비고 입력'}</span>
    {saving && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
  </button>;
}
