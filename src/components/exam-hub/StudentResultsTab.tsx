// EXAM-HUB-A ② 학생 결과 — 사이클 대상 학생×과목 표 + 누락 표시(vault 19 §15) + 과목별·선생님별 요약.
// EXAM-SHEET-SYNC-V1(B단계): 점수 원본은 구글시트, 시험지는 드라이브. Apps Script가 15분마다 밀어 넣고 여기선 상태·미매칭·PDF 보기만.
// EXAM-ADMIN-EDIT-V1(2026-10-10 원장): 원장 권한에서만 누락·공란 점수를 이 자리에서 바로 입력/수정하고 미응시 처리. source='manual'로 남기며,
//   이후 시트에 값이 올라오면 시트 값이 덮어쓴다(시트 값이 비어 있으면 웹 입력을 유지).
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, ArrowDown, ArrowUp, FileText, Loader2, Minus, Pencil, RefreshCw, Save, UserX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';
import { ANALYSIS_STATUS_META, STATUS_META, type ResultPdf, type SheetSync, type StudentAnalysis, type StudentSubjectRow, type WrongReasonTag } from './examHubUtils';
import { StudentAnalysisPanel } from './StudentAnalysisPanel';

interface Props {
  rows: StudentSubjectRow[];
  examLabel: string;
  isTeacher: boolean;
  currentUserId: string | null;
  /** 이 사이클(연도·학기 키)의 동기화 기록, 최신순 */
  syncs?: SheetSync[];
  /** EXAM-ADMIN-EDIT-V1: 원장만 점수 직접 입력 */
  isAdmin?: boolean;
  examKey?: { year: number; period: string; examType: string };
  currentUserName?: string | null;
  onChanged?: () => void;
  /** EXAM-STUDENT-ANALYSIS-V1 */
  analysesByResult?: Map<string, StudentAnalysis>;
  reasonTags?: WrongReasonTag[];
  defaultTotalItemsBySubject?: Map<string, number>;
}

const db = supabase as any;

function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur == null || prev == null) return <span className="text-muted-foreground">-</span>;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Minus className="w-3 h-3" />0</span>;
  return d > 0
    ? <span className="inline-flex items-center gap-0.5 text-emerald-600"><ArrowUp className="w-3 h-3" />{d}</span>
    : <span className="inline-flex items-center gap-0.5 text-red-600"><ArrowDown className="w-3 h-3" />{Math.abs(d)}</span>;
}

const fmtTime = (iso: string) => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** 드라이브에서 복사된 시험지 PDF를 페이지 안에서 연다 (원장 원칙: 링크가 아니라 웹 안에서 바로 보기) */
export function PdfViewer({ pdf, title, onClose }: { pdf: ResultPdf | null; title: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setUrl(null); setFailed(false);
    if (!pdf) return;
    (async () => {
      const u = await getCachedSignedUrl('exam-results', pdf.storage_path, 3600);
      if (cancelled) return;
      if (u) setUrl(u); else setFailed(true);
    })();
    return () => { cancelled = true; };
  }, [pdf]);
  return (
    <Dialog open={!!pdf} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl h-[88vh] p-0 flex flex-col">
        <DialogHeader className="px-4 pt-3 pb-2 border-b">
          <DialogTitle className="text-sm">{title}{pdf?.drive_file_name ? <span className="ml-2 text-xs font-normal text-muted-foreground">{pdf.drive_file_name}</span> : null}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted">
          {failed ? <div className="p-6 text-sm text-destructive">파일을 열 수 없습니다. 저장소 경로: {pdf?.storage_path}</div>
            : !url ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />불러오는 중</div>
              : <iframe title={title} src={`${url}#toolbar=1&navpanes=0`} className="w-full h-full" />}
        </div>
        {url && <div className="px-4 py-2 border-t text-right"><a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">새 창에서 열기 / 다운로드</a></div>}
      </DialogContent>
    </Dialog>
  );
}

