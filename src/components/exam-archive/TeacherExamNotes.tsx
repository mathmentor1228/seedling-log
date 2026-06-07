import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MessageSquarePlus, Trash2, Link2, Loader2, Pencil } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export interface TeacherNote {
  id: string;
  teacher_id: string;
  teacher_name?: string;
  subject?: string | null;
  note: string;
  urls: string[];
  created_at: string;
}

interface Props {
  archiveId: string;
  notes: TeacherNote[];
  onChange: (next: TeacherNote[]) => void;
}

export function TeacherExamNotes({ archiveId, notes, onChange }: Props) {
  const { user, profile } = useAuth() as any;
  const myId = user?.id;
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);

  const persist = async (next: TeacherNote[]) => {
    setSaving(true);
    const { error } = await supabase
      .from('school_exam_archives')
      .update({ teacher_notes: next as any })
      .eq('id', archiveId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    onChange(next);
    return true;
  };

  const addUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    setUrls([...urls, u]);
    setUrlInput('');
  };

  const submitNote = async () => {
    if (!myId || !note.trim()) return;
    const newNote: TeacherNote = {
      id: crypto.randomUUID(),
      teacher_id: myId,
      teacher_name: profile?.full_name || profile?.name || undefined,
      subject: subject.trim() || null,
      note: note.trim(),
      urls,
      created_at: new Date().toISOString(),
    };
    const ok = await persist([...notes, newNote]);
    if (ok) {
      setNote(''); setUrls([]); setUrlInput(''); setSubject(''); setAdding(false);
      toast.success('코멘트 저장');
    }
  };

  const removeNote = async (id: string) => {
    if (!confirm('이 코멘트를 삭제하시겠습니까?')) return;
    await persist(notes.filter(n => n.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold flex items-center gap-1.5">
          <MessageSquarePlus className="w-3.5 h-3.5" /> 담당 선생님 코멘트 & 공유 자료
          <Badge variant="outline" className="text-[10px]">{notes.length}</Badge>
        </h4>
        {!adding && (
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setAdding(true)}>
            + 추가
          </Button>
        )}
      </div>

      {notes.length === 0 && !adding && (
        <p className="text-[11px] text-muted-foreground text-center py-2">아직 등록된 코멘트가 없습니다</p>
      )}

      <div className="space-y-1.5">
        {notes.map(n => {
          const mine = n.teacher_id === myId;
          return (
            <div key={n.id} className="p-2 rounded border bg-card text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant={mine ? 'default' : 'outline'} className="text-[10px] px-1.5 py-0">
                    {n.teacher_name || '선생님'}
                  </Badge>
                  {n.subject && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{n.subject}</Badge>}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
                {mine && (
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeNote(n.id)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                )}
              </div>
              <p className="text-[11px] whitespace-pre-wrap">{n.note}</p>
              {n.urls && n.urls.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {n.urls.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-1 text-[10px] text-primary hover:underline truncate">
                      <Link2 className="w-3 h-3 shrink-0" /> {u}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="p-2 rounded border-2 border-dashed space-y-2 bg-muted/20">
          <Input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="과목 (선택)"
            className="h-7 text-xs"
          />
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="시험범위 관련 특이사항, 강조 단원, 공지 등"
            rows={3}
            className="text-xs"
          />
          <div className="flex gap-1">
            <Input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="대비 자료 URL 추가"
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())}
            />
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={addUrl}>+ URL</Button>
          </div>
          {urls.length > 0 && (
            <div className="space-y-0.5">
              {urls.map((u, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px]">
                  <Link2 className="w-3 h-3 text-muted-foreground" />
                  <span className="truncate flex-1">{u}</span>
                  <button onClick={() => setUrls(urls.filter((_, j) => j !== i))}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAdding(false); setNote(''); setUrls([]); setSubject(''); }}>
              취소
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={submitNote} disabled={saving || !note.trim()}>
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} 저장
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
