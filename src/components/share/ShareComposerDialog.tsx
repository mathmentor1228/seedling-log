// SHARE-CHANNEL-V1: 새 글 / 수정 창. 제목·본문·태그·파일(여러 개, 끌어다 놓기)·외부 링크.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FileUp, Link2, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  SHARE_MAX_FILE_BYTES, formatBytes, linkLabel, normalizeUrl,
  type SharePost, type SharePostFile,
} from '@/lib/share';
import { TagPicker } from './TagPicker';
import type { ShareDraft } from './useShareChannel';

interface ShareComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 수정이면 기존 글. 없으면 새 글. */
  editing?: SharePost | null;
  existingFiles?: SharePostFile[];
  tagSuggestions: string[];
  onSubmit: (draft: ShareDraft, newFiles: File[]) => Promise<boolean>;
  onDeleteFile?: (file: SharePostFile) => Promise<void>;
}

const EMPTY: ShareDraft = { title: '', body: '', tags: [], links: [] };

export function ShareComposerDialog({
  open, onOpenChange, editing, existingFiles = [], tagSuggestions, onSubmit, onDeleteFile,
}: ShareComposerDialogProps) {
  const [draft, setDraft] = useState<ShareDraft>(EMPTY);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(editing
      ? { title: editing.title, body: editing.body ?? '', tags: editing.tags ?? [], links: editing.links ?? [] }
      : EMPTY);
    setNewFiles([]);
    setLinkInput('');
    setDragging(false);
  }, [open, editing]);

  const pickFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.filter((f) => f.size > SHARE_MAX_FILE_BYTES);
    if (tooBig.length > 0) {
      toast.error(`${tooBig.map((f) => f.name).join(', ')} 은(는) ${formatBytes(SHARE_MAX_FILE_BYTES)} 를 넘습니다. 드라이브 링크로 올려주세요.`);
    }
    const ok = picked.filter((f) => f.size <= SHARE_MAX_FILE_BYTES);
    setNewFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...ok.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    pickFiles(e.dataTransfer.files);
  };

  const addLink = () => {
    const url = normalizeUrl(linkInput);
    if (!url) {
      toast.error('링크 주소를 확인해주세요', { description: 'https:// 로 시작하는 주소만 넣을 수 있습니다.' });
      return;
    }
    if (draft.links.includes(url)) {
      setLinkInput('');
      return;
    }
    setDraft((d) => ({ ...d, links: [...d.links, url] }));
    setLinkInput('');
  };

  const submit = async () => {
    if (!draft.title.trim()) {
      toast.error('제목을 적어주세요');
      return;
    }
    if (linkInput.trim()) {
      toast.error('추가하지 않은 링크가 있습니다', { description: '링크 옆 + 를 누르거나 지워주세요.' });
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit(draft, newFiles);
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? '글 수정' : '자료·전달 올리기'}</DialogTitle>
          <DialogDescription>
            PDF·압축(zip)·한글 등 어떤 파일이든 {formatBytes(SHARE_MAX_FILE_BYTES)} 까지. 더 크면 드라이브 링크로.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="share-title">제목</Label>
            <Input
              id="share-title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="예: 중3 수학 10/18 프린트 · 오답클릭 v3 업데이트"
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="share-body">내용 (선택)</Label>
            <Textarea
              id="share-body"
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              placeholder="어디에 쓰는 자료인지, 언제까지 봐야 하는지 한두 줄"
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <Label>태그</Label>
            <TagPicker
              value={draft.tags}
              onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
              suggestions={tagSuggestions}
            />
          </div>

          <div className="space-y-1.5">
            <Label>파일</Label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-5 text-sm text-muted-foreground transition-colors',
                dragging ? 'border-primary bg-primary/5 text-foreground' : 'hover:bg-accent/50',
              )}
            >
              <FileUp className="h-5 w-5" />
              <span>파일을 끌어다 놓거나 눌러서 고르기 (여러 개 가능)</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => pickFiles(e.target.files)}
              />
            </div>
            {(existingFiles.length > 0 || newFiles.length > 0) && (
              <ul className="space-y-1 text-sm">
                {existingFiles.map((file) => (
                  <li key={file.id} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1">
                    <span className="min-w-0 flex-1 truncate">{file.original_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.file_size)}</span>
                    {onDeleteFile && (
                      <button
                        type="button"
                        onClick={() => { void onDeleteFile(file); }}
                        className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                        aria-label={`${file.original_name} 지우기`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
                {newFiles.map((file, idx) => (
                  <li key={`${file.name}-${idx}`} className="flex items-center gap-2 rounded-md bg-primary/5 px-2 py-1">
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)} · 새 파일</span>
                    <button
                      type="button"
                      onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                      aria-label={`${file.name} 빼기`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="share-link">링크 (드라이브·문서 등)</Label>
            <div className="flex gap-2">
              <Input
                id="share-link"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.nativeEvent as { isComposing?: boolean }).isComposing) return;
                  if (e.key === 'Enter') { e.preventDefault(); addLink(); }
                }}
                placeholder="https://drive.google.com/..."
                inputMode="url"
              />
              <Button type="button" variant="outline" size="icon" onClick={addLink} aria-label="링크 추가">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {draft.links.length > 0 && (
              <ul className="space-y-1 text-sm">
                {draft.links.map((url) => (
                  <li key={url} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 font-medium">{linkLabel(url)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{url}</span>
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, links: d.links.filter((l) => l !== url) }))}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                      aria-label="링크 빼기"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            취소
          </Button>
          <Button type="button" onClick={() => { void submit(); }} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? '올리는 중…' : editing ? '수정 저장' : '올리기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
