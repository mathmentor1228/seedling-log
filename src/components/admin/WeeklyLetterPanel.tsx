// WEEKLY-LETTER-V1: 편지형 주간 리포트 생성 패널 (시범 운영)
// 1) 재료 점검(dry_run): 선생님 말이 있는 학생 / 메모 없는 학생을 먼저 보여준다
// 2) 편지 생성: 재료가 있는 학생만 작은 묶음으로 생성. 검증 실패는 저장하지 않고 이름을 보여준다
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Mail, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  weekStart: string;
  weekEnd: string;
  onDone?: () => void | Promise<void>;
}

interface Named { id: string; name: string }
interface Ready extends Named { lines: number; verbatim: number; subjects: string[] }
interface Skipped extends Named { reason: string }
interface Failed extends Named { reason: string }

interface LetterResponse {
  ready: Ready[];
  skipped: Skipped[];
  generated: Array<Named & { attempts: number }>;
  failed: Failed[];
  protected: Named[];
  exists: Named[];
  error?: string;
}

const BATCH = 8;

const REASON_LABEL: Record<string, string> = {
  no_teacher_note: '선생님 메모 없음',
  no_lessons: '이번 주 제출 일지 없음',
};

function names(list: Named[], max = 12): string {
  const n = list.map(x => x.name);
  return n.length > max ? `${n.slice(0, max).join(', ')} 외 ${n.length - max}명` : n.join(', ');
}

export function WeeklyLetterPanel({ weekStart, weekEnd, onDone }: Props) {
  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [force, setForce] = useState(false);
  const [check, setCheck] = useState<LetterResponse | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ generated: Named[]; failed: Failed[] } | null>(null);

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('generate-weekly-letter', { body });
    if (error) throw new Error(error.message || '함수 호출 실패');
    const res = data as LetterResponse;
    if (res?.error) throw new Error(res.error);
    return res;
  };

  const runCheck = async () => {
    setChecking(true); setResult(null);
    try {
      const res = await invoke({ week_start: weekStart, week_end: weekEnd, dry_run: true, force });
      setCheck(res);
    } catch (e) {
      toast.error(`재료 점검 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setChecking(false);
    }
  };

  const runGenerate = async () => {
    if (!check || check.ready.length === 0) return;
    setGenerating(true);
    const ids = check.ready.map(r => r.id);
    const generated: Named[] = [];
    const failed: Failed[] = [];
    setProgress({ done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const res = await invoke({ week_start: weekStart, week_end: weekEnd, student_ids: batch, force });
        generated.push(...res.generated);
        failed.push(...res.failed);
        setProgress({ done: Math.min(i + BATCH, ids.length), total: ids.length });
        if (res.failed.some(f => f.reason === 'PAYMENT_REQUIRED' || f.reason === 'RATE_LIMIT')) {
          toast.error('AI 호출 한도에 걸려 중단했습니다. 잠시 뒤 다시 시도해주세요.');
          break;
        }
      }
      setResult({ generated, failed });
      toast.success(`편지 ${generated.length}건 생성${failed.length ? ` · ${failed.length}건은 검증에 걸려 저장하지 않았습니다` : ''}`);
      await onDone?.();
      await runCheck();
    } catch (e) {
      toast.error(`편지 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
      setResult({ generated, failed });
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  };

  const skippedByReason = useMemo(() => {
    const map = new Map<string, Skipped[]>();
    for (const s of check?.skipped ?? []) {
      const arr = map.get(s.reason) ?? [];
      arr.push(s);
      map.set(s.reason, arr);
    }
    return [...map.entries()];
  }, [check]);

  return (
    <Card className="border-dashed border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">편지형 리포트</CardTitle>
            <Badge variant="outline" className="text-[11px]">시범</Badge>
            <Badge variant="outline" className="text-[11px]">{weekStart} ~ {weekEnd}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={runCheck} disabled={checking || generating} className="gap-1.5">
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              재료 점검
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={!check || check.ready.length === 0 || generating} className="gap-1.5">
                  {generating && <Loader2 className="w-4 h-4 animate-spin" />}
                  편지 생성{check ? ` (${check.ready.length}명)` : ''}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{check?.ready.length ?? 0}명의 편지를 만들까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    선생님 메모가 있는 학생만 대상입니다. 초안으로만 저장되며 학부모 공개나 발송은 하지 않습니다.
                    검증에 걸린 문안은 저장하지 않고 이름만 알려드립니다.
                    {force ? ' 기존 초안은 덮어씁니다(공개·발송본 제외).' : ' 이미 초안이 있는 학생은 건너뜁니다.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={runGenerate}>편지 생성</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          선생님이 마감 때 쓴 <b>학부모께 한 줄</b>(학습 이슈·숙제 관찰 포함)을 AI가 학부모 말로 다듬은 4~6문장 편지입니다.
          메모가 없는 학생은 편지를 만들지 않습니다. 지어낸 장면·뭉뚱그린 말·약속형·점수 나열은 검증에서 걸러 저장하지 않습니다.
        </p>
        <div className="flex items-center gap-2">
          <Checkbox id="letter-force" checked={force} onCheckedChange={(v) => setForce(v === true)} />
          <label htmlFor="letter-force" className="text-xs text-muted-foreground cursor-pointer">기존 초안 덮어쓰기 (공개·발송본은 보호)</label>
        </div>

        {progress && (
          <p className="text-xs text-muted-foreground">생성 중… {progress.done} / {progress.total}</p>
        )}

        {check && (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">편지 가능 (메모 있음)</p>
              <p className="text-xl font-bold">{check.ready.length}명</p>
              {check.ready.length > 0 && <p className="text-[11px] text-muted-foreground mt-1">{names(check.ready)}</p>}
            </div>
            {skippedByReason.map(([reason, list]) => (
              <div key={reason} className="rounded-lg border border-warning/40 p-3">
                <p className="text-xs text-muted-foreground">{REASON_LABEL[reason] ?? reason}</p>
                <p className="text-xl font-bold">{list.length}명</p>
                <p className="text-[11px] text-muted-foreground mt-1">{names(list)}</p>
              </div>
            ))}
            {check.exists.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">이미 초안 있음 (덮어쓰기 꺼짐)</p>
                <p className="text-xl font-bold">{check.exists.length}명</p>
                <p className="text-[11px] text-muted-foreground mt-1">{names(check.exists)}</p>
              </div>
            )}
            {check.protected.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">공개·발송됨 (보호)</p>
                <p className="text-xl font-bold">{check.protected.length}명</p>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
            <p>생성됨 {result.generated.length}명{result.generated.length ? `: ${names(result.generated, 20)}` : ''}</p>
            {result.failed.length > 0 && (
              <p className="text-warning">저장 안 함 {result.failed.length}명: {result.failed.map(f => `${f.name}(${f.reason.split(',')[0]})`).join(', ')}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
