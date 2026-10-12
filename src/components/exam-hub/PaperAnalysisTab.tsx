// EXAM-HUB-A ③ 시험지 분석 — 학교×과목 카드. 자료 5칸 업로드 + 분석 정리(문항별 난도·포인트) → 학생 개별 피드백에 반영.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList, ExternalLink, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { gradeLabel, type Cycle, type DeepReportRow, type ReportRow } from './examHubUtils';
import { PaperMaterialsSlots } from './PaperMaterialsSlots';
import { PaperAnalysisEditor } from './PaperAnalysisEditor';

interface Props {
  cycle: Cycle;
  reports: ReportRow[];
  subjects: string[];
  deepByReport: Map<string, DeepReportRow>;
  itemCountByReport: Map<string, number>;
  examKey?: { year: number; period: string; examType: 'midterm' | 'final' };
  onChanged?: () => void;
}

export function PaperAnalysisTab({ cycle, reports, subjects, itemCountByReport, examKey, onChanged }: Props) {
  const { user, fullName } = useAuth() as any;
  const archiveHref = `/exam-archive?tab=analysis&school=${encodeURIComponent(cycle.school_name)}`;
  const bySubject = new Map(reports.map(r => [r.subject, r]));
  const all = Array.from(new Set([...subjects, ...reports.map(r => r.subject)])).sort((a, b) => a.localeCompare(b, 'ko'));
  const [created, setCreated] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<{ id: string; subject: string } | null>(null);
  const reload = () => onChanged?.();

  async function ensureReport(subject: string): Promise<string | null> {
    const existing = bySubject.get(subject)?.id || created[subject];
    if (existing) return existing;
    if (!examKey) { toast.error('시험 회차 정보를 알 수 없습니다'); return null; }
    const { data, error } = await (supabase as any).from('exam_analysis_reports').insert({
      school_name: cycle.school_name, grade: gradeLabel(cycle), subject,
      exam_type: examKey.examType === 'midterm' ? '중간고사' : '기말고사',
      exam_year: examKey.year, exam_period: examKey.period,
      created_by: user?.id ?? null, created_by_name: fullName ?? null,
    }).select('id').single();
    if (error) { toast.error('분석보고서 생성 실패: ' + error.message); return null; }
    setCreated(c => ({ ...c, [subject]: data.id }));
    return data.id as string;
  }

  async function openEditor(subject: string) {
    const id = await ensureReport(subject);
    if (id) { setEditor({ id, subject }); reload(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">과목별 시험지 자료·분석 · {reports.length}/{all.length} 작성</span>
        <span className="flex-1" />
        <Button asChild size="sm" variant="outline">
          <Link to={archiveHref}><PenLine className="w-3.5 h-3.5 mr-1" />자료실에서 편집</Link>
        </Button>
      </div>
      {all.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">과목 정보가 없어 카드를 만들 수 없습니다. 시험 정보 탭에서 과목을 채우세요.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {all.map(subject => {
            const r = bySubject.get(subject);
            const items = r ? itemCountByReport.get(r.id) || 0 : 0;
            const hasNotes = !!(r?.overall_review || r?.focus_summary || r?.tricky_points);
            return (
              <Card key={subject} className={cn(!r && 'border-dashed')}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{subject}</span>
                    {r ? (
                      <Badge variant={r.is_published ? 'default' : 'secondary'} className="text-[11px]">{r.is_published ? '학부모 공개' : '내부'}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px]">미작성</Badge>
                    )}
                    {r?.exam_difficulty && <span className="text-xs text-muted-foreground">난이도 {r.exam_difficulty}</span>}
                    {r?.avg_score != null && <span className="text-xs text-muted-foreground">평균 {r.avg_score}</span>}
                  </div>

                  <PaperMaterialsSlots report={r} ensureReport={() => ensureReport(subject)} onChanged={reload} />

                  <div className="rounded-md bg-muted/40 p-2 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">분석 정리</span>
                      <span className="text-muted-foreground">{items > 0 ? `문항 ${items}개` : '문항 없음'} · {hasNotes ? '총평·포인트 있음' : '총평 없음'}</span>
                      <span className="flex-1" />
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => void openEditor(subject)}>
                        <ClipboardList className="w-3 h-3 mr-1" />{items > 0 || hasNotes ? '편집' : '정리하기'}
                      </Button>
                    </div>
                    {r?.tricky_points && <div className="text-muted-foreground line-clamp-2">까다로운 점: {r.tricky_points}</div>}
                  </div>

                  <div className="flex items-center gap-1">
                    {r && (
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                        <Link to={`${archiveHref}&report=${r.id}`}><ExternalLink className="w-3.5 h-3.5 mr-1" />자료실에서 열기</Link>
                      </Button>
                    )}
                    <span className="flex-1" />
                    {r && (
                      <span className="text-[11px] text-muted-foreground">
                        {r.created_by_name ? `${r.created_by_name} · ` : ''}{r.updated_at ? `수정 ${r.updated_at.slice(0, 10)}` : ''}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <PaperAnalysisEditor open={!!editor} onOpenChange={v => { if (!v) setEditor(null); }} reportId={editor?.id ?? null}
        title={`${cycle.school_name} ${gradeLabel(cycle)} ${editor?.subject ?? ''}`} onSaved={reload} />
    </div>
  );
}
