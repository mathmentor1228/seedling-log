import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileText, BookMarked, Loader2, FileQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';
import {
  SUBJECT_CATEGORY_LABELS,
  SUBJECT_CATEGORY_COLORS,
  classifySubject,
  type SubjectCategory,
} from '@/lib/subjectCategory';

interface ReportRow {
  id: string;
  school_name: string;
  grade: string | null;
  subject: string | null;
  exam_type: string | null;
  exam_period: string | null;
  exam_year: number | null;
  exam_difficulty: string | null;
  textbook: string | null;
  original_pdf_path: string | null;
  answer_pdf_path: string | null;
  created_by_name: string | null;
}

const CATS: (SubjectCategory | 'all')[] = ['all', 'math', 'english', 'korean', 'science', 'other'];

function resolveBucket(path: string): string {
  if (path.startsWith('exam-papers/') || path.startsWith('exam-pages/') || path.startsWith('unified/')) {
    return 'exam-files';
  }
  return 'exam-analysis';
}

async function openStorageFile(path: string) {
  const url = await getCachedSignedUrl(resolveBucket(path), path, 600);
  if (!url) {
    toast.error('파일을 열지 못했습니다');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function PastExamPaperSearch() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [school, setSchool] = useState<string>('all');
  const [year, setYear] = useState<string>('all');
  const [grade, setGrade] = useState<string>('all');
  const [cat, setCat] = useState<SubjectCategory | 'all'>('all');
  const [examType, setExamType] = useState<string>('all');
  const [filesOnly, setFilesOnly] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('exam_analysis_reports')
        .select('id, school_name, grade, subject, exam_type, exam_period, exam_year, exam_difficulty, textbook, original_pdf_path, answer_pdf_path, created_by_name')
        .order('exam_year', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (!cancelled) {
        if (!error) setReports((data || []) as ReportRow[]);
        else console.error('PastExamPaperSearch fetch error:', error);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const schools = useMemo(
    () => Array.from(new Set(reports.map(r => r.school_name))).sort((a, b) => a.localeCompare(b, 'ko')),
    [reports]
  );
  const years = useMemo(
    () => Array.from(new Set(reports.map(r => r.exam_year).filter((y): y is number => y != null)))
      .sort((a, b) => b - a),
    [reports]
  );
  const examTypes = useMemo(
    () => Array.from(new Set(reports.map(r => r.exam_type).filter(Boolean))) as string[],
    [reports]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter(r => {
      if (filesOnly && !r.original_pdf_path) return false;
      if (school !== 'all' && r.school_name !== school) return false;
      if (year !== 'all' && String(r.exam_year) !== year) return false;
      if (grade !== 'all' && String(r.grade) !== grade) return false;
      if (examType !== 'all' && r.exam_type !== examType) return false;
      if (cat !== 'all' && classifySubject(r.subject) !== cat) return false;
      if (q) {
        const hay = [r.school_name, r.subject, r.exam_type, r.exam_period, r.textbook, r.exam_difficulty, r.created_by_name]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, search, school, year, grade, cat, examType, filesOnly]);

  const handleOpen = async (r: ReportRow, path: string) => {
    setOpeningId(r.id);
    try {
      await openStorageFile(path);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BookMarked className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">기출 시험지 검색</h3>
        <Badge variant="outline" className="text-[10px]">{filtered.length}/{reports.length}건</Badge>
        <button
          onClick={() => setFilesOnly(v => !v)}
          className={cn(
            'ml-auto text-[10px] px-2 py-0.5 rounded-full border transition',
            filesOnly
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted/30 text-muted-foreground border-transparent opacity-70'
          )}
        >
          파일 있는 시험지만
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <div className="relative md:col-span-2">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="학교, 과목, 교재, 시험유형 검색"
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
        <Select value={grade} onValueChange={setGrade}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="학년" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">전체 학년</SelectItem>
            {['1', '2', '3'].map(g => <SelectItem key={g} value={g} className="text-xs">{g}학년</SelectItem>)}
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
        {examTypes.length > 0 && (
          <>
            <span className="text-[10px] text-muted-foreground ml-2 mr-1">유형:</span>
            {examTypes.map(t => (
              <button
                key={t}
                onClick={() => setExamType(v => v === t ? 'all' : t)}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full border transition',
                  examType === t
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/30 text-muted-foreground border-transparent opacity-60'
                )}
              >
                {t}
              </button>
            ))}
          </>
        )}
        {(search || school !== 'all' || year !== 'all' || grade !== 'all' || cat !== 'all' || examType !== 'all' || !filesOnly) && (
          <Button size="sm" variant="ghost" className="h-6 text-[10px] ml-auto"
            onClick={() => { setSearch(''); setSchool('all'); setYear('all'); setGrade('all'); setCat('all'); setExamType('all'); setFilesOnly(true); }}>
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
          조건에 맞는 시험지가 없습니다
        </p>
      ) : (
        <ScrollArea className="h-[360px] pr-3">
          <div className="space-y-2">
            {filtered.map(r => {
              const c = classifySubject(r.subject);
              return (
                <div key={r.id} className="p-2.5 rounded border bg-card text-xs flex items-center gap-2">
                  <FileText className={cn('w-4 h-4 shrink-0', r.original_pdf_path ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">{r.exam_year ?? '연도미정'}</Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.school_name}</Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.grade ? `${r.grade}학년` : '학년미정'}</Badge>
                      {r.subject && (
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', SUBJECT_CATEGORY_COLORS[c])}>
                          {r.subject}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{r.exam_type || '시험'}</Badge>
                      {r.exam_period && <span className="text-[10px] text-muted-foreground">{r.exam_period}</span>}
                      {r.textbook && <span className="text-[10px] text-muted-foreground truncate">· {r.textbook}</span>}
                    </div>
                  </div>
                  {r.original_pdf_path ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] shrink-0 gap-1"
                      disabled={openingId === r.id}
                      onClick={() => handleOpen(r, r.original_pdf_path!)}
                    >
                      {openingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                      시험지 열기
                    </Button>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <FileQuestion className="w-3 h-3" /> 파일 없음
                    </span>
                  )}
                  {r.answer_pdf_path && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px] shrink-0"
                      disabled={openingId === r.id}
                      onClick={() => handleOpen(r, r.answer_pdf_path!)}
                    >
                      정답지
                    </Button>
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
