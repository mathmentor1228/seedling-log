import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileText, Link2, Loader2, Library } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  SUBJECT_CATEGORY_LABELS,
  SUBJECT_CATEGORY_COLORS,
  type SubjectCategory,
} from '@/lib/subjectCategory';
import type { ExamNoteRow } from './ScheduleNotesDialog';

const CATS: (SubjectCategory | 'all')[] = ['all', 'math', 'english', 'korean', 'science', 'other'];

export function ExamMaterialsBrowser() {
  const [notes, setNotes] = useState<ExamNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [school, setSchool] = useState<string>('all');
  const [year, setYear] = useState<string>('all');
  const [cat, setCat] = useState<SubjectCategory | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('school_exam_notes')
        .select('*')
        .order('created_at', { ascending: false });
      if (!cancelled) {
        if (!error) setNotes((data || []) as ExamNoteRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const schools = useMemo(
    () => Array.from(new Set(notes.map(n => n.school_name))).sort((a, b) => a.localeCompare(b, 'ko')),
    [notes]
  );
  const years = useMemo(
    () => Array.from(new Set(notes.map(n => n.year))).sort((a, b) => b - a),
    [notes]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter(n => {
      if (school !== 'all' && n.school_name !== school) return false;
      if (year !== 'all' && String(n.year) !== year) return false;
      if (cat !== 'all' && (n.subject_category || 'other') !== cat) return false;
      if (q) {
        const hay = [n.subject, n.scope, n.note, n.exam_period, n.author_name, ...(n.urls || [])]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [notes, search, school, year, cat]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Library className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">시험범위 · 자료 라이브러리</h3>
        <Badge variant="outline" className="text-[10px]">{filtered.length}/{notes.length}건</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="relative md:col-span-2">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="범위, 메모, URL, 작성자 검색"
            className="h-8 text-xs pl-7"
          />
        </div>
        <Select value={school} onValueChange={setSchool}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="학교" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">전체 학교</SelectItem>
            {schools.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="연도" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">전체 연도</SelectItem>
            {years.map(y => <SelectItem key={y} value={String(y)} className="text-xs">{y}년</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground mr-1">과목:</span>
        {CATS.map(c => {
          const active = cat === c;
          const cls = c === 'all' ? '' : SUBJECT_CATEGORY_COLORS[c];
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full border transition',
                active ? (c === 'all' ? 'bg-primary text-primary-foreground border-primary' : cls)
                       : 'bg-muted/30 text-muted-foreground border-transparent opacity-60'
              )}
            >
              {c === 'all' ? '전체' : SUBJECT_CATEGORY_LABELS[c]}
            </button>
          );
        })}
        {(search || school !== 'all' || year !== 'all' || cat !== 'all') && (
          <Button size="sm" variant="ghost" className="h-6 text-[10px] ml-auto"
            onClick={() => { setSearch(''); setSchool('all'); setYear('all'); setCat('all'); }}>
            필터 초기화
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> 불러오는 중...
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">
          조건에 맞는 자료가 없습니다
        </p>
      ) : (
        <ScrollArea className="h-[420px] pr-3">
          <div className="space-y-2">
            {filtered.map(n => {
              const c = (n.subject_category || 'other') as SubjectCategory;
              return (
                <div key={n.id} className="p-2.5 rounded border bg-card text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{n.school_name}</Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{n.year}년</Badge>
                    {n.exam_period && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{n.exam_period}</Badge>}
                    {n.grade != null && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{n.grade}학년</Badge>}
                    {n.subject && (
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', SUBJECT_CATEGORY_COLORS[c])}>
                        {n.subject}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {n.author_name || '선생님'} · {format(parseISO(n.created_at), 'yyyy-MM-dd', { locale: ko })}
                    </span>
                  </div>
                  {n.scope && (
                    <div className="mb-1 p-1.5 rounded bg-muted/50 text-[11px]">
                      <span className="text-[10px] font-semibold text-muted-foreground mr-1">범위:</span>
                      <span className="whitespace-pre-wrap">{n.scope}</span>
                    </div>
                  )}
                  {n.note && <p className="text-[11px] whitespace-pre-wrap mb-1">{n.note}</p>}
                  {n.urls?.length > 0 && (
                    <div className="space-y-0.5">
                      {n.urls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                           className="flex items-center gap-1 text-[10px] text-primary hover:underline truncate">
                          <Link2 className="w-3 h-3 shrink-0" /> {u}
                        </a>
                      ))}
                    </div>
                  )}
                  {!n.scope && !n.note && (!n.urls || n.urls.length === 0) && (
                    <p className="text-[10px] text-muted-foreground italic">내용 없음</p>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}