export function StudentResultsTab({ rows, examLabel, isTeacher, currentUserId, syncs = [], isAdmin = false, examKey, currentUserName, onChanged, analysesByResult, reasonTags = [], defaultTotalItemsBySubject }: Props) {
  const [analysisRow, setAnalysisRow] = useState<StudentSubjectRow | null>(null);
  const [edit, setEdit] = useState<{ key: string; expected: string; actual: string; note: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function startEdit(r: StudentSubjectRow) {
    setEdit({ key: `${r.student.id}|${r.subject}`, expected: r.result?.expected_score != null ? String(r.result.expected_score) : '', actual: r.result?.actual_score != null ? String(r.result.actual_score) : '', note: r.result?.note || '' });
  }
  async function persist(r: StudentSubjectRow, mode: 'save' | 'absent') {
    if (!examKey || !edit) return;
    const toNum = (v: string) => { const t = v.trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN; };
    const expected = mode === 'absent' ? null : toNum(edit.expected); const actual = mode === 'absent' ? null : toNum(edit.actual);
    if (Number.isNaN(expected) || Number.isNaN(actual)) { toast.error('점수는 0~100 숫자로 입력해 주세요'); return; }
    let note = edit.note.trim();
    if (mode === 'absent' && !note.includes('미응시')) note = note ? `미응시 · ${note}` : '미응시';
    setSaving(true);
    const now = new Date().toISOString();
    const by = currentUserName || '원장';
    const res = r.result
      ? await db.from('student_exam_results').update({ expected_score: expected, actual_score: actual, note: note || null, source: 'manual', is_staff_upload: true, uploaded_by_staff: currentUserId, uploaded_by_staff_name: by, updated_at: now }).eq('id', r.result.id)
      : await db.from('student_exam_results').insert({
          student_id: r.student.id, school_name: r.student.school || '', subject: r.subject, exam_type: examKey.examType, exam_year: examKey.year, exam_period: examKey.period,
          expected_score: expected, actual_score: actual, note: note || null, grade_at_exam: r.student.grade_year != null ? String(r.student.grade_year) : null,
          is_staff_upload: true, uploaded_by_staff: currentUserId, uploaded_by_staff_name: by, source: 'manual', submitted_at: now, exam_date: null,
        });
    setSaving(false);
    if (res.error) { toast.error('저장 실패: ' + res.error.message); return; }
    toast.success(mode === 'absent' ? `${r.student.name} ${r.subject} 미응시 처리` : `${r.student.name} ${r.subject} 점수 저장`);
    setEdit(null); onChanged?.();
  }
  const [subject, setSubject] = useState('all');
  const [teacher, setTeacher] = useState('all');
  const [missingOnly, setMissingOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(isTeacher);
  const [viewing, setViewing] = useState<{ pdf: ResultPdf; title: string } | null>(null);
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);

  const subjects = useMemo(() => Array.from(new Set(rows.map(r => r.subject))).sort((a, b) => a.localeCompare(b, 'ko')), [rows]);
  const teachers = useMemo(() => Array.from(new Set(rows.map(r => r.teacherName || '담당 미지정'))).sort((a, b) => a.localeCompare(b, 'ko')), [rows]);

  // 동기화 상태: 최근 점수 동기화 1건 + 그 이후 파일 동기화 집계
  const sync = useMemo(() => {
    const lastRows = syncs.find(s => s.kind === 'rows') || null;
    const fileSyncs = syncs.filter(s => s.kind === 'file');
    const lastAny = syncs[0] || null;
    const unmatched = (lastRows?.unmatched || []).filter(u => !u.warning);
    const warnings = (lastRows?.unmatched || []).filter(u => u.warning);
    const fileUnmatched = fileSyncs.filter(s => s.files_matched === 0).flatMap(s => s.unmatched || []);
    const filesOk = fileSyncs.reduce((n, s) => n + s.files_matched, 0);
    return { lastRows, lastAny, unmatched, warnings, fileUnmatched, filesOk, errors: (lastRows?.errors || []).length };
  }, [syncs]);

  const filtered = useMemo(() => rows.filter(r => {
    if (subject !== 'all' && r.subject !== subject) return false;
    if (teacher !== 'all' && (r.teacherName || '담당 미지정') !== teacher) return false;
    if (mineOnly && currentUserId && r.teacherId !== currentUserId) return false;
    if (missingOnly && (r.status === 'done' || r.status === 'absent' || r.status === 'untracked')) return false;
    return true;
  }), [rows, subject, teacher, mineOnly, missingOnly, currentUserId]);

  const summary = useMemo(() => {
    type Agg = { key: string; total: number; done: number; missing: number; sum: number; up: number; down: number; prevSum: number; prevN: number };
    const make = (key: string): Agg => ({ key, total: 0, done: 0, missing: 0, sum: 0, up: 0, down: 0, prevSum: 0, prevN: 0 });
    const bySubject = new Map<string, Agg>();
    const byTeacher = new Map<string, Agg>();
    const feed = (m: Map<string, Agg>, key: string, r: StudentSubjectRow) => {
      const a = m.get(key) || m.set(key, make(key)).get(key)!;
      if (r.status === 'absent' || r.status === 'untracked') return;
      a.total += 1;
      if (r.status === 'done') {
        a.done += 1; a.sum += r.result!.actual_score!;
        if (r.previousScore != null) {
          a.prevSum += r.previousScore; a.prevN += 1;
          const d = r.result!.actual_score! - r.previousScore;
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
  const noPdf = rows.filter(r => r.status === 'done' && !r.pdf).length;

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
              <TableCell className="text-right text-sm"><span className="text-emerald-600">▲{a.up}</span> <span className="text-red-600">▼{a.down}</span></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 동기화 상태줄 */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs">
        <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        {sync.lastAny ? (
          <>
            <span>성적취합표 동기화 <span className="font-medium">{fmtTime(sync.lastAny.received_at)}</span></span>
            {sync.lastRows && <span className="text-muted-foreground">· 점수 {sync.lastRows.rows_matched}/{sync.lastRows.rows_total}행</span>}
            {sync.filesOk > 0 && <span className="text-muted-foreground">· 시험지 {sync.filesOk}장</span>}
            {(sync.unmatched.length > 0 || sync.fileUnmatched.length > 0 || sync.warnings.length > 0 || sync.errors > 0) && (
              <Button size="sm" variant="outline" className="h-6 text-[11px] border-amber-300 text-amber-800" onClick={() => setUnmatchedOpen(true)}>
                <AlertTriangle className="w-3 h-3 mr-1" />미매칭 {sync.unmatched.length + sync.fileUnmatched.length}{sync.warnings.length > 0 ? ` · 확인 ${sync.warnings.length}` : ''}{sync.errors > 0 ? ` · 오류 ${sync.errors}` : ''}
              </Button>
            )}
            {sync.lastRows?.spreadsheet_name && <span className="ml-auto text-muted-foreground truncate max-w-[260px]">{sync.lastRows.spreadsheet_name}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">아직 동기화 기록이 없습니다. 성적취합표의 Apps Script(Sync.gs)가 15분마다 점수·시험지를 보냅니다. 지금 보내려면 시트에서 syncNow를 실행하세요.</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        {isTeacher && <label className="flex items-center gap-1.5 text-xs"><Switch checked={mineOnly} onCheckedChange={setMineOnly} />내 학생만</label>}
        <label className="flex items-center gap-1.5 text-xs">
          <Switch checked={missingOnly} onCheckedChange={setMissingOnly} />누락만 보기
          {missingTotal > 0 && <Badge variant="outline" className="text-[11px] text-amber-700 border-amber-300">{missingTotal}</Badge>}
        </label>
        {noPdf > 0 && <span className="text-[11px] text-muted-foreground">시험지 없음 {noPdf}</span>}
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
              const title = `${r.student.name} · ${r.subject} · ${examLabel}`;
              return (
                <TableRow key={`${r.student.id}|${r.subject}`} className={r.status === 'missing' || r.status === 'score_empty' ? 'bg-amber-50/40 dark:bg-amber-950/10' : undefined}>
                  <TableCell className="font-medium">{r.student.name}</TableCell>
                  <TableCell>{r.subject}</TableCell>
                  <TableCell className="text-sm">
                    {r.teacherName || <span className="text-muted-foreground">미지정</span>}
                    {!r.teacherId && r.result?.sheet_teacher_name && <span className="ml-1 text-[10px] text-muted-foreground" title="시트의 담당선생님 열. 앱의 담당 매핑은 아직 없음">시트</span>}
                  </TableCell>
                  {isAdmin && edit?.key === `${r.student.id}|${r.subject}` ? (
                    <>
                      <TableCell className="text-right"><Input value={edit.expected} onChange={e => setEdit({ ...edit, expected: e.target.value })} inputMode="numeric" placeholder="가채점" className="h-7 w-16 text-xs text-right ml-auto" /></TableCell>
                      <TableCell className="text-right"><Input value={edit.actual} onChange={e => setEdit({ ...edit, actual: e.target.value })} inputMode="numeric" placeholder="실점수" autoFocus className="h-7 w-16 text-xs text-right ml-auto" onKeyDown={e => { if (e.key === 'Enter') persist(r, 'save'); if (e.key === 'Escape') setEdit(null); }} /></TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-right text-sm">{r.result?.expected_score ?? <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {r.result?.actual_score ?? <span className="text-muted-foreground">-</span>}
                        {isAdmin && r.status !== 'untracked' && (
                          <button type="button" className="ml-1 inline-flex align-middle rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent" title="원장 직접 입력" onClick={() => startEdit(r)}><Pencil className="w-3 h-3" /></button>
                        )}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right text-sm text-muted-foreground">{r.previousScore ?? '-'}</TableCell>
                  <TableCell className="text-right text-sm"><Delta cur={r.result?.actual_score ?? null} prev={r.previousScore} /></TableCell>
                  <TableCell className="text-center">
                    {r.pdf ? (
                      <button type="button" onClick={() => setViewing({ pdf: r.pdf!, title })} className="inline-flex rounded p-1 hover:bg-accent" title={r.pdf.drive_file_name || '시험지 보기'}>
                        <FileText className="w-4 h-4 text-primary" />
                      </button>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild><span className="inline-flex"><FileText className="w-4 h-4 text-muted-foreground/30" /></span></TooltipTrigger>
                        <TooltipContent>{r.status === 'done' ? '시험지가 아직 드라이브에 없거나 동기화 전입니다' : '시험지 없음'}</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin && edit?.key === `${r.student.id}|${r.subject}` ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        <Input value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="비고" className="h-7 w-[110px] text-xs" />
                        <Button size="icon" variant="default" className="h-7 w-7" disabled={saving} title="저장" onClick={() => persist(r, 'save')}>{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}</Button>
                        <Button size="icon" variant="outline" className="h-7 w-7" disabled={saving} title="미응시 처리" onClick={() => persist(r, 'absent')}><UserX className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving} title="취소" onClick={() => setEdit(null)}><X className="w-3.5 h-3.5" /></Button>
                      </div>
                    ) : (
                      <>
                        <span className={cn('inline-block rounded px-1.5 py-0.5 text-[11px]', meta.cls)}>{meta.label}</span>
                        {r.result?.source === 'manual' && <span className="ml-1 text-[10px] text-muted-foreground" title={`웹에서 직접 입력${r.result.note ? ` · ${r.result.note}` : ''}`}>웹 입력</span>}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {(() => {
                      const a = r.result ? analysesByResult?.get(r.result.id) || null : null;
                      const canOpen = !!r.result && r.status === 'done';
                      const m = a ? ANALYSIS_STATUS_META[a.status] : null;
                      return (
                        <button type="button" disabled={!canOpen} onClick={() => setAnalysisRow(r)} title={canOpen ? '틀린 문항·이유 태그·문안·컨펌' : '점수가 있어야 분석할 수 있습니다'}
                          className={cn('rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap', m ? m.cls : canOpen ? 'border border-dashed text-muted-foreground hover:bg-accent' : 'text-muted-foreground/40')}>
                          {m ? `${m.label}${a!.wrong_count ? ` · 틀림 ${a!.wrong_count}` : ''}` : canOpen ? '분석 시작' : '-'}
                        </button>
                      );
                    })()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        대상 = 이 학교·학년 재원생 × 학원 수강 과목(담당 선생님 연결 기준) ∪ 성적취합표에 올라온 학생. 점수 원본은 시트이며, {isAdmin ? '원장은 연필로 이 자리에서 바로 입력·수정하거나 미응시 처리할 수 있습니다(웹 입력 표시). 이후 시트에 값이 올라오면 시트 값이 우선합니다.' : '미응시는 시트 비고에 "미응시"를 적으면 제외됩니다.'}
      </p>

      <PdfViewer pdf={viewing?.pdf || null} title={viewing?.title || ''} onClose={() => setViewing(null)} />

      {analysisRow && (
        <StudentAnalysisPanel
          row={analysisRow} examLabel={examLabel}
          analysis={analysisRow.result ? analysesByResult?.get(analysisRow.result.id) || null : null}
          tags={reasonTags}
          defaultTotalItems={defaultTotalItemsBySubject?.get(analysisRow.subject) ?? null}
          isAdmin={isAdmin}
          canEdit={isAdmin || (!!currentUserId && analysisRow.teacherId === currentUserId)}
          onClose={() => setAnalysisRow(null)}
          onChanged={() => onChanged?.()}
        />
      )}

      <Dialog open={unmatchedOpen} onOpenChange={setUnmatchedOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="text-sm">동기화에서 매칭되지 않은 항목</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm max-h-[60vh] overflow-auto">
            {sync.unmatched.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">점수 행 — 앱 재원생과 연결 실패 ({sync.unmatched.length})</div>
                <ul className="divide-y rounded-md border">
                  {sync.unmatched.map((u, i) => <li key={i} className="px-3 py-1.5 flex flex-wrap gap-x-3"><span className="text-muted-foreground w-10">#{u.row_no ?? '-'}</span><span className="font-medium">{u.name}</span><span>{u.school} {u.grade}</span><span>{u.subject}</span><span className="text-amber-800">{u.reason}</span></li>)}
                </ul>
                <p className="mt-1 text-[11px] text-muted-foreground">시트의 학교·이름·학년 표기를 학생 관리와 맞추거나, 학생 관리에 등록한 뒤 다음 동기화를 기다리면 됩니다.</p>
              </div>
            )}
            {sync.warnings.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">연결은 됐지만 확인 필요 ({sync.warnings.length})</div>
                <ul className="divide-y rounded-md border">
                  {sync.warnings.map((u, i) => <li key={i} className="px-3 py-1.5 flex flex-wrap gap-x-3"><span className="text-muted-foreground w-10">#{u.row_no ?? '-'}</span><span className="font-medium">{u.name}</span><span>{u.subject}</span><span className="text-muted-foreground">{u.reason}</span></li>)}
                </ul>
              </div>
            )}
            {sync.fileUnmatched.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">시험지 파일 — 학생과 연결 실패 ({sync.fileUnmatched.length})</div>
                <ul className="divide-y rounded-md border">
                  {sync.fileUnmatched.map((u, i) => <li key={i} className="px-3 py-1.5 flex flex-wrap gap-x-3"><span className="font-medium">{u.file}</span><span className="text-amber-800">{u.reason}</span></li>)}
                </ul>
                <p className="mt-1 text-[11px] text-muted-foreground">파일명은 "2026-2-a 과목 학교 이름.pdf" 규칙이어야 합니다. 이름을 고치면 다음 동기화 때 다시 보냅니다.</p>
              </div>
            )}
            {sync.unmatched.length === 0 && sync.warnings.length === 0 && sync.fileUnmatched.length === 0 && <p className="text-muted-foreground">미매칭 항목이 없습니다.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
