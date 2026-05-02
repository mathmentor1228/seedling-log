import { useEffect, useMemo, useState } from 'react';
import { Search, X, LayoutGrid, List, Calendar as CalendarIcon, ArrowUpDown, Eye, Lock, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

// ANALYSIS_REPORT_BROWSER_V1
// Search · multi-filter · sort · card/list/timeline view for analysis reports.

export type ReportRow = {
  id: string;
  school_name: string;
  grade: string;
  subject: string;
  exam_type: string;
  exam_year: number;
  exam_period: string;
  exam_scope: string | null;
  overall_review: string | null;
  is_locked: boolean | null;
  is_published: boolean | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  view_count?: number;
};

export type SortKey = 'updated_desc' | 'exam_date' | 'school_asc' | 'subject_asc' | 'views_desc';
export type ViewMode = 'card' | 'list' | 'timeline';

const SORT_LABELS: Record<SortKey, string> = {
  updated_desc: '최신 작성순',
  exam_date: '시험일순',
  school_asc: '학교순 (가나다)',
  subject_asc: '과목순',
  views_desc: '조회수순',
};

const SUBJECT_COLORS: Record<string, string> = {
  '수학': 'bg-blue-100 text-blue-700',
  '영어': 'bg-green-100 text-green-700',
  '국어': 'bg-orange-100 text-orange-700',
  '과학': 'bg-purple-100 text-purple-700',
  '기타': 'bg-gray-100 text-gray-600',
};

export type Filters = {
  q: string;
  years: string[];
  periods: string[];
  examTypes: string[];
  schools: string[];
  grades: string[];
  subjects: string[];
  published: string[]; // 'public' | 'private'
};

const EMPTY_FILTERS: Filters = {
  q: '',
  years: [],
  periods: [],
  examTypes: [],
  schools: [],
  grades: [],
  subjects: [],
  published: [],
};

interface Props {
  reports: ReportRow[];
  selectedReportId: string | null;
  onSelect: (report: ReportRow) => void;
  onEdit: (report: ReportRow) => void;
  onDelete: (report: ReportRow) => void;
  viewCounts?: Record<string, number>;
}

export function ReportBrowser({ reports, selectedReportId, onSelect, onEdit, onDelete, viewCounts }: Props) {
  const [filters, setFilters] = useState<Filters>(() => readFromUrl());
  const [sort, setSort] = useState<SortKey>(() => (readFromUrl().sort as SortKey) || 'updated_desc');
  const [view, setView] = useState<ViewMode>(() => (readFromUrl().view as ViewMode) || 'card');
  const [debouncedQ, setDebouncedQ] = useState(filters.q);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  // URL sync
  useEffect(() => {
    syncUrl(filters, sort, view);
  }, [filters, sort, view]);

  // Enrich with view counts
  const enriched = useMemo(
    () => reports.map((r) => ({ ...r, view_count: viewCounts?.[r.id] ?? 0 })),
    [reports, viewCounts],
  );

  // Filter options derived from data
  const opts = useMemo(() => {
    const yearSet = new Set<string>();
    const schoolSet = new Set<string>();
    const subjectSet = new Set<string>();
    const examTypeSet = new Set<string>();
    const gradeSet = new Set<string>();
    for (const r of enriched) {
      yearSet.add(String(r.exam_year));
      schoolSet.add(r.school_name);
      subjectSet.add(r.subject);
      examTypeSet.add(r.exam_type);
      gradeSet.add(r.grade);
    }
    return {
      years: Array.from(yearSet).sort((a, b) => Number(b) - Number(a)),
      schools: Array.from(schoolSet).sort(),
      subjects: Array.from(subjectSet).sort(),
      examTypes: Array.from(examTypeSet).sort(),
      grades: Array.from(gradeSet).sort(),
      periods: ['1학기', '2학기'],
      published: ['public', 'private'],
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = debouncedQ.trim().toLowerCase();
    return enriched.filter((r) => {
      if (q) {
        const hay = [
          r.school_name, r.subject, r.exam_type, r.exam_period, String(r.exam_year),
          r.exam_scope || '', r.overall_review || '', r.created_by_name || '',
          `${r.grade}학년`,
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.years.length && !filters.years.includes(String(r.exam_year))) return false;
      if (filters.periods.length && !filters.periods.includes(r.exam_period)) return false;
      if (filters.examTypes.length && !filters.examTypes.includes(r.exam_type)) return false;
      if (filters.schools.length && !filters.schools.includes(r.school_name)) return false;
      if (filters.grades.length && !filters.grades.includes(r.grade)) return false;
      if (filters.subjects.length && !filters.subjects.includes(r.subject)) return false;
      if (filters.published.length) {
        const isPub = !!r.is_published;
        const want = (isPub ? 'public' : 'private');
        if (!filters.published.includes(want)) return false;
      }
      return true;
    });
  }, [enriched, debouncedQ, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sort) {
        case 'updated_desc':
          return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
        case 'exam_date': {
          // Approximate ordering by year + period + type
          const orderType: Record<string, number> = { '중간고사': 1, '기말고사': 2 };
          const orderPeriod: Record<string, number> = { '1학기': 1, '2학기': 2 };
          const ka = a.exam_year * 100 + (orderPeriod[a.exam_period] || 0) * 10 + (orderType[a.exam_type] || 0);
          const kb = b.exam_year * 100 + (orderPeriod[b.exam_period] || 0) * 10 + (orderType[b.exam_type] || 0);
          return kb - ka;
        }
        case 'school_asc':
          return a.school_name.localeCompare(b.school_name, 'ko');
        case 'subject_asc':
          return a.subject.localeCompare(b.subject, 'ko');
        case 'views_desc':
          return (b.view_count || 0) - (a.view_count || 0);
      }
    });
    return arr;
  }, [filtered, sort]);

  // Stats
  const stats = useMemo(() => {
    const total = enriched.length;
    const pub = enriched.filter((r) => r.is_published).length;
    const priv = total - pub;
    const now = new Date();
    const month = now.getMonth();
    const isCurrentSemester = (m: number) => (month < 7 ? m < 7 : m >= 7);
    const newThisTerm = enriched.filter((r) => {
      const d = new Date(r.created_at);
      return d.getFullYear() === now.getFullYear() && isCurrentSemester(d.getMonth());
    }).length;
    const top = [...enriched].sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0];
    return { total, pub, priv, newThisTerm, top };
  }, [enriched]);

  function clearFilters() {
    setFilters({ ...EMPTY_FILTERS });
  }

  const activeFilterCount =
    (filters.q ? 1 : 0) +
    filters.years.length + filters.periods.length + filters.examTypes.length +
    filters.schools.length + filters.grades.length + filters.subjects.length + filters.published.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Stats summary */}
      <div className="grid shrink-0 grid-cols-2 gap-2 px-3 pt-3 md:grid-cols-4">
        <StatPill label="전체 보고서" value={`${stats.total}개`} tone="primary" />
        <StatPill label="공개 / 비공개" value={`${stats.pub} / ${stats.priv}`} tone="info" />
        <StatPill label="이번 학기 신규" value={`${stats.newThisTerm}건`} tone="success" />
        <StatPill
          label="인기 보고서"
          value={stats.top ? `${stats.top.school_name} ${stats.top.grade} ${stats.top.subject}` : '—'}
          subtitle={stats.top ? `조회 ${stats.top.view_count}회` : undefined}
          tone="warning"
        />
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 mt-3 shrink-0 space-y-2 border-b bg-background/95 px-3 pb-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="제목 / 시험 범위 / 작성자 / 총평 키워드 검색"
              className="h-9 pl-7 text-xs"
            />
            {filters.q ? (
              <button
                onClick={() => setFilters((f) => ({ ...f, q: '' }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <ViewToggle view={view} onChange={setView} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <MultiFilter label="연도" options={opts.years} selected={filters.years} onChange={(v) => setFilters((f) => ({ ...f, years: v }))} />
          <MultiFilter label="학기" options={opts.periods} selected={filters.periods} onChange={(v) => setFilters((f) => ({ ...f, periods: v }))} />
          <MultiFilter label="시험" options={opts.examTypes} selected={filters.examTypes} onChange={(v) => setFilters((f) => ({ ...f, examTypes: v }))} />
          <MultiFilter label="학교" options={opts.schools} selected={filters.schools} onChange={(v) => setFilters((f) => ({ ...f, schools: v }))} />
          <MultiFilter label="학년" options={opts.grades} selected={filters.grades} onChange={(v) => setFilters((f) => ({ ...f, grades: v }))} suffix="학년" />
          <MultiFilter label="과목" options={opts.subjects} selected={filters.subjects} onChange={(v) => setFilters((f) => ({ ...f, subjects: v }))} />
          <MultiFilter
            label="공개"
            options={opts.published}
            selected={filters.published}
            onChange={(v) => setFilters((f) => ({ ...f, published: v }))}
            renderLabel={(v) => (v === 'public' ? '공개' : '비공개')}
          />
          <SortMenu sort={sort} onChange={setSort} />
          {activeFilterCount > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" /> 초기화 ({activeFilterCount})
            </Button>
          ) : null}
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{sorted.length}개 표시 / 전체 {enriched.length}개</span>
          <span className="flex items-center gap-1"><ArrowUpDown className="h-3 w-3" /> {SORT_LABELS[sort]}</span>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">조건에 맞는 보고서가 없습니다</p>
            <p className="text-xs text-muted-foreground">검색어나 필터를 바꿔보거나 초기화해주세요.</p>
            <Button variant="outline" size="sm" onClick={clearFilters}>필터 초기화</Button>
          </div>
        ) : view === 'card' ? (
          <CardView reports={sorted} selectedId={selectedReportId} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />
        ) : view === 'list' ? (
          <ListView reports={sorted} selectedId={selectedReportId} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />
        ) : (
          <TimelineView reports={sorted} selectedId={selectedReportId} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ──

function StatPill({ label, value, subtitle, tone }: { label: string; value: string; subtitle?: string; tone: 'primary' | 'info' | 'success' | 'warning' }) {
  const toneClass = {
    primary: 'border-l-primary/70 bg-primary/5',
    info: 'border-l-info/70 bg-info/5',
    success: 'border-l-success/70 bg-success/5',
    warning: 'border-l-warning/70 bg-warning/5',
  }[tone];
  return (
    <div className={cn('rounded-lg border border-l-[3px] bg-card px-3 py-2', toneClass)}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-foreground">{value}</p>
      {subtitle ? <p className="text-[10px] text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const items: { key: ViewMode; icon: React.ReactNode; title: string }[] = [
    { key: 'card', icon: <LayoutGrid className="h-3.5 w-3.5" />, title: '카드' },
    { key: 'list', icon: <List className="h-3.5 w-3.5" />, title: '리스트' },
    { key: 'timeline', icon: <CalendarIcon className="h-3.5 w-3.5" />, title: '타임라인' },
  ];
  return (
    <div className="flex shrink-0 rounded-md border bg-background">
      {items.map((it) => (
        <button
          key={it.key}
          title={it.title}
          onClick={() => onChange(it.key)}
          className={cn(
            'flex h-8 w-8 items-center justify-center transition',
            view === it.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          {it.icon}
        </button>
      ))}
    </div>
  );
}

function MultiFilter({
  label, options, selected, onChange, suffix = '', renderLabel,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  suffix?: string;
  renderLabel?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={selected.length ? 'default' : 'outline'} size="sm" className="h-7 px-2 text-[11px]">
          {label}{selected.length ? ` · ${selected.length}` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
          {selected.length ? (
            <button className="text-[10px] text-primary hover:underline" onClick={() => onChange([])}>초기화</button>
          ) : null}
        </div>
        <ScrollArea className="max-h-60">
          <div className="space-y-1">
            {options.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-muted-foreground">옵션 없음</p>
            ) : (
              options.map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent">
                  <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} />
                  <span>{renderLabel ? renderLabel(opt) : opt}{suffix}</span>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function SortMenu({ sort, onChange }: { sort: SortKey; onChange: (v: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
          <ArrowUpDown className="mr-1 h-3 w-3" /> 정렬
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="end">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => { onChange(k); setOpen(false); }}
            className={cn(
              'block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent',
              sort === k && 'bg-primary/10 font-semibold text-primary',
            )}
          >
            {SORT_LABELS[k]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ── Views ──

function CardView({ reports, selectedId, onSelect, onEdit, onDelete }: { reports: ReportRow[]; selectedId: string | null; onSelect: (r: ReportRow) => void; onEdit: (r: ReportRow) => void; onDelete: (r: ReportRow) => void }) {
  // Group by school
  const groups: Record<string, ReportRow[]> = {};
  for (const r of reports) {
    (groups[r.school_name] ||= []).push(r);
  }
  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([school, rows]) => (
        <div key={school}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <span className="text-xs font-bold text-foreground">{school}</span>
            <span className="text-[10px] text-muted-foreground">{rows.length}개</span>
            <div className="flex-1 border-t border-border" />
          </div>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelect(r)}
                className={cn(
                  'group relative w-full rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent',
                  selectedId === r.id && 'border-primary bg-primary/5',
                )}
              >
                <span className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <span role="button" onClick={(e) => { e.stopPropagation(); onEdit(r); }} className="inline-flex items-center rounded bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info">수정</span>
                  <span role="button" onClick={(e) => { e.stopPropagation(); onDelete(r); }} className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', r.is_locked ? 'cursor-not-allowed bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive')}>
                    {r.is_locked ? <Lock className="h-2.5 w-2.5" /> : '삭제'}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', SUBJECT_COLORS[r.subject] ?? 'bg-gray-100 text-gray-600')}>{r.subject}</span>
                  <span className="text-xs font-semibold text-foreground">{r.grade}학년</span>
                  {r.is_locked ? <Lock className="h-3 w-3 text-muted-foreground" /> : null}
                  {r.is_published ? <Badge variant="success" className="h-4 px-1 text-[9px]">공개</Badge> : null}
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{r.exam_type}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-muted-foreground">{r.exam_year}년 {r.exam_period} · {r.created_by_name || '미상'}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{format(new Date(r.updated_at || r.created_at), 'MM/dd')}</span>
                </div>
                {r.exam_scope ? <div className="mt-0.5 truncate text-[10px] text-muted-foreground/70">{r.exam_scope}</div> : null}
                {(r.view_count ?? 0) > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><Eye className="h-2.5 w-2.5" /> {r.view_count}</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListView({ reports, selectedId, onSelect, onEdit, onDelete }: { reports: ReportRow[]; selectedId: string | null; onSelect: (r: ReportRow) => void; onEdit: (r: ReportRow) => void; onDelete: (r: ReportRow) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="px-2 py-2 text-left">학교</th>
            <th className="px-2 py-2 text-left">학년</th>
            <th className="px-2 py-2 text-left">과목</th>
            <th className="px-2 py-2 text-left">시험</th>
            <th className="px-2 py-2 text-left">연도/학기</th>
            <th className="px-2 py-2 text-left">작성자</th>
            <th className="px-2 py-2 text-left">수정일</th>
            <th className="px-2 py-2 text-left">조회</th>
            <th className="px-2 py-2 text-left">공개</th>
            <th className="px-2 py-2 text-right">액션</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r)}
              className={cn('cursor-pointer border-t transition hover:bg-accent/50', selectedId === r.id && 'bg-primary/5')}
            >
              <td className="px-2 py-2 font-medium text-foreground">{r.school_name}</td>
              <td className="px-2 py-2">{r.grade}</td>
              <td className="px-2 py-2"><span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', SUBJECT_COLORS[r.subject] ?? 'bg-gray-100 text-gray-600')}>{r.subject}</span></td>
              <td className="px-2 py-2">{r.exam_type}</td>
              <td className="px-2 py-2">{r.exam_year} {r.exam_period}</td>
              <td className="px-2 py-2 text-muted-foreground">{r.created_by_name || '미상'}</td>
              <td className="px-2 py-2 text-muted-foreground">{format(new Date(r.updated_at || r.created_at), 'yy/MM/dd')}</td>
              <td className="px-2 py-2 text-muted-foreground">{r.view_count ?? 0}</td>
              <td className="px-2 py-2">
                {r.is_locked ? <Lock className="inline h-3 w-3 text-muted-foreground" /> :
                  r.is_published ? <Badge variant="success" className="h-4 px-1 text-[9px]">공개</Badge> :
                  <span className="text-[10px] text-muted-foreground">비공개</span>}
              </td>
              <td className="px-2 py-2 text-right">
                <button onClick={(e) => { e.stopPropagation(); onEdit(r); }} className="mr-1 rounded bg-info/10 px-1.5 py-0.5 text-[10px] text-info">수정</button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(r); }} disabled={!!r.is_locked} className={cn('rounded px-1.5 py-0.5 text-[10px]', r.is_locked ? 'bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive')}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineView({ reports, selectedId, onSelect }: { reports: ReportRow[]; selectedId: string | null; onSelect: (r: ReportRow) => void }) {
  // Sort by computed exam date proxy desc
  const orderType: Record<string, number> = { '중간고사': 1, '기말고사': 2 };
  const orderPeriod: Record<string, number> = { '1학기': 1, '2학기': 2 };
  const buckets: Record<string, ReportRow[]> = {};
  for (const r of reports) {
    const key = `${r.exam_year} ${r.exam_period} ${r.exam_type}`;
    (buckets[key] ||= []).push(r);
  }
  const keys = Object.keys(buckets).sort((a, b) => {
    const [ya, pa, ta] = a.split(' ');
    const [yb, pb, tb] = b.split(' ');
    const ka = Number(ya) * 100 + (orderPeriod[pa] || 0) * 10 + (orderType[ta] || 0);
    const kb = Number(yb) * 100 + (orderPeriod[pb] || 0) * 10 + (orderType[tb] || 0);
    return kb - ka;
  });
  return (
    <div className="space-y-4 pl-4">
      {keys.map((k) => (
        <div key={k} className="relative">
          <div className="absolute -left-[14px] top-1 h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
          <div className="absolute -left-[8px] top-3 bottom-0 w-px bg-border" />
          <p className="mb-1.5 text-xs font-bold text-foreground">{k}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {buckets[k].map((r) => (
              <button
                key={r.id}
                onClick={() => onSelect(r)}
                className={cn(
                  'rounded-md border bg-card px-2 py-1.5 text-left text-xs transition hover:bg-accent',
                  selectedId === r.id && 'border-primary bg-primary/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', SUBJECT_COLORS[r.subject] ?? 'bg-gray-100 text-gray-600')}>{r.subject}</span>
                  <span className="font-medium">{r.school_name} {r.grade}학년</span>
                  {r.is_published ? <Badge variant="success" className="ml-auto h-4 px-1 text-[9px]">공개</Badge> : null}
                </div>
                {r.exam_scope ? <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{r.exam_scope}</p> : null}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── URL sync helpers ──

function readFromUrl(): Filters & { sort?: string; view?: string } {
  if (typeof window === 'undefined') return { ...EMPTY_FILTERS };
  const sp = new URLSearchParams(window.location.search);
  const arr = (k: string) => (sp.get(k) ? sp.get(k)!.split(',').filter(Boolean) : []);
  return {
    q: sp.get('q') || '',
    years: arr('years'),
    periods: arr('periods'),
    examTypes: arr('examTypes'),
    schools: arr('schools'),
    grades: arr('grades'),
    subjects: arr('subjects'),
    published: arr('published'),
    sort: sp.get('sort') || undefined,
    view: sp.get('view') || undefined,
  };
}

function syncUrl(filters: Filters, sort: SortKey, view: ViewMode) {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams(window.location.search);
  const setOrDel = (k: string, v: string) => { v ? sp.set(k, v) : sp.delete(k); };
  setOrDel('q', filters.q);
  setOrDel('years', filters.years.join(','));
  setOrDel('periods', filters.periods.join(','));
  setOrDel('examTypes', filters.examTypes.join(','));
  setOrDel('schools', filters.schools.join(','));
  setOrDel('grades', filters.grades.join(','));
  setOrDel('subjects', filters.subjects.join(','));
  setOrDel('published', filters.published.join(','));
  setOrDel('sort', sort === 'updated_desc' ? '' : sort);
  setOrDel('view', view === 'card' ? '' : view);
  const next = sp.toString();
  const url = window.location.pathname + (next ? `?${next}` : '') + window.location.hash;
  window.history.replaceState(null, '', url);
}
