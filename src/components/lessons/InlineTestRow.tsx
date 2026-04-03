import { useState, useRef, useEffect } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, Minus, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react';
import type { UnifiedTestRecord } from './TestTab';

interface Props {
  record: UnifiedTestRecord;
  expandedStudent: string | null;
  onToggleHistory: (studentId: string) => void;
  onUpdate: (id: string, updates: {
    content?: string;
    score?: string;
    passed?: boolean | null;
    assistant_name?: string | null;
  }, testSlot?: number) => Promise<void>;
}

export function InlineTestRow({ record: r, expandedStudent, onToggleHistory, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(r.content);
  const [score, setScore] = useState(r.score || '');
  const [passed, setPassed] = useState<boolean | null>(r.passed);
  const [assistant, setAssistant] = useState(r.assistant_name || '');
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLInputElement>(null);

  // Sync props when record changes externally
  useEffect(() => {
    if (!editing) {
      setContent(r.content);
      setScore(r.score || '');
      setPassed(r.passed);
      setAssistant(r.assistant_name || '');
    }
  }, [r.content, r.score, r.passed, r.assistant_name, editing]);

  const startEditing = () => {
    setEditing(true);
    setTimeout(() => contentRef.current?.focus(), 50);
  };

  const cancelEditing = () => {
    setContent(r.content);
    setScore(r.score || '');
    setPassed(r.passed);
    setAssistant(r.assistant_name || '');
    setEditing(false);
  };

  const saveChanges = async () => {
    setSaving(true);
    const updates: any = {};
    if (content !== r.content) updates.content = content;
    if (score !== (r.score || '')) updates.score = score;
    if (passed !== r.passed) updates.passed = passed;
    if (assistant !== (r.assistant_name || '')) updates.assistant_name = assistant || null;

    if (Object.keys(updates).length > 0) {
      await onUpdate(r.id, updates, r.test_slot);
    }
    setSaving(false);
    setEditing(false);
  };

  const cyclePassed = () => {
    if (passed === null) setPassed(true);
    else if (passed === true) setPassed(false);
    else setPassed(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveChanges();
    if (e.key === 'Escape') cancelEditing();
  };

  return (
    <TableRow className="group relative">
      <TableCell className="text-sm">{r.test_date}</TableCell>
      <TableCell>
        <button
          onClick={() => onToggleHistory(r.student_id)}
          className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
        >
          {r.student_name}
          {expandedStudent === r.student_id
            ? <ChevronUp className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />}
        </button>
      </TableCell>
      <TableCell><Badge variant="outline" className="text-xs">{r.subject}{r.test_slot === 2 ? ' ②' : ''}</Badge></TableCell>

      {/* Content - inline editable */}
      <TableCell className="max-w-[200px]">
        {editing ? (
          <Input
            ref={contentRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 text-xs"
          />
        ) : (
          <span className={`text-sm truncate block cursor-pointer hover:text-primary ${!r.content ? 'text-orange-500 italic' : ''}`} onClick={startEditing}>
            {r.content || '(단원기입/제목생성요망)'}
          </span>
        )}
      </TableCell>

      {/* Score - inline editable */}
      <TableCell>
        {editing ? (
          <Input
            value={score}
            onChange={e => setScore(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 text-xs w-20"
            placeholder="점수"
          />
        ) : (
          <span className="text-sm cursor-pointer hover:text-primary" onClick={startEditing}>
            {r.score || '-'}
          </span>
        )}
      </TableCell>

      {/* Passed - click to cycle */}
      <TableCell>
        {editing ? (
          <button onClick={cyclePassed} className="p-1 rounded hover:bg-accent">
            {passed === true && <CheckCircle2 className="w-4 h-4 text-green-600" />}
            {passed === false && <XCircle className="w-4 h-4 text-red-600" />}
            {passed === null && <Minus className="w-4 h-4 text-muted-foreground" />}
          </button>
        ) : (
          <button onClick={startEditing} className="cursor-pointer">
            {r.passed === true && <CheckCircle2 className="w-4 h-4 text-green-600" />}
            {r.passed === false && <XCircle className="w-4 h-4 text-red-600" />}
            {r.passed === null && <Minus className="w-4 h-4 text-muted-foreground" />}
          </button>
        )}
      </TableCell>

      {/* Assistant - inline editable */}
      <TableCell>
        {editing ? (
          <Select value={assistant || '__none__'} onValueChange={v => setAssistant(v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">없음</SelectItem>
              <SelectItem value="은서조교">은서조교</SelectItem>
              <SelectItem value="다인조교">다인조교</SelectItem>
              <SelectItem value="유빈조교">유빈조교</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs cursor-pointer hover:text-primary" onClick={startEditing}>
            {r.assistant_name || '-'}
          </span>
        )}
      </TableCell>

      {/* Teacher + action buttons */}
      <TableCell className="text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          {!editing ? (
            <>
              <span>{r.teacher_name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={startEditing}
              >
                <Pencil className="w-3 h-3" />
              </Button>
            </>
          ) : (
            <div className="flex gap-1">
              <Button
                variant="default"
                size="icon"
                className="h-6 w-6"
                onClick={saveChanges}
                disabled={saving}
              >
                <Check className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={cancelEditing}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
