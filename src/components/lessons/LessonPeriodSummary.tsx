// LESSON-PERIOD-SUMMARY-V1 — 조회 기간 개괄 요약 카드 (조회 전용)
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { summarizeLessonPeriod, type SummaryLesson } from './lessonSummary';

interface Props {
  lessons: SummaryLesson[];
  periodLabel: string;
  truncated?: boolean;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'bad' | 'good' }) {
  const toneClass =
    tone === 'bad' ? 'text-destructive'
      : tone === 'warn' ? 'text-amber-600'
        : tone === 'good' ? 'text-emerald-600'
          : 'text-foreground';
  return (
    <div className="rounded-lg border bg-card/50 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export function LessonPeriodSummary({ lessons, periodLabel, truncated }: Props) {
  const [open, setOpen] = useState(true);
  const s = useMemo(() => summarizeLessonPeriod(lessons), [lessons]);

  if (s.totalLessons === 0) return null;

  const flagged = s.students.filter((st) => st.flags.length > 0);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-4 h-4 text-primary" />
            기간 학습 개괄 <span className="text-xs font-normal text-muted-foreground">{periodLabel}</span>
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
        {truncated && (
          <p className="text-[11px] text-amber-600">기록이 매우 많아 최근 5,000건까지만 요약했습니다. 기간을 좁히면 정확한 요약이 나옵니다.</p>
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <Stat label="수업 기록" value={`${s.totalLessons}건`} />
            <Stat label="학생 수" value={`${s.studentCount}명`} />
            <Stat label="출석률" value={s.attendanceRate === null ? '-' : `${s.attendanceRate}%`} tone={s.attendanceRate !== null && s.attendanceRate < 90 ? 'warn' : 'good'} />
            <Stat label="결석" value={`${s.absent}건`} tone={s.absent > 0 ? 'bad' : undefined} />
            <Stat label="지각·조퇴" value={`${s.late}·${s.earlyLeave}건`} tone={s.late + s.earlyLeave > 0 ? 'warn' : undefined} />
            <Stat label="이해도 평균" value={s.understandingAvg === null ? '-' : `${s.understandingAvg}/5`} />
            <Stat label="숙제 완료" value={`${s.homeworkDone}건`} tone="good" />
            <Stat label="숙제 부분" value={`${s.homeworkPartial}건`} tone={s.homeworkPartial > 0 ? 'warn' : undefined} />
            <Stat label="숙제 미완" value={`${s.homeworkNotDone}건`} tone={s.homeworkNotDone > 0 ? 'bad' : undefined} />
            <Stat label="미마감 일지" value={`${s.unsubmitted}건`} tone={s.unsubmitted > 0 ? 'warn' : undefined} />
            <Stat label="출결 미기록" value={`${s.attendanceUnrecorded}건`} tone={s.attendanceUnrecorded > 0 ? 'warn' : undefined} />
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              학생별 요약 (특이사항 우선 · {s.students.length}명, 특이사항 {flagged.length}명)
            </div>
            <div className="rounded-md border overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">학생</th>
                    <th className="px-3 py-2 font-medium">과목</th>
                    <th className="px-3 py-2 font-medium text-right">수업</th>
                    <th className="px-3 py-2 font-medium text-right">출석률</th>
                    <th className="px-3 py-2 font-medium text-right">이해도</th>
                    <th className="px-3 py-2 font-medium">특이사항</th>
                  </tr>
                </thead>
                <tbody>
                  {s.students.map((st) => (
                    <tr key={st.studentId} className="border-t">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{st.studentName}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{st.subjects.join('·') || '-'}</td>
                      <td className="px-3 py-2 text-right">{st.lessons}</td>
                      <td className={`px-3 py-2 text-right ${st.attendanceRate !== null && st.attendanceRate < 90 ? 'text-amber-600 font-medium' : ''}`}>
                        {st.attendanceRate === null ? '-' : `${st.attendanceRate}%`}
                      </td>
                      <td className="px-3 py-2 text-right">{st.understandingAvg === null ? '-' : st.understandingAvg}</td>
                      <td className="px-3 py-2">
                        {st.flags.length === 0 ? (
                          <span className="text-xs text-muted-foreground">특이사항 없음</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {st.flags.map((f) => (
                              <Badge key={f} variant="outline" className="text-[11px] border-amber-500/40 text-amber-600">{f}</Badge>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default LessonPeriodSummary;
