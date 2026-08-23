// MENTOR-MAP-V1: 상담 신청 관리 + 맞춤 학습방향 제안서(인쇄). 재원생 students와 분리.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Printer, Compass, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import {
  EMPTY_ANSWERS,
  LEVEL_LABEL,
  REQUEST_STATUS,
  STATUS_LABEL,
  type MentorMapAnswers,
  type RequestStatus,
} from '@/lib/mentorMap/types';
import { maskPhone } from '@/lib/mentorMap/rules';
import { buildProposal, buildStudentSummary, toSlides } from '@/lib/mentorMap/proposal';

interface RequestRow {
  id: string;
  created_at: string;
  status: RequestStatus;
  student_name: string;
  author_type: MentorMapAnswers['author_type'];
  school_level: MentorMapAnswers['school_level'];
  contact_phone: string;
  contact_owner: 'parent' | 'student';
  school_name: string | null;
  grade: string | null;
  subjects: string[];
  priority_subjects: string[];
  preferred_method: string | null;
  preferred_time: string | null;
  student_answers: Record<string, string | string[]>;
  parent_answers: Record<string, string | string[]>;
  subject_answers: Record<string, string | string[]>;
  score_info: Record<string, string | string[]>;
  comm_pref: Record<string, string | string[]>;
  free_note: string | null;
}

const toAnswers = (r: RequestRow): MentorMapAnswers => ({
  ...EMPTY_ANSWERS,
  student_name: r.student_name,
  author_type: r.author_type,
  school_level: r.school_level,
  contact_owner: r.contact_owner,
  contact_phone: r.contact_phone,
  school_name: r.school_name ?? '',
  grade: r.grade ?? '',
  subjects: r.subjects ?? [],
  priority_subjects: r.priority_subjects ?? [],
  preferred_method: r.preferred_method ?? '',
  preferred_time: r.preferred_time ?? '',
  student_answers: r.student_answers ?? {},
  parent_answers: r.parent_answers ?? {},
  subject_answers: r.subject_answers ?? {},
  score_info: r.score_info ?? {},
  comm_pref: r.comm_pref ?? {},
  free_note: r.free_note ?? '',
});

const STATUS_STYLE: Record<RequestStatus, string> = {
  new: 'border-primary/40 text-primary',
  contacting: 'border-amber-500/40 text-amber-400',
  consulted: 'border-sky-500/40 text-sky-400',
  enrolled: 'border-emerald-500/40 text-emerald-400',
  on_hold: 'border-muted-foreground/40 text-muted-foreground',
  archived: 'border-muted-foreground/30 text-muted-foreground',
};

