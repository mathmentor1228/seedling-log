// STUDENT-BOOK-PROGRESS-V1: 학생×교재 책갈피 — 보조교재 진행 현황
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, BookOpen, Archive, ArchiveRestore } from 'lucide-react';

const db = supabase as any;

const BOOK_ROLES = ['개념', '유형', '연산', '내신대비', '기타'] as const;
const STALE_DAYS = 14;

interface BookRow {
  id: string;
  student_id: string;
  textbook_id: string | null;
  book_title: string;
  subject: string;
  book_role: string;
  total_pages: number | null;
  current_page: number;
  status: string;
  updated_at: string;
}

interface TextbookMeta {
  id: string;
  title: string;
  total_pages: number | null;
  toc: { title: string; start_page: number; end_page: number }[] | null;
}

function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function StudentBookProgress({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<BookRow[]>([]);
  const [textbooks, setTextbooks] = useState<TextbookMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [pageDrafts, setPageDrafts] = useState<Record<string, string>>({});

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRole, setNewRole] = useState<string>('유형');
  const [newTotal, setNewTotal] = useState('');
  const [newPage, setNewPage] = useState('');
  const [distSuggestions, setDistSuggestions] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db.from('student_book_progress')
      .select('*').eq('student_id', studentId).order('updated_at', { ascending: false });
    if (error) {
      // 42P01: 테이블 없음 — 마이그레이션 미적용 상태를 화면에 안내
      if (String(error.message).includes('does not exist') || error.code === '42P01') setTableMissing(true);
      else toast.error(`교재 현황 로드 실패: ${error.message}`);
      setLoading(false);
      return;
    }
    setRows((data as BookRow[]) || []);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    db.from('textbooks').select('id, title, total_pages, toc')
      .then(({ data }: any) => setTextbooks((data as TextbookMeta[]) || []));
  }, []);

  // 배부 기록에서 아직 책갈피에 없는 교재 제안
  useEffect(() => {
    if (!addOpen) return;
    db.from('textbook_distributions')
      .select('textbook_orders(textbook_name)').eq('student_id', studentId)
      .then(({ data }: any) => {
        const names = [...new Set(((data as any[]) || [])
          .map(d => d.textbook_orders?.textbook_name).filter(Boolean))] as string[];
        setDistSuggestions(names.filter(n => !rows.some(r => r.book_title === n)));
      });
  }, [addOpen, studentId, rows]);

  const tocOf = useMemo(() => {
    const map = new Map<string, TextbookMeta>();
    textbooks.forEach(t => map.set(t.title, t));
    return (row: BookRow) => {
      const tb = (row.textbook_id && textbooks.find(t => t.id === row.textbook_id)) || map.get(row.book_title);
      return tb || null;
    };
  }, [textbooks]);

  function unitAt(row: BookRow): string | null {
    const tb = tocOf(row);
    if (!tb?.toc || row.current_page <= 0) return null;
    const unit = tb.toc.find(u => row.current_page >= u.start_page && row.current_page <= u.end_page);
    return unit?.title || null;
  }

  async function addBook(titleOverride?: string) {
    const title = (titleOverride ?? newTitle).trim();
    if (!title) { toast.error('교재명을 입력해주세요'); return; }
    const matched = textbooks.find(t => t.title === title);
    const { error } = await db.from('student_book_progress').insert({
      student_id: studentId,
      textbook_id: matched?.id || null,
      book_title: title,
      book_role: newRole,
      total_pages: newTotal ? Number(newTotal) : matched?.total_pages || null,
      current_page: newPage ? Number(newPage) : 0,
      last_source: 'manual',
    });
    if (error) {
      toast.error(error.message.includes('duplicate') ? '이미 등록된 교재입니다' : `등록 실패: ${error.message}`);
      return;
    }
    toast.success(`${title} 등록됨`);
    setAddOpen(false); setNewTitle(''); setNewTotal(''); setNewPage(''); setNewRole('유형');
    load();
  }

  async function updatePage(row: BookRow, raw: string) {
    const nums = (raw.match(/\d+/g) || []).map(Number);
    if (nums.length === 0) { toast.error('페이지 숫자를 입력해주세요'); return; }
    const page = nums[nums.length - 1];
    const { error } = await db.from('student_book_progress').update({
      current_page: page, last_source: 'manual', updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) { toast.error(`기록 실패: ${error.message}`); return; }
    setPageDrafts(p => ({ ...p, [row.id]: '' }));
    toast.success(`${row.book_title} — p.${page}까지 기록`);
    load();
  }

  async function toggleArchive(row: BookRow) {
    const next = row.status === 'active' ? 'archived' : 'active';
    const { error } = await db.from('student_book_progress').update({
      status: next, updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) { toast.error('상태 변경 실패'); return; }
    toast.success(next === 'archived' ? `${row.book_title} 보관됨` : `${row.book_title} 다시 진행`);
    load();
  }

  if (tableMissing) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-sm">
        <p className="font-medium text-amber-800 dark:text-amber-300">교재 책갈피 테이블이 아직 없습니다</p>
        <p className="text-xs text-muted-foreground mt-1">
          Supabase SQL Editor에서 <code>supabase/migrations/20260716000000_student_book_progress.sql</code> 내용을 실행해주세요.
        </p>
      </div>
    );
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  const active = rows.filter(r => r.status === 'active');
  const archived = rows.filter(r => r.status === 'archived');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          진행 중 {active.length}권{archived.length > 0 && ` · 보관 ${archived.length}권`}
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="w-3 h-3" />교재 추가
        </Button>
      </div>

      {active.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-6">
          진행 중인 교재가 없습니다. "교재 추가"로 등록하세요.
        </p>
      )}

      {(showArchived ? [...active, ...archived] : active).map(row => {
        const pct = row.total_pages ? Math.min(100, Math.round((row.current_page / row.total_pages) * 100)) : null;
        const unit = unitAt(row);
        const stale = row.status === 'active' && daysAgo(row.updated_at) >= STALE_DAYS;
        return (
          <div key={row.id} className={`rounded-xl border p-3 space-y-2 ${row.status === 'archived' ? 'opacity-60' : ''} ${stale ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/10' : ''}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-medium text-sm">{row.book_title}</span>
              <Badge variant="outline" className="text-[10px]">{row.book_role}</Badge>
              {unit && <Badge variant="secondary" className="text-[10px]">{unit}</Badge>}
              {stale && <Badge className="text-[10px] bg-amber-500 text-white">{daysAgo(row.updated_at)}일째 멈춤</Badge>}
              <button
                className="ml-auto text-muted-foreground hover:text-foreground transition"
                title={row.status === 'active' ? '보관 (완료/중단)' : '다시 진행'}
                onClick={() => toggleArchive(row)}
              >
                {row.status === 'active' ? <Archive className="w-3.5 h-3.5" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
              </button>
            </div>

            {pct != null ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">p.{row.current_page} / {row.total_pages} ({pct}%)</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">현재 p.{row.current_page}{row.current_page === 0 && ' (시작 전)'}</p>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground shrink-0">
                {daysAgo(row.updated_at) === 0 ? '오늘' : `${daysAgo(row.updated_at)}일 전`} 기록
              </span>
              {row.status === 'active' && (
                <div className="ml-auto flex items-center gap-1">
                  <Input
                    className="h-7 w-24 text-xs"
                    placeholder="도달 페이지"
                    value={pageDrafts[row.id] ?? ''}
                    onChange={e => setPageDrafts(p => ({ ...p, [row.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') updatePage(row, pageDrafts[row.id] || ''); }}
                  />
                  <Button size="sm" className="h-7 text-xs px-2" onClick={() => updatePage(row, pageDrafts[row.id] || '')}>기록</Button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {archived.length > 0 && (
        <button className="text-[11px] text-muted-foreground hover:text-foreground transition" onClick={() => setShowArchived(v => !v)}>
          {showArchived ? '보관된 교재 숨기기' : `보관된 교재 ${archived.length}권 보기`}
        </button>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>교재 추가</DialogTitle>
            <DialogDescription>이 학생이 진행 중인 보조교재를 등록합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {distSuggestions.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[11px] text-muted-foreground mb-1.5">배부 기록에서 가져오기:</p>
                <div className="flex flex-wrap gap-1.5">
                  {distSuggestions.map(name => (
                    <button
                      key={name}
                      className="text-xs px-2 py-1 rounded-md border bg-background hover:bg-muted transition"
                      onClick={() => setNewTitle(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">교재명</label>
              <Input list="textbook-titles" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="예: 쎈 미적분1" className="mt-1" />
              <datalist id="textbook-titles">
                {textbooks.map(t => <option key={t.id} value={t.title} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-sm font-medium">유형</label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOK_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">총 페이지</label>
                <Input type="number" value={newTotal} onChange={e => setNewTotal(e.target.value)} placeholder="선택" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">현재 페이지</label>
                <Input type="number" value={newPage} onChange={e => setNewPage(e.target.value)} placeholder="0" className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>취소</Button>
            <Button onClick={() => addBook()}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
