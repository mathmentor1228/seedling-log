import { useState } from 'react';
import { Loader2, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// AI_PARSE_OPTIONIZATION_V1
// Toggle controls whether AI auto analysis runs on upload.
// When toggle is ON, file selection opens a dialog with 3 modes.

export type AIParseMode = 'append' | 'replace' | 'skip';

const STORAGE_KEY = 'examArchive.aiParse.lastMode';

export function getLastAIParseMode(): AIParseMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'append' || v === 'replace' || v === 'skip') return v;
  } catch {}
  return 'append';
}

function setLastAIParseMode(mode: AIParseMode) {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
}

interface PanelProps {
  isParsing: boolean;
  parseResult: { total_items: number; total_points: number } | null;
  originalPdfPath: string;
  autoAnalyze: boolean;
  onAutoAnalyzeChange: (value: boolean) => void;
  onFileSelected: (file: File, mode: AIParseMode) => void;
  onParseExisting: (mode: Exclude<AIParseMode, 'skip'>) => void;
  hasExistingReview: boolean;
}

export function AIParsePanel({
  isParsing,
  parseResult,
  originalPdfPath,
  autoAnalyze,
  onAutoAnalyzeChange,
  onFileSelected,
  onParseExisting,
  hasExistingReview,
}: PanelProps) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [existingDialogOpen, setExistingDialogOpen] = useState(false);
  const [mode, setMode] = useState<AIParseMode>(getLastAIParseMode());

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!autoAnalyze) {
      // Just upload, no AI analysis
      onFileSelected(file, 'skip');
      return;
    }
    setPendingFile(file);
    setMode(getLastAIParseMode());
    setDialogOpen(true);
  }

  function confirmDialog() {
    if (pendingFile) {
      setLastAIParseMode(mode);
      onFileSelected(pendingFile, mode);
    }
    setDialogOpen(false);
    setPendingFile(null);
  }

  function handleParseExisting() {
    if (hasExistingReview) {
      setMode((m) => (m === 'skip' ? 'append' : m));
      setExistingDialogOpen(true);
    } else {
      onParseExisting('append');
    }
  }

  function confirmExistingDialog() {
    if (mode !== 'skip') {
      setLastAIParseMode(mode);
      onParseExisting(mode);
    }
    setExistingDialogOpen(false);
  }

  return (
    <>
      <section className="rounded-xl bg-gradient-to-br from-info/10 to-primary/10 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 flex items-center gap-2 text-sm font-bold text-info">
              <Sparkles className="h-4 w-4" /> AI 자동 분석
            </p>
            <p className="text-xs text-info/80">
              시험지 이미지나 PDF를 업로드하면 AI가 문항/배점/단원을 자동으로 채워줍니다
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-1.5">
            <Switch
              id="ai-auto-analyze"
              checked={autoAnalyze}
              onCheckedChange={onAutoAnalyzeChange}
              disabled={isParsing}
            />
            <Label htmlFor="ai-auto-analyze" className="cursor-pointer text-xs font-medium">
              AI 자동 분석 {autoAnalyze ? 'ON' : 'OFF'}
            </Label>
          </div>
        </div>
        {!autoAnalyze ? (
          <p className="mb-2 rounded-md border border-dashed border-muted-foreground/30 bg-background/60 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            현재 자동 분석이 꺼져있습니다. 시험지를 업로드하면 파일만 첨부되고, 시험 총평은 직접 작성하세요.
            ON으로 바꾸면 업로드 시 [함께 추가 / 기존 내용 대체 / 입력 안 함] 옵션을 선택할 수 있어요.
          </p>
        ) : null}
        {isParsing ? (
          <div className="mb-2 flex items-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /> AI 분석 중...
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary bg-background px-4 py-3 text-sm font-medium text-primary hover:bg-primary/5">
            <Upload className="h-4 w-4" />
            {autoAnalyze ? '시험지 업로드 (이미지/PDF)' : '시험지만 업로드 (이미지/PDF)'}
            <input type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={handleFile} disabled={isParsing} />
          </label>
          {originalPdfPath && autoAnalyze ? (
            <Button variant="outline" className="h-auto border-primary text-primary" onClick={handleParseExisting} disabled={isParsing}>
              업로드된 시험지로 AI 분석
            </Button>
          ) : null}
        </div>
        {parseResult ? (
          <div className="mt-3 rounded-lg bg-background/70 px-3 py-2 text-xs font-medium text-emerald-700">
            ✓ 분석 완료 — 문항 {parseResult.total_items}개, 총점 {parseResult.total_points}점 추출됨. 아래 내용을 확인하고 수정해주세요.
          </div>
        ) : null}
      </section>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setPendingFile(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI 자동 분석 옵션</DialogTitle>
            <DialogDescription>
              시험지를 업로드합니다. AI가 채운 분석 결과를 시험 총평에 어떻게 반영할까요?
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as AIParseMode)} className="space-y-2 py-2">
            <ParseOption value="append" current={mode} title="함께 추가" desc="기존 시험 총평은 유지하고, AI 분석 결과를 그 아래에 덧붙입니다." />
            <ParseOption value="replace" current={mode} title="기존 내용 대체" desc="기존 시험 총평을 AI 분석 결과로 덮어씁니다. (기존 텍스트는 사라집니다)" />
            <ParseOption value="skip" current={mode} title="자동 입력 안 함" desc="시험지 파일만 업로드하고, 시험 총평/문항 분석은 그대로 둡니다." />
          </RadioGroup>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDialogOpen(false); setPendingFile(null); }}>취소</Button>
            <Button onClick={confirmDialog}>
              {mode === 'skip' ? '업로드만 진행' : 'AI 분석 시작'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={existingDialogOpen} onOpenChange={setExistingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>업로드된 시험지로 다시 분석</DialogTitle>
            <DialogDescription>
              기존 시험 총평이 있어요. AI 분석 결과를 어떻게 반영할까요?
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as AIParseMode)} className="space-y-2 py-2">
            <ParseOption value="append" current={mode} title="함께 추가" desc="기존 시험 총평 아래에 AI 분석 결과를 덧붙입니다." />
            <ParseOption value="replace" current={mode} title="기존 내용 대체" desc="기존 시험 총평을 AI 분석 결과로 덮어씁니다." />
          </RadioGroup>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExistingDialogOpen(false)}>취소</Button>
            <Button onClick={confirmExistingDialog}>AI 분석 시작</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ParseOption({ value, current, title, desc }: { value: AIParseMode; current: AIParseMode; title: string; desc: string }) {
  const selected = value === current;
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
      }`}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
    </label>
  );
}