function MentorMapContent() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPhone, setShowPhone] = useState(false);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'MENTOR MAP 상담관리';
  }, []);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['mentor-map-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mentor_map_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as RequestRow[];
    },
  });

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const { data: events = [] } = useQuery({
    queryKey: ['mentor-map-events', selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mentor_map_request_events')
        .select('*')
        .eq('request_id', selectedId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim();
    return rows.filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (!q || r.student_name.includes(q) || (r.school_name ?? '').includes(q))
    );
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: rows.length };
    for (const s of REQUEST_STATUS) map[s] = rows.filter((r) => r.status === s).length;
    return map;
  }, [rows]);

  const proposal = selected ? buildProposal(toAnswers(selected), new Date(selected.created_at)) : null;
  const studentSummary = selected ? buildStudentSummary(toAnswers(selected)) : null;
  const slides = proposal ? toSlides(proposal) : [];

  const changeStatus = async (next: RequestStatus) => {
    if (!selected || !user) return;
    setSaving(true);
    const from = selected.status;
    const { error } = await supabase.from('mentor_map_requests').update({ status: next }).eq('id', selected.id);
    if (error) {
      toast.error('상태 변경에 실패했습니다.');
    } else {
      await supabase.from('mentor_map_request_events').insert({
        request_id: selected.id,
        actor_id: user.id,
        event_type: 'status_change',
        from_value: from,
        to_value: next,
      });
      toast.success(`상태를 '${STATUS_LABEL[next]}'로 변경했습니다.`);
      qc.invalidateQueries({ queryKey: ['mentor-map-requests'] });
      qc.invalidateQueries({ queryKey: ['mentor-map-events', selected.id] });
    }
    setSaving(false);
  };

  const addMemo = async () => {
    if (!selected || !user || !memo.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('mentor_map_request_events').insert({
      request_id: selected.id,
      actor_id: user.id,
      event_type: 'note',
      memo: memo.trim(),
    });
    if (error) toast.error('메모 저장에 실패했습니다.');
    else {
      setMemo('');
      toast.success('상담 메모를 남겼습니다.');
      qc.invalidateQueries({ queryKey: ['mentor-map-events', selected.id] });
    }
    setSaving(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #mm-print, #mm-print * { visibility: visible !important; }
          #mm-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .mm-slide { break-after: page; page-break-after: always; }
          .mm-noprint { display: none !important; }
        }
      `}</style>

      <div className="flex items-center gap-2 mm-noprint">
        <Compass className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-semibold text-foreground">MENTOR MAP 상담관리</h1>
        <Badge variant="outline" className="text-[10px]">신규 상담 신청 전용 · 재원생 데이터와 분리</Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card className="mm-noprint">
          <CardHeader className="pb-3 space-y-3">
            <CardTitle className="text-base">상담 신청 목록</CardTitle>
            <Input placeholder="학생 이름 / 학교 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              {(['all', ...REQUEST_STATUS] as const).map((s) => (
                <button key={s} type="button" onClick={() => setFilter(s as RequestStatus | 'all')}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${filter === s ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
                  {s === 'all' ? '전체' : STATUS_LABEL[s as RequestStatus]} {counts[s] ?? 0}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
            {isLoading && <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto my-6" />}
            {!isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">해당 조건의 신청이 없습니다.</p>
            )}
            {filtered.map((r) => (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedId === r.id ? 'border-primary bg-primary/10' : 'border-border/60 hover:border-primary/40'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{r.student_name}</span>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {LEVEL_LABEL[(r.school_level || 'middle') as keyof typeof LEVEL_LABEL]} · {r.school_name || '학교 미입력'} · {(r.subjects ?? []).join(', ') || '과목 미입력'}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString('ko-KR')}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {!selected && (
            <Card className="mm-noprint">
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                왼쪽에서 상담 신청을 선택하면 제안서 초안이 표시됩니다.
              </CardContent>
            </Card>
          )}

          {selected && proposal && (
            <>
              <Card className="mm-noprint">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex flex-wrap items-center gap-2">
                    {selected.student_name}
                    <span className="text-xs font-normal text-muted-foreground">
                      {showPhone ? selected.contact_phone : maskPhone(selected.contact_phone)}
                      ({selected.contact_owner === 'parent' ? '보호자' : '학생'})
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShowPhone((v) => !v)}>
                      {showPhone ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {REQUEST_STATUS.map((s) => (
                      <Button key={s} size="sm" variant={selected.status === s ? 'default' : 'outline'}
                        disabled={saving || selected.status === s} onClick={() => changeStatus(s)}>
                        {STATUS_LABEL[s]}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">상담 메모 (이력으로 남습니다)</Label>
                    <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} className="min-h-[70px]" placeholder="상담 통화 내용, 다음 액션 등" />
                    <Button size="sm" onClick={addMemo} disabled={saving || !memo.trim()}>메모 남기기</Button>
                  </div>
                  {events.length > 0 && (
                    <div className="space-y-1.5 border-t border-border/60 pt-3">
                      {events.map((e: { id: string; event_type: string; from_value: string | null; to_value: string | null; memo: string | null; created_at: string }) => (
                        <p key={e.id} className="text-[11px] text-muted-foreground">
                          {new Date(e.created_at).toLocaleString('ko-KR')} ·{' '}
                          {e.event_type === 'status_change'
                            ? `상태 ${STATUS_LABEL[(e.from_value ?? 'new') as RequestStatus]} → ${STATUS_LABEL[(e.to_value ?? 'new') as RequestStatus]}`
                            : e.memo}
                        </p>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="outline" onClick={() => window.print()}>
                    <Printer className="w-3.5 h-3.5 mr-1.5" /> 제안서 인쇄 / PDF 저장
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    파일명 권장: {proposal.cover.fileNameHint}
                  </p>
                </CardContent>
              </Card>

              <div id="mm-print" className="space-y-4">
                {slides.map((s) => (
                  <Card key={s.no} className="mm-slide border-border/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-primary">{s.no}. {s.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5">
                        {s.bullets.map((b, i) => (
                          <li key={i} className="text-sm text-foreground leading-relaxed">· {b}</li>
                        ))}
                      </ul>
                      {s.no === 1 && (
                        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{proposal.cover.notice}</p>
                      )}
                      {s.no === 2 && proposal.diffs.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-medium text-foreground">학생·보호자 응답 비교</p>
                          {proposal.diffs.map((d) => (
                            <p key={d.topic} className="text-xs text-muted-foreground">
                              {d.topic} — 학생: {d.student} / 보호자: {d.parent}
                              {d.differs && <span className="text-amber-400"> (상담에서 함께 확인)</span>}
                            </p>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {studentSummary && (
                  <Card className="mm-slide border-border/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-primary">부록. {studentSummary.title} (학생용 요약)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      {studentSummary.heard.map((h, i) => (
                        <p key={`h${i}`} className="text-sm text-foreground">· {h}</p>
                      ))}
                      {studentSummary.firstSteps.map((f, i) => (
                        <p key={`f${i}`} className="text-sm text-muted-foreground">→ {f}</p>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminMentorMapPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher']}>
      <MentorMapContent />
    </ProtectedRoute>
  );
}
