// LINKED-RECORDS-CHIP: per-student chip showing pre-existing test/clinic/self-study records
// for the same day/subject, with a popup to choose how to merge each one into the lesson_record.
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Link2 } from 'lucide-react';

export type MergeChoice = 'merge' | 'replace' | 'skip';

export interface LinkedTest {
  id: string;
  test_type?: string | null;
  content?: string | null;
  score?: string | null;
  passed?: boolean | null;
}
export interface LinkedClinic {
  id: string;
  content?: string | null;
  teacher_note?: string | null;
}
export interface LinkedStudy {
  id: string;
  task_list?: any;
  memo?: string | null;
  duration_minutes?: number | null;
}

export interface LinkedRecordsState {
  tests: LinkedTest[];
  clinics: LinkedClinic[];
  studies: LinkedStudy[];
}

export interface LinkedChoices {
  test: MergeChoice;
  clinic: MergeChoice;
  study: MergeChoice;
}

interface Props {
  studentName: string;
  linked: LinkedRecordsState;
  choices: LinkedChoices;
  onChange: (c: LinkedChoices) => void;
}

export function LinkedRecordsChip({ studentName, linked, choices, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const total = linked.tests.length + linked.clinics.length + linked.studies.length;
  if (total === 0) return null;

  const summary = [
    linked.tests.length > 0 ? `테스트 ${linked.tests.length}` : null,
    linked.clinics.length > 0 ? `클리닉 ${linked.clinics.length}` : null,
    linked.studies.length > 0 ? `자습 ${linked.studies.length}` : null,
  ].filter(Boolean).join(' · ');

  const labelFor = (c: MergeChoice) =>
    c === 'merge' ? '병합' : c === 'replace' ? '대체' : '무시';
  const colorFor = (c: MergeChoice) =>
    c === 'merge'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20'
      : c === 'replace'
      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20'
      : 'bg-muted text-muted-foreground hover:bg-muted/80';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-400 border border-violet-500/30 text-[11px] font-semibold hover:bg-violet-500/25 transition"
        title="이 학생의 외부 기록 처리 방식 선택"
      >
        <Link2 className="w-3 h-3" />
        외부기록 {total}건 ({summary})
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-violet-500" /> {studentName} · 외부 기록 병합
            </DialogTitle>
            <DialogDescription className="text-xs">
              같은 날·같은 과목으로 이미 입력된 기록입니다. 수업일지에 어떻게 반영할지 선택하세요.
              <br />
              <b>병합</b>: 기존 내용 + 외부 기록 합치기 · <b>대체</b>: 외부 기록으로 덮어쓰기 · <b>무시</b>: 이번 일지에 반영하지 않음
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {linked.tests.length > 0 && (
              <SourceBlock
                title={`테스트 기록 (${linked.tests.length}건)`}
                lines={linked.tests.map(t => `[${t.test_type || '테스트'}] ${t.content || '-'}${t.score ? ` · ${t.score}` : ''}${t.passed === true ? ' · 통과' : t.passed === false ? ' · 실패' : ''}`)}
                value={choices.test}
                onChange={(v) => onChange({ ...choices, test: v })}
                labelFor={labelFor}
                colorFor={colorFor}
              />
            )}
            {linked.clinics.length > 0 && (
              <SourceBlock
                title={`클리닉 기록 (${linked.clinics.length}건)`}
                lines={linked.clinics.map(c => c.content || c.teacher_note || '-')}
                value={choices.clinic}
                onChange={(v) => onChange({ ...choices, clinic: v })}
                labelFor={labelFor}
                colorFor={colorFor}
              />
            )}
            {linked.studies.length > 0 && (
              <SourceBlock
                title={`자습 기록 (${linked.studies.length}건)`}
                lines={linked.studies.map(s => {
                  const tasks = Array.isArray(s.task_list)
                    ? s.task_list.map((t: any) => t?.title || t?.name || '').filter(Boolean).join(', ')
                    : '';
                  return `${tasks || s.memo || '-'}${s.duration_minutes ? ` (${s.duration_minutes}분)` : ''}`;
                })}
                value={choices.study}
                onChange={(v) => onChange({ ...choices, study: v })}
                labelFor={labelFor}
                colorFor={colorFor}
              />
            )}
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setOpen(false)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SourceBlock({
  title, lines, value, onChange, labelFor, colorFor,
}: {
  title: string;
  lines: string[];
  value: MergeChoice;
  onChange: (v: MergeChoice) => void;
  labelFor: (c: MergeChoice) => string;
  colorFor: (c: MergeChoice) => string;
}) {
  return (
    <div className="border rounded-md p-3 bg-muted/30">
      <div className="font-semibold text-sm mb-1.5">{title}</div>
      <ul className="text-xs text-muted-foreground space-y-0.5 mb-2 ml-2">
        {lines.map((l, i) => <li key={i} className="truncate">• {l}</li>)}
      </ul>
      <div className="flex gap-1">
        {(['merge', 'replace', 'skip'] as MergeChoice[]).map(c => (
          <Badge
            key={c}
            onClick={() => onChange(c)}
            className={`cursor-pointer ${value === c ? colorFor(c) + ' ring-1 ring-current' : 'bg-background text-muted-foreground border border-border hover:bg-muted'}`}
          >
            {labelFor(c)}
          </Badge>
        ))}
      </div>
    </div>
  );
}
