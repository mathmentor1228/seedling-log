// EXAM-HUB-A ② 학생 결과 — 사이클 대상 학생×과목 표 + 누락 표시(vault 19 §15) + 과목별·선생님별 요약.
// 점수 원본은 구글시트. B단계에서 "시트 동기화" 버튼이 실제로 동작한다.
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowDown, ArrowUp, FileText, Minus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_META, type StudentSubjectRow } from './examHubUtils';

interface Props {
  rows: StudentSubjectRow[];
  examLabel: string;
  isTeacher: boolean;
  currentUserId: string | null;
}

function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur == null || prev == null) return <span className="text-muted-foreground">-</span>;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Minus className="w-3 h-3" />0</span>;
  return d > 0
    ? <span className="inline-flex items-center gap-0.5 text-emerald-600"><ArrowUp className="w-3 h-3" />{d}</span>
    : <span className="inline-flex items-center gap-0.5 text-red-600"><ArrowDown className="w-3 h-3" />{Math.abs(d)}</span>;
}

export function StudentResultsTab({ rows, examLabel, isTeacher, currentUserId }: Props) {
  const [subject, setSubject] = useState('all');
  const [teacher, setTeacher] = useState('all');
  const [missingOnly, setMissingOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(isTeacher);

  const subjects = useMemo(() => Array.from(new Set(rows.map(r => r.subject))).sort((a, b) => a.localeCompare(b, 'ko')), [rows]);
  const teachers = useMemo(() => Array.from(new Set(rows.map(r => r.teacherName || '담당 미지정'))).sort((a, b) => a.localeCompare(b, 'ko')), [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (subject !== 'all' && r.subject !== subject) return false;
    if (teacher !== 'all' && (r.teacherName || '담당 미지정') !== teacher) return false;
    if (mineOnly && currentUserId && r.teacherId !== currentUserId) return false;
    if (missingOnly && (r.status === 'done' || r.status === 'absent')) return false;
    return true;
  }), [rows, subject, teacher, mineOnly, missingOnly, currentUserId]);

  const summary = useMemo(() => {
    type Agg = { key: string; total: number; done: number; missing: number; sum: number; up: number; down: number; prevSum: number; prevN: number };
    const make = (key: string): Agg => ({ key, total: 0, done: 0, missing: 0, sum: 0, up: 0, down: 0, prevSum: 0, prevN: 0 });
    const bySubject = new Map<string, Agg>();
    const byTeacher = new Map<string, Agg>();
    const feed = (m: Map<string, Agg>, key: string, r: StudentSubjectRow) => {
      const a = m.get(key) || m.set(key, make(key)).get(key)!;
      if (r.status === 'absent') return;
      a.total += 1;
      if (r.status === 'done') {
        a.done += 1; a.sum += r.result!.actual_score!;
        if (r.previous?.actual_score != null) {
          a.prevSum += r.previous.actual_score; a.prevN += 1;
          const d = r.result!.actual_score! - r.previous.actual_score;
          if (d > 0) a.up += 1; else if (d < 0) a.down += 1;
        }
      } else a.missing += 1;
    };
    for (const r of rows) {
      if (mineOnly && currentUserId && r.teacherId !== currentUserId) continue;
      feed(bySubject, r.subject, r);
      feed(byTeacher, `${r.teacherName || '담당 미지정'} · ${r.subject}`, r);
    }
    const sortAgg = (m: Map<string, Agg>) => Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key, 'ko'));
    return { bySubject: sortAgg(bySubject), byTeacher: sortAgg(byTeacher) };
  }, [rows, mineOnly, currentUserId]);

  const missingTotal = rows.filter(r => r.status === 'missing' || r.status === 'score_empty').length;

  const SummaryTable = ({ title, items }: { title: string; items: typeof summary.bySubject }) => (
    <div className="rounded-md border">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">{title}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">구분</TableHead>
            <TableHead className="text-xs text-right">입력</TableHead>
            <TableHead className="text-xs text-right">누락</TableHead>
            <TableHead className="text-xs text-right">평균</TableHead>
            <TableHead className="text-xs text-right">직전 평균</TableHead>
            <TableHead className="text-xs text-right">상승/하락</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground text-center">대상 없음</TableCell></TableRow>}
          {items.map(a => (
            <TableRow key={a.key}>
              <TableCell className="text-sm">{a.key}</TableCell>
              <TableCell className="text-right text-sm">{a.done}/{a.total}</TableCell>
              <TableCell className={cn('text-right text-sm', a.missing > 0 && 'text-amber-700 font-medium')}>{a.missing}</TableCell>
              <TableCell className="text-right text-sm">{a.done > 0 ? (a.sum / a.done).toFixed(1) : '-'}</TableCell>
              <TableCell className="text-right text-sm">{a.prevN > 0 ? (a.prevSum / a.prevN).toFixed(1) : '-'}</TableCell>
              <TableCell className="text-right text-sm">
                <span className="text-emerald-600">▲{a.up}</span> <span className="text-red-600">▼{a.down}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button size="sm" variant="outline" disabled><RefreshCw className="w-3.5 h-3.5 mr-1" />시트 동기화</Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>구글시트 성적취합표 연동은 B단계에서 켜집니다. 지금은 기존 저장된 점수만 표시합니다.</TooltipContent>
        </Tooltip>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전 과목</SelectItem>
            {subjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={teacher} onValueChange={setTeacher}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">선생님 전체</SelectItem>
            {teachers.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {isTeacher && (
          <label className="flex items-center gap-1.5 text-xs"><Switch checked={mineOnly} onCheckedChange={setMineOnly} />내 학생만</label>
        )}
        <label className="flex items-center gap-1.5 text-xs">
          <Switch checked={missingOnly} onCheckedChange={setMissingOnly} />누락만 보기
          {missingTotal > 0 && <Badge variant="outline" className="text-[11px] text-amber-700 border-amber-300">{missingTotal}</Badge>}
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{examLabel} · {filtered.length}행</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SummaryTable title="과목별" items={summary.bySubject} />
        <SummaryTable title="선생님별" items={summary.byTeacher} />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>학생</TableHead>
              <TableHead className="w-[64px]">과목</TableHead>
              <TableHead className="w-[90px]">선생님</TableHead>
              <TableHead className="w-[70px] text-right">가채점</TableHead>
              <TableHead className="w-[70px] text-right">실점수</TableHead>
              <TableHead className="w-[70px] text-right">직전</TableHead>
              <TableHead className="w-[70px] text-right">변동</TableHead>
              <TableHead className="w-[64px] text-center">시험지</TableHead>
              <TableHead className="w-[110px]">상태</TableHead>
              <TableHead className="w-[90px]">분석</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                {rows.length === 0 ? '이 사이클의 학교·학년에 해당하는 재원생이 없거나, 수강 과목(담당 선생님) 연결이 없습니다.' : '조건에 맞는 행이 없습니다.'}
              </TableCell></TableRow>
            )}
            {filtered.map(r => {
              const meta = STATUS_META[r.status];
              return (
                <TableRow key={`${r.student.id}|${r.subject}`} className={r.status === 'missing' || r.status === 'score_empty' ? 'bg-amber-50/40 dark:bg-amber-950/10' : undefined}>
                  <TableCell className="font-medium">{r.student.name}</TableCell>
                  <TableCell>{r.subject}</TableCell>
                  <TableCell className="text-sm">{r.teacherName || <span className="text-muted-foreground">미지정</span>}</TableCell>
                  <TableCell className="text-right text-sm">{r.result?.expected_score ?? <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{r.result?.actual_score ?? <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{r.previous?.actual_score ?? '-'}</TableCell>
                  <TableCell className="text-right text-sm"><Delta cur={r.result?.actual_score ?? null} prev={r.previous?.actual_score ?? null} /></TableCell>
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger asChild><span className="inline-flex"><FileText className="w-4 h-4 text-muted-foreground/40" /></span></TooltipTrigger>
                      <TooltipContent>드라이브 시험지 연결은 B단계에서 켜집니다.</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell><span className={cn('inline-block rounded px-1.5 py-0.5 text-[11px]', meta.cls)}>{meta.label}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.result?.review_status ? r.result.review_status : '-'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        대상 = 이 학교·학년 재원생 × 학원 수강 과목(담당 선생님 연결 기준). "미입력"은 시험을 봤는데 값이 없는 학생입니다. 미응시는 비고에 "미응시"를 적으면 제외됩니다.
      </p>
    </div>
  );
}
