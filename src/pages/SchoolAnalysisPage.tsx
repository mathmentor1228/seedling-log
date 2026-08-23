// SCHOOL-ANALYSIS-V1: 학교알리미 공개 통계 기반 학교분석·상담자료 (조회/로컬 상태 전용, DB 저장 없음)
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, Printer, Info } from 'lucide-react';
import { getDataset, listSchools } from '@/data/schoolAchievement';
import {
  CONSULT_GOALS,
  DEFAULT_FILTER,
  NOT_PROVIDED_LABEL,
  PARENT_VIEW_NOTICE,
  buildConsultDraft,
  buildFilterQuery,
  buildInterpretation,
  buildSourceLabel,
  computeSubjectStats,
  findRow,
  listGrades,
  listSemesters,
  listSubjects,
  parseFilterFromQuery,
  type ConsultGoal,
} from '@/lib/schoolAnalysis';

const BAND_COLORS: Record<string, string> = {
  A: 'bg-primary',
  B: 'bg-primary/70',
  C: 'bg-muted-foreground/60',
  D: 'bg-amber-500/70',
  E: 'bg-destructive/70',
};

function SchoolAnalysisContent() {
  const [params, setParams] = useSearchParams();
  const filter = useMemo(() => parseFilterFromQuery(params.toString()), [params]);
  const schools = listSchools();
  const dataset = getDataset(filter.schoolKey, filter.year);

  const [parentView, setParentView] = useState(false);
  const [goals, setGoals] = useState<ConsultGoal[]>([]);
  const [studentScore, setStudentScore] = useState('');
  const [observation, setObservation] = useState('');
  const [plan, setPlan] = useState<[string, string, string]>(['', '', '']);
  const [printName, setPrintName] = useState('');

  const grades = dataset ? listGrades(dataset) : [];
  const semesters = dataset ? listSemesters(dataset, filter.grade) : [];
  const subjects = dataset ? listSubjects(dataset, filter.grade, filter.semester) : [];
  const row = dataset ? findRow(dataset, filter.grade, filter.semester, filter.subject) : undefined;
  const stats = row ? computeSubjectStats(row) : null;
  const interpretation = dataset && stats ? buildInterpretation(dataset, stats) : null;

  const update = (patch: Partial<typeof filter>) => {
    const next = { ...filter, ...patch };
    if (patch.grade || patch.semester) {
      const sem = patch.grade ? (dataset ? listSemesters(dataset, next.grade)[0] : next.semester) : next.semester;
      next.semester = patch.semester ?? sem ?? next.semester;
      const subs = dataset ? listSubjects(dataset, next.grade, next.semester) : [];
      next.subject = subs.includes(next.subject) ? next.subject : '';
    }
    setParams(new URLSearchParams(buildFilterQuery(next)), { replace: false });
  };

  const handleCopy = async () => {
    if (!dataset || !stats) return;
    const draft = buildConsultDraft(dataset, stats, {
      goals,
      studentScore,
      observation,
      planSteps: plan,
      studentNameOptional: printName,
    });
    try {
      await navigator.clipboard.writeText(draft.text);
      toast.success(
        draft.missing.length > 0
          ? `상담문 초안을 복사했습니다. 미입력: ${draft.missing.join(', ')}`
          : '상담문 초안을 복사했습니다.',
      );
    } catch {
      toast.error('클립보드 복사에 실패했습니다.');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto print-root">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-root, .print-root * { visibility: visible !important; }
          .print-root { position: absolute !important; left: 0; top: 0; width: 100%; max-width: none; padding: 0; margin: 0; }
          .no-print, .no-print * { display: none !important; visibility: hidden !important; }
          .print-block { break-inside: avoid; border: 1px solid #999 !important; }
          .print-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { background: #fff; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>


      <header className="space-y-1">
        <h1 className="text-xl md:text-2xl font-bold">학교분석 · 상담자료</h1>
        <p className="text-xs text-muted-foreground">{dataset ? buildSourceLabel(dataset) : '데이터셋 없음'}</p>
      </header>

      {/* 필터 */}
      <Card className="no-print">
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">학교</Label>
            <Select value={filter.schoolKey} onValueChange={(v) => update({ schoolKey: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {schools.map((s) => <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">학년도</Label>
            <Select value={String(filter.year)} onValueChange={(v) => update({ year: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(schools.find((s) => s.key === filter.schoolKey)?.years ?? [2025]).map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}학년도</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">학년</Label>
            <Select value={filter.grade} onValueChange={(v) => update({ grade: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">학기</Label>
            <Select value={filter.semester} onValueChange={(v) => update({ semester: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {semesters.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2 md:col-span-1">
            <Label className="text-xs">과목</Label>
            <Select value={filter.subject || undefined} onValueChange={(v) => update({ subject: v })}>
              <SelectTrigger><SelectValue placeholder="과목 선택" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 no-print">
        <div className="flex items-center gap-2">
          <Switch id="parent-view" checked={parentView} onCheckedChange={setParentView} />
          <Label htmlFor="parent-view" className="text-sm">학부모 보기</Label>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" /> 인쇄 / PDF
        </Button>
        {!parentView && stats && (
          <Button size="sm" onClick={handleCopy}>
            <Copy className="w-4 h-4 mr-1" /> 상담문 복사
          </Button>
        )}
        <Input
          value={printName}
          onChange={(e) => setPrintName(e.target.value)}
          placeholder="인쇄용 학생 이름(선택, 직접 입력)"
          className="h-9 w-full sm:w-64"
        />
      </div>

      {!dataset && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">선택한 학교/학년도의 공개 통계 데이터가 없습니다.</CardContent></Card>
      )}

      {dataset && !filter.subject && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">상단에서 과목을 선택하면 공개 통계 분포가 표시됩니다.</CardContent></Card>
      )}

      {dataset && filter.subject && !stats && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">해당 조건에 맞는 공개 통계가 없습니다. 학년·학기·과목을 다시 선택해주세요.</CardContent></Card>
      )}

      {dataset && stats && (
        <Card className="print-block">
          <CardHeader className="pb-2">
            <CardTitle className="text-base break-keep">
              {dataset.schoolName} · {dataset.year}학년도 {stats.grade} {stats.semester} · {stats.subject}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border p-2">
                <div className="text-[11px] text-muted-foreground">평균</div>
                <div className="text-lg font-bold">{stats.average}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-[11px] text-muted-foreground">A+B</div>
                <div className="text-lg font-bold break-keep">
                  {stats.topRatio === null ? <span className="text-xs font-normal">{NOT_PROVIDED_LABEL}</span> : `${stats.topRatio}%`}
                </div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-[11px] text-muted-foreground">D+E</div>
                <div className="text-lg font-bold break-keep">
                  {stats.lowRatio === null ? <span className="text-xs font-normal">{NOT_PROVIDED_LABEL}</span> : `${stats.lowRatio}%`}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {(['A', 'B', 'C', 'D', 'E'] as const).map((band) => {
                const v = stats[band.toLowerCase() as 'a' | 'b' | 'c' | 'd' | 'e'];
                return (
                  <div key={band} className="flex items-center gap-2">
                    <span className="w-5 text-xs font-semibold">{band}</span>
                    <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                      {v !== null && (
                        <div className={`h-full print-bar ${BAND_COLORS[band]}`} style={{ width: `${Math.min(100, v)}%` }} />
                      )}
                    </div>
                    <span className="w-32 text-right text-[11px] tabular-nums text-muted-foreground truncate">
                      {v === null ? NOT_PROVIDED_LABEL : `${v}%`}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground">
              A~E 합계 {stats.sum}% {stats.sumWithinTolerance ? '(반올림 오차 허용 범위)' : '(제공 구간만 합산)'} ·
              표준편차·이수학생수는 공개 자료에 없어 표시하지 않습니다.
            </p>
          </CardContent>
        </Card>
      )}

      {interpretation && (
        <Card className="print-block">
          <CardHeader className="pb-2"><CardTitle className="text-base">공개 통계에서 확인되는 분포</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              {interpretation.observed.map((o, i) => <li key={i} className="break-keep">{o}</li>)}
            </ul>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
              <div className="flex items-center gap-1 text-xs font-semibold"><Info className="w-3.5 h-3.5" /> 추가 확인이 필요한 사항</div>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                {interpretation.needsCheck.map((n, i) => <li key={i} className="break-keep">{n}</li>)}
              </ul>
            </div>
            <p className="text-[11px] text-muted-foreground break-keep">{interpretation.basis}</p>
          </CardContent>
        </Card>
      )}

      {!parentView && stats && (
        <Card className="print-block">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">상담 활용 (브라우저에만 유지 · 저장되지 않음)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">상담 목표 (복수 선택)</Label>
              <div className="flex flex-wrap gap-2">
                {CONSULT_GOALS.map((g) => (
                  <Badge
                    key={g}
                    variant={goals.includes(g) ? 'default' : 'outline'}
                    className="cursor-pointer no-print"
                    onClick={() => setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))}
                  >
                    {g}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">학생 현재 점수 (선택 입력)</Label>
                <Input value={studentScore} onChange={(e) => setStudentScore(e.target.value)} placeholder="예: 직전 중간 68점" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">관찰 메모</Label>
                <Input value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="상담 중 확인한 사실만" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">다음 시험 계획 (3단계)</Label>
              {[0, 1, 2].map((i) => (
                <Textarea
                  key={i}
                  value={plan[i]}
                  onChange={(e) => setPlan((prev) => {
                    const next = [...prev] as [string, string, string];
                    next[i] = e.target.value;
                    return next;
                  })}
                  placeholder={`${i + 1}단계`}
                  rows={2}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="print-block">
        <CardContent className="p-4 space-y-1 text-[11px] text-muted-foreground break-keep">
          <p>{PARENT_VIEW_NOTICE}</p>
          {dataset && <p>{buildSourceLabel(dataset)}</p>}
          <p>학생 이름: {printName.trim() || '________________'}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SchoolAnalysisPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <SchoolAnalysisContent />
    </ProtectedRoute>
  );
}
