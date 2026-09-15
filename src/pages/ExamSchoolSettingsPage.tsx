// EXAM-CYCLES-V1: 학교·시험 일정 — 담당 학교 설정, 시험 사이클(초안→확정), 홈페이지 감시 새 글
// 자동 수집(나이스·홈페이지)은 초안으로만 들어오고, 확정은 원장이 여기서 누른다. 설계: vault 17 재설계안.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CalendarSearch, CheckCircle2, ExternalLink, Loader2, Plus, RefreshCw, School, Trash2 } from 'lucide-react';

const db = supabase as any;
const SUBJECTS = ['수학', '영어', '국어', '과학'];

interface AcademySchool {
  id: string; name: string; official_name: string; aliases: string[]; school_level: string; neis_office_code: string | null; neis_school_code: string | null;
  homepage_url: string | null; boards: { name: string; url: string }[]; grades: number[]; subjects: string[]; lead_weeks: number; is_active: boolean; last_checked_at: string | null;
}
interface CycleSubject { id: string; cycle_id: string; subject: string; exam_date: string | null; period: number | null; scope: string | null; source: string; }
interface Cycle {
  id: string; school_id: string | null; school_name: string; school_level: string; grade_year: number; academic_year: number; semester: string; exam_type: string;
  start_date: string | null; end_date: string | null; status: 'draft' | 'confirmed' | 'cancelled'; source: string; source_url: string | null; notes: string | null; subjects: CycleSubject[];
}
interface WatchPost {
  id: string; school_name: string; board_name: string | null; title: string; posted_on: string | null; post_url: string | null;
  attachments: { name: string; url: string }[]; matched_keywords: string[]; status: string; created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: '초안 · 확인 필요', variant: 'outline' },
  confirmed: { label: '확정', variant: 'default' },
  cancelled: { label: '취소', variant: 'destructive' },
};
const SOURCE_LABEL: Record<string, string> = { manual: '직접 입력', archive: '내신 자료실', neis: '나이스', homepage: '학교 홈페이지' };
const fmt = (d?: string | null) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '-');
const dday = (d?: string | null) => { if (!d) return null; const n = Math.ceil((new Date(d + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000); return n; };

function ExamSchoolSettings() {
  const [schools, setSchools] = useState<AcademySchool[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [posts, setPosts] = useState<WatchPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [openCycle, setOpenCycle] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<AcademySchool> & { aliasesText?: string; gradesText?: string; boardsText?: string }>>({});
  const [newCycle, setNewCycle] = useState({ school_id: '', grade_year: '1', semester: '2학기', exam_type: '중간고사', start_date: '', end_date: '' });
  const [subjectEdit, setSubjectEdit] = useState<Record<string, { exam_date: string; scope: string }>>({});

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: roles } = await db.from('user_roles').select('role').eq('user_id', user.id);
      setIsAdmin((roles || []).some((r: any) => r.role === 'admin'));
    }
    await load();
  }

  async function load() {
    setLoading(true);
    const [sc, cy, su, po] = await Promise.all([
      db.from('academy_schools').select('*').order('school_level').order('name'),
      db.from('exam_cycles').select('*').order('start_date', { ascending: true, nullsFirst: false }),
      db.from('exam_cycle_subjects').select('*').order('subject'),
      db.from('school_watch_log').select('*').order('created_at', { ascending: false }).limit(60),
    ]);
    if (sc.error) toast.error('학교 설정 테이블이 아직 없습니다. Lovable에서 마이그레이션을 먼저 적용해 주세요.');
    const subsBy = new Map<string, CycleSubject[]>();
    for (const s of (su.data || []) as CycleSubject[]) { const a = subsBy.get(s.cycle_id) || []; a.push(s); subsBy.set(s.cycle_id, a); }
    setSchools((sc.data || []) as AcademySchool[]);
    setCycles(((cy.data || []) as any[]).map((c) => ({ ...c, subjects: subsBy.get(c.id) || [] })));
    setPosts((po.data || []) as WatchPost[]);
    setLoading(false);
  }

  // ── 지금 확인 (나이스 + 홈페이지) ──
  async function runWatch(schoolId?: string) {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('watch-school-exams', { body: schoolId ? { school_id: schoolId } : {} });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      const newPosts = (data?.schools || []).reduce((n: number, s: any) => n + (s.boards?.newPosts || 0), 0);
      const newCycles = (data?.schools || []).reduce((n: number, s: any) => n + (s.neis?.cycles || 0), 0);
      toast.success(`확인 완료 — 홈페이지 새 글 ${newPosts}건 · 나이스 일정 ${data?.neis ? `${newCycles}건 반영` : '건너뜀 (NEIS_API_KEY 없음)'}`);
      await load();
    } catch (e: any) {
      toast.error('확인 실패: ' + e.message);
    } finally { setChecking(false); }
  }

  // ── 사이클 ──
  const today = new Date().toISOString().slice(0, 10);
  const visibleCycles = useMemo(() => cycles.filter((c) => showPast || !c.end_date || c.end_date >= today).filter((c) => c.status !== 'cancelled' || showPast), [cycles, showPast, today]);

  async function setCycleStatus(c: Cycle, status: Cycle['status']) {
    const { data: { user } } = await supabase.auth.getUser();
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === 'confirmed') { patch.confirmed_by = user?.id ?? null; patch.confirmed_at = new Date().toISOString(); }
    const { error } = await db.from('exam_cycles').update(patch).eq('id', c.id);
    if (error) { toast.error('변경 실패: ' + error.message); return; }
    toast.success(status === 'confirmed' ? `${c.school_name} ${c.grade_year}학년 ${c.exam_type} 확정` : '상태 변경');
    load();
  }
  async function saveCycleDates(c: Cycle, start: string, end: string) {
    const { error } = await db.from('exam_cycles').update({ start_date: start || null, end_date: end || null, updated_at: new Date().toISOString() }).eq('id', c.id);
    if (error) toast.error('저장 실패: ' + error.message); else { toast.success('날짜 저장'); load(); }
  }
  async function addCycle() {
    const s = schools.find((x) => x.id === newCycle.school_id);
    if (!s) { toast.error('학교를 고르세요'); return; }
    const start = newCycle.start_date; const ay = start ? (Number(start.slice(5, 7)) >= 3 ? Number(start.slice(0, 4)) : Number(start.slice(0, 4)) - 1) : new Date().getFullYear();
    const { error } = await db.from('exam_cycles').insert({
      school_id: s.id, school_name: s.name, school_level: s.school_level, grade_year: Number(newCycle.grade_year), academic_year: ay,
      semester: newCycle.semester, exam_type: newCycle.exam_type, start_date: start || null, end_date: newCycle.end_date || null, status: 'confirmed', source: 'manual', confirmed_at: new Date().toISOString(),
    });
    if (error) { toast.error(error.code === '23505' ? '같은 학교·학년·학기·종류의 사이클이 이미 있습니다' : '추가 실패: ' + error.message); return; }
    toast.success('사이클 추가'); setNewCycle((p) => ({ ...p, start_date: '', end_date: '' })); load();
  }
  async function ensureSubjects(c: Cycle) {
    const s = schools.find((x) => x.id === c.school_id);
    const want = (s?.subjects?.length ? s.subjects : SUBJECTS).filter((sub) => !c.subjects.some((x) => x.subject === sub));
    if (want.length === 0) return;
    const { error } = await db.from('exam_cycle_subjects').insert(want.map((sub) => ({ cycle_id: c.id, subject: sub, source: 'manual' })));
    if (error) toast.error('과목 추가 실패: ' + error.message); else load();
  }
  async function saveSubject(sub: CycleSubject) {
    const e = subjectEdit[sub.id]; if (!e) return;
    const { error } = await db.from('exam_cycle_subjects').update({ exam_date: e.exam_date || null, scope: e.scope || null, updated_at: new Date().toISOString() }).eq('id', sub.id);
    if (error) toast.error('저장 실패: ' + error.message); else { toast.success(`${sub.subject} 저장`); setSubjectEdit((p) => { const n = { ...p }; delete n[sub.id]; return n; }); load(); }
  }

  // ── 학교 설정 ──
  function d(s: AcademySchool) {
    return draft[s.id] ?? { ...s, aliasesText: s.aliases.join(', '), gradesText: s.grades.join(','), boardsText: (s.boards || []).map((b) => `${b.name} | ${b.url}`).join('\n') };
  }
  function setD(id: string, patch: any) { setDraft((p) => ({ ...p, [id]: { ...d(schools.find((x) => x.id === id)!), ...p[id], ...patch } })); }
  async function saveSchool(s: AcademySchool) {
    const v = d(s);
    const boards = (v.boardsText || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name, url] = l.split('|').map((x) => x.trim()); return { name: name || '게시판', url: url || name }; }).filter((b) => /^https?:\/\//.test(b.url));
    const patch = {
      name: v.name, official_name: v.official_name, aliases: (v.aliasesText || '').split(',').map((x) => x.trim()).filter(Boolean),
      school_level: v.school_level, neis_office_code: v.neis_office_code || null, neis_school_code: v.neis_school_code || null, homepage_url: v.homepage_url || null,
      boards, grades: (v.gradesText || '').split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => n >= 1 && n <= 6), subjects: v.subjects || [],
      lead_weeks: Number(v.lead_weeks) || 4, is_active: v.is_active !== false, updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('academy_schools').update(patch).eq('id', s.id);
    if (error) { toast.error('저장 실패: ' + error.message); return; }
    toast.success(`${patch.name} 저장`); setDraft((p) => { const n = { ...p }; delete n[s.id]; return n; }); load();
  }
  async function addSchool() {
    const { error } = await db.from('academy_schools').insert({ name: '새 학교', official_name: '새 학교', school_level: '고', grades: [1, 2, 3], subjects: SUBJECTS, boards: [] });
    if (error) toast.error('추가 실패: ' + error.message); else load();
  }
  async function deleteSchool(s: AcademySchool) {
    if (!confirm(`${s.name} 설정을 삭제할까요? 이 학교의 시험 사이클은 남고 학교 연결만 풀립니다.`)) return;
    const { error } = await db.from('academy_schools').delete().eq('id', s.id);
    if (error) toast.error('삭제 실패: ' + error.message); else load();
  }

  // ── 새 글 ──
  async function setPostStatus(p: WatchPost, status: string) {
    const { error } = await db.from('school_watch_log').update({ status }).eq('id', p.id);
    if (error) toast.error('변경 실패: ' + error.message); else load();
  }

  const draftCount = cycles.filter((c) => c.status === 'draft').length;
  const newPostCount = posts.filter((p) => p.status === 'new').length;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><School className="w-5 h-5" /> 학교·시험 일정</h1>
          <p className="text-sm text-muted-foreground mt-1">담당 학교를 등록해 두면 매일 아침 나이스 학사일정과 학교 홈페이지를 확인해 시험 일정·범위 글을 모아옵니다. 자동으로 들어온 건 <b>초안</b>이고, 확정은 원장님이 누릅니다.</p>
        </div>
        <Button onClick={() => runWatch()} disabled={checking || loading} variant="outline">
          {checking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}지금 확인
        </Button>
      </div>

      <Tabs defaultValue="cycles">
        <TabsList>
          <TabsTrigger value="cycles">시험 일정 {draftCount > 0 && <Badge variant="outline" className="ml-1.5 text-[10px]">초안 {draftCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="posts">홈페이지 새 글 {newPostCount > 0 && <Badge variant="outline" className="ml-1.5 text-[10px]">{newPostCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="schools">학교 설정</TabsTrigger>
        </TabsList>

        {/* ── 시험 일정 ── */}
        <TabsContent value="cycles" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={showPast} onCheckedChange={setShowPast} /> 지난 시험·취소도 보기</label>
            <span className="text-xs text-muted-foreground">{visibleCycles.length}개</span>
          </div>
          {loading ? <div className="text-sm text-muted-foreground">불러오는 중…</div> : visibleCycles.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">등록된 시험 일정이 없습니다. 아래에서 추가하거나 「지금 확인」을 눌러 보세요.</CardContent></Card>
          ) : visibleCycles.map((c) => {
            const dd = dday(c.start_date); const open = openCycle === c.id; const st = STATUS_LABEL[c.status];
            return (
              <Card key={c.id} className={c.status === 'draft' ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20' : ''}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 cursor-pointer" onClick={() => setOpenCycle(open ? null : c.id)}>
                    <span className="font-semibold">{c.school_name} {c.grade_year}학년</span>
                    <span className="text-sm">{c.academic_year} {c.semester} {c.exam_type}</span>
                    <span className="text-sm text-muted-foreground">{fmt(c.start_date)} ~ {fmt(c.end_date)}</span>
                    {dd !== null && dd >= 0 && <Badge variant={dd <= 28 ? 'default' : 'secondary'} className="text-[10px]">D-{dd}</Badge>}
                    <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                    <span className="text-[11px] text-muted-foreground">출처: {SOURCE_LABEL[c.source] || c.source}</span>
                    {c.notes && <span className="text-[11px] text-amber-700">{c.notes}</span>}
                    <span className="ml-auto text-[11px] text-muted-foreground">{c.subjects.filter((s) => s.scope).length}/{c.subjects.length} 과목 범위</span>
                  </div>
                  {open && (
                    <div className="space-y-3 pt-2 border-t">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input type="date" defaultValue={c.start_date ?? ''} id={`s-${c.id}`} className="w-40 h-8 text-xs" />
                        <span className="text-xs">~</span>
                        <Input type="date" defaultValue={c.end_date ?? ''} id={`e-${c.id}`} className="w-40 h-8 text-xs" />
                        <Button size="sm" variant="outline" className="h-8" onClick={() => saveCycleDates(c, (document.getElementById(`s-${c.id}`) as HTMLInputElement).value, (document.getElementById(`e-${c.id}`) as HTMLInputElement).value)}>날짜 저장</Button>
                        {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer" className="text-xs underline flex items-center gap-1"><ExternalLink className="w-3 h-3" />출처 열기</a>}
                        <div className="ml-auto flex gap-2">
                          {c.status !== 'confirmed' && isAdmin && <Button size="sm" className="h-8" onClick={() => setCycleStatus(c, 'confirmed')}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />확정</Button>}
                          {c.status === 'confirmed' && isAdmin && <Button size="sm" variant="ghost" className="h-8" onClick={() => setCycleStatus(c, 'draft')}>초안으로</Button>}
                          {c.status !== 'cancelled' && isAdmin && <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => setCycleStatus(c, 'cancelled')}>취소</Button>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {c.subjects.length === 0 && <Button size="sm" variant="outline" className="h-8" onClick={() => ensureSubjects(c)}><Plus className="w-3.5 h-3.5 mr-1" />담당 과목 칸 만들기</Button>}
                        {c.subjects.map((sub) => {
                          const e = subjectEdit[sub.id] ?? { exam_date: sub.exam_date ?? '', scope: sub.scope ?? '' };
                          const dirty = !!subjectEdit[sub.id];
                          return (
                            <div key={sub.id} className="grid grid-cols-[3.5rem_9rem_1fr_auto] gap-2 items-start">
                              <span className="text-sm font-medium pt-1.5">{sub.subject}</span>
                              <Input type="date" value={e.exam_date} onChange={(ev) => setSubjectEdit((p) => ({ ...p, [sub.id]: { ...e, exam_date: ev.target.value } }))} className="h-8 text-xs" />
                              <Textarea value={e.scope} rows={1} placeholder="시험 범위 (홈페이지 글에서 가져오거나 직접 입력)" onChange={(ev) => setSubjectEdit((p) => ({ ...p, [sub.id]: { ...e, scope: ev.target.value } }))} className="min-h-8 text-xs" />
                              <Button size="sm" variant={dirty ? 'default' : 'ghost'} className="h-8" disabled={!dirty} onClick={() => saveSubject(sub)}>저장</Button>
                            </div>
                          );
                        })}
                        {c.subjects.length > 0 && c.subjects.length < SUBJECTS.length && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => ensureSubjects(c)}><Plus className="w-3 h-3 mr-1" />빠진 과목 추가</Button>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">시험 일정 직접 추가</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Select value={newCycle.school_id} onValueChange={(v) => setNewCycle((p) => ({ ...p, school_id: v }))}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="학교" /></SelectTrigger>
                <SelectContent>{schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={newCycle.grade_year} onValueChange={(v) => setNewCycle((p) => ({ ...p, grade_year: v }))}>
                <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 2, 3, 4, 5, 6].map((g) => <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>)}</SelectContent>
              </Select>
              <Select value={newCycle.semester} onValueChange={(v) => setNewCycle((p) => ({ ...p, semester: v }))}>
                <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1학기">1학기</SelectItem><SelectItem value="2학기">2학기</SelectItem></SelectContent>
              </Select>
              <Select value={newCycle.exam_type} onValueChange={(v) => setNewCycle((p) => ({ ...p, exam_type: v }))}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="중간고사">중간고사</SelectItem><SelectItem value="기말고사">기말고사</SelectItem></SelectContent>
              </Select>
              <Input type="date" value={newCycle.start_date} onChange={(e) => setNewCycle((p) => ({ ...p, start_date: e.target.value }))} className="w-40 h-8 text-xs" />
              <Input type="date" value={newCycle.end_date} onChange={(e) => setNewCycle((p) => ({ ...p, end_date: e.target.value }))} className="w-40 h-8 text-xs" />
              <Button size="sm" className="h-8" onClick={addCycle}><Plus className="w-3.5 h-3.5 mr-1" />추가</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 홈페이지 새 글 ── */}
        <TabsContent value="posts" className="space-y-2 mt-3">
          <p className="text-xs text-muted-foreground">학교 게시판에서 시험·지필·범위·평가계획 제목의 글을 모아둡니다. 첨부(PDF·이미지)를 열어 위 시험 일정의 과목별 범위에 옮겨 적으세요. (첨부 자동 읽기는 다음 단계)</p>
          {posts.length === 0 ? <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">아직 모아온 글이 없습니다. 「지금 확인」을 눌러 보세요.</CardContent></Card> :
            posts.map((p) => (
              <Card key={p.id} className={p.status === 'new' ? 'border-primary/40' : 'opacity-70'}>
                <CardContent className="p-3 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{p.school_name}</Badge>
                  <span className="text-[11px] text-muted-foreground">{p.board_name} · {p.posted_on ?? ''}</span>
                  <a href={p.post_url ?? '#'} target="_blank" rel="noreferrer" className="text-sm font-medium underline-offset-2 hover:underline flex items-center gap-1">{p.title}<ExternalLink className="w-3 h-3" /></a>
                  {(p.attachments || []).map((a, i) => <a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-muted/70">{a.name || `첨부 ${i + 1}`}</a>)}
                  <div className="ml-auto flex gap-1">
                    {p.status === 'new' ? <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPostStatus(p, 'applied')}>반영했음</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPostStatus(p, 'ignored')}>무시</Button>
                    </> : <Badge variant="outline" className="text-[10px]">{p.status === 'applied' ? '반영' : p.status === 'ignored' ? '무시' : p.status}</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
        </TabsContent>

        {/* ── 학교 설정 ── */}
        <TabsContent value="schools" className="space-y-3 mt-3">
          <p className="text-xs text-muted-foreground">짧은 표기(예: 신길고)가 앱 전체의 기준 이름입니다. 별칭에 적은 표기(신길고등학교)는 학생 등록 때 같은 학교로 봅니다. 게시판은 한 줄에 하나, <code>이름 | URL</code>.</p>
          {schools.map((s) => {
            const v = d(s); const dirty = !!draft[s.id];
            return (
              <Card key={s.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <Input value={v.name || ''} onChange={(e) => setD(s.id, { name: e.target.value })} placeholder="짧은 표기" className="h-8 text-sm font-semibold" />
                    <Input value={v.official_name || ''} onChange={(e) => setD(s.id, { official_name: e.target.value })} placeholder="정식명" className="h-8 text-sm" />
                    <Select value={v.school_level || '고'} onValueChange={(x) => setD(s.id, { school_level: x })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="초">초</SelectItem><SelectItem value="중">중</SelectItem><SelectItem value="고">고</SelectItem></SelectContent>
                    </Select>
                    <Input value={v.gradesText ?? ''} onChange={(e) => setD(s.id, { gradesText: e.target.value })} placeholder="담당 학년 1,2,3" className="h-8 text-xs" />
                    <Input type="number" value={v.lead_weeks ?? 4} onChange={(e) => setD(s.id, { lead_weeks: Number(e.target.value) })} placeholder="대비 시작(주 전)" className="h-8 text-xs" title="시험 몇 주 전부터 대비" />
                    <label className="flex items-center gap-2 text-xs"><Switch checked={v.is_active !== false} onCheckedChange={(x) => setD(s.id, { is_active: x })} />감시</label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Input value={v.aliasesText ?? ''} onChange={(e) => setD(s.id, { aliasesText: e.target.value })} placeholder="별칭 (쉼표로)" className="h-8 text-xs" />
                    <div className="flex flex-wrap gap-1 items-center">
                      {SUBJECTS.map((sub) => { const on = (v.subjects || []).includes(sub); return <button key={sub} type="button" onClick={() => setD(s.id, { subjects: on ? (v.subjects || []).filter((x) => x !== sub) : [...(v.subjects || []), sub] })} className={`text-xs px-2 py-1 rounded border ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground'}`}>{sub}</button>; })}
                    </div>
                    <div className="flex gap-2">
                      <Input value={v.neis_office_code || ''} onChange={(e) => setD(s.id, { neis_office_code: e.target.value })} placeholder="나이스 교육청 J10" className="h-8 text-xs w-28" />
                      <Input value={v.neis_school_code || ''} onChange={(e) => setD(s.id, { neis_school_code: e.target.value })} placeholder="나이스 학교코드" className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-2">
                    <Input value={v.homepage_url || ''} onChange={(e) => setD(s.id, { homepage_url: e.target.value })} placeholder="홈페이지 URL" className="h-8 text-xs" />
                    <Textarea value={v.boardsText ?? ''} onChange={(e) => setD(s.id, { boardsText: e.target.value })} rows={2} placeholder={'학교공지 | https://.../selectNttList.do?mi=...&bbsId=...'} className="text-xs" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">마지막 확인: {s.last_checked_at ? new Date(s.last_checked_at).toLocaleString('ko-KR') : '아직'}</span>
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={checking} onClick={() => runWatch(s.id)}><CalendarSearch className="w-3.5 h-3.5 mr-1" />이 학교만 확인</Button>
                      {isAdmin && <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteSchool(s)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                      {isAdmin && <Button size="sm" className="h-7 text-xs" disabled={!dirty} onClick={() => saveSchool(s)}>저장</Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {isAdmin && <Button variant="outline" size="sm" onClick={addSchool}><Plus className="w-3.5 h-3.5 mr-1" />학교 추가</Button>}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ExamSchoolSettingsPage() {
  return <ProtectedRoute><ExamSchoolSettings /></ProtectedRoute>;
}
