import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileText, Loader2, Lock, Pencil, Plus, Save, Sparkles, Trash2, Unlock, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { SchoolInfo } from './types';

type StudyLink = { title: string; url: string };

type AnalysisReport = {
  id: string;
  school_name: string;
  grade: string;
  subject: string;
  exam_type: string;
  exam_year: number;
  exam_period: string;
  textbook: string | null;
  exam_scope: string | null;
  exam_difficulty: string | null;
  avg_score: number | null;
  overall_review: string | null;
  original_pdf_path: string | null;
  answer_pdf_path: string | null;
  study_links: StudyLink[] | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  is_locked: boolean | null;
  locked_by: string | null;
  locked_by_name: string | null;
  locked_at: string | null;
};

type AnalysisItem = {
  id?: string;
  item_number: number;
  item_type?: string | null;
  points?: number | null;
  difficulty?: string | null;
  note?: string | null;
  unit_name?: string | null;
  problem_desc?: string | null;
  source_type?: string | null;
  question_type?: string | null;
  classification?: string | null;
  content?: string | null;
  area?: string | null;
  sort_order?: number | null;
};

type ParseResult = { total_items: number; total_points: number };

type ParsedExamAnalysis = Partial<{
  textbook: string | null;
  exam_scope: string | null;
  exam_difficulty: string | null;
  overall_review: string | null;
  total_items: number;
  total_points: number;
  items: AnalysisItem[];
}>;

type ReportForm = {
  schoolName: string;
  grade: string;
  subject: string;
  examType: string;
  examYear: string;
  examPeriod: string;
  textbook: string;
  examScope: string;
  difficulty: string;
  avgScore: string;
  overallReview: string;
  originalPdfPath: string;
  answerPdfPath: string;
  studyLinks: StudyLink[];
};

const SUBJECTS = ['수학', '영어', '국어', '과학', '기타'];
const GRADES = ['1', '2', '3'];
const EXAM_TYPES = ['중간고사', '기말고사'];
const EXAM_PERIODS = ['1학기', '2학기'];
const DIFFICULTIES = ['매우쉬움', '쉬움', '중', '어려움', '매우어려움'];
const ITEM_DIFFICULTIES = ['하', '중하', '중', '중상', '상'];
const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

const SUBJECT_COLUMNS: Record<string, string[]> = {
  수학: ['번호', '단원명', '문제설명', '문항유형', '배점', '난도', '특이사항'],
  영어: ['번호', '출제유형', '문제유형', '배점', '난도', '분류', '특이사항'],
  국어: ['번호', '출제유형', '내용', '영역', '난도', '배점'],
  과학: ['번호', '단원명', '문항유형', '배점', '난도', '특이사항'],
  기타: ['번호', '문항유형', '배점', '난도', '특이사항'],
};

const emptyForm = (schoolName = ''): ReportForm => ({
  schoolName,
  grade: '1',
  subject: '수학',
  examType: '중간고사',
  examYear: String(currentYear),
  examPeriod: '1학기',
  textbook: '',
  examScope: '',
  difficulty: '중',
  avgScore: '',
  overallReview: '',
  originalPdfPath: '',
  answerPdfPath: '',
  studyLinks: [],
});

const createDefaultItems = (): AnalysisItem[] =>
  Array.from({ length: 5 }, (_, index) => ({ item_number: index + 1, difficulty: '중', sort_order: index }));

interface Props {
  schools: SchoolInfo[];
  selectedSchool: string;
}

export function AnalysisReportTab({ schools, selectedSchool }: Props) {
  const { user, fullName, role } = useAuth();
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState('전체');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [form, setForm] = useState<ReportForm>(() => emptyForm(selectedSchool || schools[0]?.name || ''));
  const [items, setItems] = useState<AnalysisItem[]>(createDefaultItems);
  const [originalPdfUrl, setOriginalPdfUrl] = useState<string | null>(null);
  const [answerPdfUrl, setAnswerPdfUrl] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );
  const isLocked = !!selectedReport?.is_locked;
  const canManageLock = role === 'admin';

  const filteredReports = useMemo(() => {
    return reports
      .filter((report) => selectedSubject === '전체' || report.subject === selectedSubject)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [reports, selectedSubject]);

  const pointTotal = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.points) || 0), 0),
    [items],
  );

  useEffect(() => {
    void fetchReports();
  }, []);

  useEffect(() => {
    if (!selectedReportId && selectedSchool && !form.schoolName) {
      setForm((prev) => ({ ...prev, schoolName: selectedSchool }));
    }
  }, [form.schoolName, selectedReportId, selectedSchool]);

  useEffect(() => {
    void refreshSignedUrls(form.originalPdfPath, form.answerPdfPath);
  }, [form.originalPdfPath, form.answerPdfPath]);

  async function fetchReports() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('exam_analysis_reports')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      toast.error('분석보고서 목록을 불러오지 못했습니다.');
      console.error(error);
    } else {
      setReports((data ?? []) as AnalysisReport[]);
    }
    setLoading(false);
  }

  async function refreshSignedUrls(originalPath: string, answerPath: string) {
    setOriginalPdfUrl(null);
    setAnswerPdfUrl(null);

    if (originalPath) {
      const { data } = await supabase.storage.from('exam-analysis').createSignedUrl(originalPath, 3600);
      setOriginalPdfUrl(data?.signedUrl ?? null);
    }
    if (answerPath) {
      const { data } = await supabase.storage.from('exam-analysis').createSignedUrl(answerPath, 3600);
      setAnswerPdfUrl(data?.signedUrl ?? null);
    }
  }

  async function selectReport(report: AnalysisReport) {
    setSelectedReportId(report.id);
    setForm({
      schoolName: report.school_name,
      grade: report.grade,
      subject: report.subject,
      examType: report.exam_type,
      examYear: String(report.exam_year),
      examPeriod: report.exam_period,
      textbook: report.textbook ?? '',
      examScope: report.exam_scope ?? '',
      difficulty: report.exam_difficulty ?? '중',
      avgScore: report.avg_score == null ? '' : String(report.avg_score),
      overallReview: report.overall_review ?? '',
      originalPdfPath: report.original_pdf_path ?? '',
      answerPdfPath: report.answer_pdf_path ?? '',
      studyLinks: Array.isArray(report.study_links) ? report.study_links : [],
    });

    const { data, error } = await (supabase as any)
      .from('exam_analysis_items')
      .select('*')
      .eq('report_id', report.id)
      .order('sort_order', { ascending: true })
      .order('item_number', { ascending: true });

    if (error) {
      toast.error('문항 분석을 불러오지 못했습니다.');
      console.error(error);
      setItems(createDefaultItems());
    } else {
      const rows = (data ?? []) as AnalysisItem[];
      setItems(rows.length > 0 ? rows : createDefaultItems());
    }
  }

  function startNewReport() {
    setSelectedReportId(null);
    setForm(emptyForm(selectedSchool || schools[0]?.name || ''));
    setItems(createDefaultItems());
    setParseResult(null);
  }

  function handleEdit(report: AnalysisReport) {
    void selectReport(report);
  }

  function updateForm<K extends keyof ReportForm>(key: K, value: ReportForm[K]) {
    if (isLocked) return;
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addLink() {
    if (isLocked) return;
    updateForm('studyLinks', [...form.studyLinks, { title: '', url: '' }]);
  }

  function updateLink(index: number, key: keyof StudyLink, value: string) {
    updateForm(
      'studyLinks',
      form.studyLinks.map((link, i) => (i === index ? { ...link, [key]: value } : link)),
    );
  }

  function removeLink(index: number) {
    if (isLocked) return;
    updateForm('studyLinks', form.studyLinks.filter((_, i) => i !== index));
  }

  function addItem() {
    if (isLocked) return;
    setItems((prev) => [...prev, { item_number: prev.length + 1, difficulty: '중', sort_order: prev.length }]);
  }

  function updateItem<K extends keyof AnalysisItem>(index: number, key: K, value: AnalysisItem[K]) {
    if (isLocked) return;
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  }

  function removeItem(index: number) {
    if (isLocked) return;
    setItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, item_number: i + 1, sort_order: i })));
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>, type: 'original' | 'answer') {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isLocked) {
      toast.error('잠금 상태에서는 파일을 변경할 수 없습니다.');
      return;
    }
    if (file.type !== 'application/pdf') {
      toast.error('PDF 파일만 업로드할 수 있습니다.');
      return;
    }

    const safeId = selectedReportId ?? crypto.randomUUID();
    const path = `exam-analysis/${safeId}/${type}-${Date.now()}.pdf`;
    const { error } = await supabase.storage.from('exam-analysis').upload(path, file, {
      contentType: 'application/pdf',
      upsert: true,
    });

    if (error) {
      toast.error('PDF 업로드에 실패했습니다.');
      console.error(error);
      return;
    }

    if (type === 'original') updateForm('originalPdfPath', path);
    else updateForm('answerPdfPath', path);
    toast.success('PDF 업로드 완료');
  }

  function applyParsedAnalysis(parsed: ParsedExamAnalysis) {
    if (parsed.textbook) updateForm('textbook', parsed.textbook);
    if (parsed.exam_scope) updateForm('examScope', parsed.exam_scope);
    if (parsed.exam_difficulty) updateForm('difficulty', parsed.exam_difficulty);
    if (parsed.overall_review) updateForm('overallReview', parsed.overall_review);
    if (Array.isArray(parsed.items) && parsed.items.length > 0) {
      setItems(parsed.items.map((item, index) => ({ ...item, item_number: item.item_number || index + 1, sort_order: index })));
    }
    setParseResult({
      total_items: Number(parsed.total_items ?? parsed.items?.length ?? 0),
      total_points: Number(parsed.total_points ?? parsed.items?.reduce((sum, item) => sum + (Number(item.points) || 0), 0) ?? 0),
    });
  }

  async function runAIParse(fileDataUrl: string, fileName: string, fileMimeType: string | null) {
    const { data: result, error } = await supabase.functions.invoke('analyze-school-document', {
      body: {
        fileDataUrl,
        fileName,
        fileMimeType,
        fileType: 'exam_analysis',
        subjectFilter: form.subject,
        schoolName: form.schoolName || selectedSchool || '학교 미지정',
      },
    });
    if (error || result?.error) throw new Error(error?.message || result?.error || 'AI 분석 실패');
    applyParsedAnalysis((result?.data ?? {}) as ParsedExamAnalysis);
  }

  async function handleAIParse(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (isLocked) {
      toast.error('잠금 상태에서는 AI 분석을 실행할 수 없습니다.');
      return;
    }
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('이미지 또는 PDF 파일만 업로드할 수 있습니다.');
      return;
    }

    setIsParsing(true);
    setParseResult(null);
    try {
      const fileDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await runAIParse(fileDataUrl, file.name, file.type || null);

      const safeId = selectedReportId ?? crypto.randomUUID();
      const extension = file.name.split('.').pop()?.toLowerCase() || (file.type === 'application/pdf' ? 'pdf' : 'png');
      const path = `exam-analysis/${safeId}/original-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('exam-analysis').upload(path, file, {
        contentType: file.type || undefined,
        upsert: true,
      });
      if (!uploadError) updateForm('originalPdfPath', path);

      toast.success('AI 분석이 완료됐어요.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'AI 분석 실패. 다시 시도해주세요.');
    } finally {
      setIsParsing(false);
    }
  }

  async function parseExistingPdf() {
    if (isLocked) {
      toast.error('잠금 상태에서는 AI 분석을 실행할 수 없습니다.');
      return;
    }
    if (!originalPdfUrl) {
      toast.error('업로드된 원본 시험지가 없습니다.');
      return;
    }
    setIsParsing(true);
    setParseResult(null);
    try {
      const { data: result, error } = await supabase.functions.invoke('analyze-school-document', {
        body: {
          fileUrl: originalPdfUrl,
          fileName: 'original.pdf',
          fileMimeType: 'application/pdf',
          fileType: 'exam_analysis',
          subjectFilter: form.subject,
          schoolName: form.schoolName || selectedSchool || '학교 미지정',
        },
      });
      if (error || result?.error) throw new Error(error?.message || result?.error || 'AI 분석 실패');
      applyParsedAnalysis((result?.data ?? {}) as ParsedExamAnalysis);
      toast.success('AI 분석이 완료됐어요.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'AI 분석 실패. 다시 시도해주세요.');
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSave() {
    if (!user) {
      toast.error('로그인이 필요합니다.');
      return;
    }
    if (isLocked) {
      toast.error('잠금 상태에서는 저장할 수 없습니다.');
      return;
    }
    if (!form.schoolName || !form.grade || !form.subject || !form.examType || !form.examYear || !form.examPeriod) {
      toast.error('필수 정보를 입력해주세요.');
      return;
    }

    setSaving(true);
    const { data: existing, error: existingError } = await (supabase as any)
      .from('exam_analysis_reports')
      .select('id, created_by_name, updated_at, is_locked')
      .eq('school_name', form.schoolName)
      .eq('grade', form.grade)
      .eq('subject', form.subject)
      .eq('exam_type', form.examType)
      .eq('exam_year', Number(form.examYear))
      .eq('exam_period', form.examPeriod)
      .maybeSingle();

    if (existingError) {
      toast.error('기존 보고서 확인에 실패했습니다.');
      console.error(existingError);
      setSaving(false);
      return;
    }

    if (existing && existing.id !== selectedReportId) {
      if (existing.is_locked) {
        alert('이 보고서는 잠금 상태입니다.\n원장에게 잠금 해제를 요청해주세요.');
        setSaving(false);
        return;
      }

      const confirmed = window.confirm(
        `⚠️ 기존 보고서가 있습니다!\n\n작성자: ${existing.created_by_name || '작성자 미상'}\n수정일: ${new Date(existing.updated_at).toLocaleDateString('ko-KR')}\n\n덮어쓰시겠습니까?\n(기존 내용이 모두 삭제됩니다)`,
      );

      if (!confirmed) {
        setSaving(false);
        return;
      }
    }

    const payload = {
      school_name: form.schoolName,
      grade: form.grade,
      subject: form.subject,
      exam_type: form.examType,
      exam_year: Number(form.examYear),
      exam_period: form.examPeriod,
      textbook: form.textbook || null,
      exam_scope: form.examScope || null,
      exam_difficulty: form.difficulty || null,
      avg_score: form.avgScore ? Number(form.avgScore) : null,
      overall_review: form.overallReview || null,
      original_pdf_path: form.originalPdfPath || null,
      answer_pdf_path: form.answerPdfPath || null,
      study_links: form.studyLinks.filter((link) => link.title || link.url),
      created_by: user.id,
      created_by_name: fullName || user.email || '',
      updated_at: new Date().toISOString(),
    };

    const { data: report, error } = await (supabase as any)
      .from('exam_analysis_reports')
      .upsert(payload, { onConflict: 'school_name,grade,subject,exam_type,exam_year,exam_period' })
      .select()
      .single();

    if (error || !report) {
      toast.error('보고서 저장에 실패했습니다.');
      console.error(error);
      setSaving(false);
      return;
    }

    const reportId = (report as AnalysisReport).id;
    const { error: deleteError } = await (supabase as any).from('exam_analysis_items').delete().eq('report_id', reportId);
    if (deleteError) {
      toast.error('기존 문항 정리에 실패했습니다.');
      console.error(deleteError);
      setSaving(false);
      return;
    }

    const rows = items.map((item, index) => ({
      item_number: item.item_number || index + 1,
      item_type: item.item_type || null,
      points: item.points == null ? null : Number(item.points),
      difficulty: item.difficulty || null,
      note: item.note || null,
      unit_name: item.unit_name || null,
      problem_desc: item.problem_desc || null,
      source_type: item.source_type || null,
      question_type: item.question_type || null,
      classification: item.classification || null,
      content: item.content || null,
      area: item.area || null,
      report_id: reportId,
      sort_order: index,
    }));

    if (rows.length > 0) {
      const { error: insertError } = await (supabase as any).from('exam_analysis_items').insert(rows);
      if (insertError) {
        toast.error('문항 분석 저장에 실패했습니다.');
        console.error(insertError);
        setSaving(false);
        return;
      }
    }

    toast.success('저장됐어요!');
    setSelectedReportId(reportId);
    await fetchReports();
    setSaving(false);
  }

  async function handleToggleLock() {
    if (!selectedReport || !user || role !== 'admin') return;

    const newLocked = !selectedReport.is_locked;
    const confirmed = window.confirm(
      newLocked
        ? '이 보고서를 잠금 처리하시겠습니까?\n잠금 후 선생님이 수정할 수 없습니다.'
        : '잠금을 해제하시겠습니까?',
    );
    if (!confirmed) return;

    const lockPayload = {
      is_locked: newLocked,
      locked_by: newLocked ? user.id : null,
      locked_by_name: newLocked ? fullName || user.email || '' : null,
      locked_at: newLocked ? new Date().toISOString() : null,
    };
    const { error } = await (supabase as any).from('exam_analysis_reports').update(lockPayload).eq('id', selectedReport.id);
    if (error) {
      toast.error('잠금 상태 변경에 실패했습니다.');
      console.error(error);
      return;
    }

    setReports((prev) => prev.map((report) => (report.id === selectedReport.id ? { ...report, ...lockPayload } : report)));
    toast.success(newLocked ? '보고서를 잠금 처리했습니다.' : '잠금을 해제했습니다.');
  }

  async function handleDelete(report: AnalysisReport) {
    if (report.is_locked) return;
    const confirmed = window.confirm(`"${report.subject} ${report.exam_type}" 보고서를\n삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`);
    if (!confirmed) return;

    const paths = [report.original_pdf_path, report.answer_pdf_path].filter(Boolean) as string[];
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from('exam-analysis').remove(paths);
      if (storageError) console.error(storageError);
    }

    const { error: itemDeleteError } = await (supabase as any).from('exam_analysis_items').delete().eq('report_id', report.id);
    if (itemDeleteError) {
      toast.error('문항 분석 삭제에 실패했습니다.');
      console.error(itemDeleteError);
      return;
    }

    const { error } = await (supabase as any).from('exam_analysis_reports').delete().eq('id', report.id);
    if (error) {
      toast.error('보고서 삭제에 실패했습니다.');
      console.error(error);
      return;
    }

    setReports((prev) => prev.filter((row) => row.id !== report.id));
    if (selectedReportId === report.id) startNewReport();
    toast.success('보고서를 삭제했습니다.');
  }

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-0 w-full overflow-hidden bg-background">
      <aside className="w-[300px] min-w-[300px] shrink-0 overflow-y-auto border-r bg-muted/30 p-4">
        <Button className="mb-3 h-10 w-full gap-2 text-sm font-semibold" onClick={startNewReport}>
          <Plus className="h-4 w-4" /> 새 보고서 작성
        </Button>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {['전체', ...SUBJECTS].map((subject) => (
            <Button key={subject} size="sm" variant={selectedSubject === subject ? 'default' : 'outline'} className="h-7 px-2 text-[11px]" onClick={() => setSelectedSubject(subject)}>
              {subject}
            </Button>
          ))}
        </div>

        <div className="space-y-2 pr-1">
          {loading ? (
            <div className="flex h-28 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">보고서가 없습니다.</div>
          ) : (
            filteredReports.map((report) => (
              <button
                key={report.id}
                onClick={() => void selectReport(report)}
                onMouseEnter={() => setHoverId(report.id)}
                onMouseLeave={() => setHoverId(null)}
                className={cn(
                   'relative w-full rounded-lg border bg-card p-3.5 text-left transition-colors hover:bg-accent',
                  selectedReportId === report.id && 'border-primary bg-primary/5',
                )}
              >
                {hoverId === report.id ? (
                  <span className="absolute right-2 top-2 flex gap-1">
                    <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); handleEdit(report); }} className="inline-flex items-center rounded bg-info/10 px-2 py-1 text-[11px] font-medium text-info"><Pencil className="mr-1 h-3 w-3" />수정</span>
                    <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); void handleDelete(report); }} className={cn('inline-flex items-center rounded px-2 py-1 text-[11px] font-medium', report.is_locked ? 'cursor-not-allowed bg-muted text-muted-foreground' : 'bg-destructive/10 text-destructive')}>
                      {report.is_locked ? <Lock className="h-3 w-3" /> : '삭제'}
                    </span>
                  </span>
                ) : null}
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 truncate text-sm font-semibold">{report.subject}{report.is_locked ? <Lock className="h-3 w-3 text-muted-foreground" /> : null}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">{report.exam_type}</span>
                </div>
                <div className="text-xs text-muted-foreground">{report.school_name} · {report.grade}학년</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{report.exam_year}년 {report.exam_period} · {report.created_by_name || '작성자 미상'}</div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{report.textbook || '교과서 미입력'}</span>
                  <span>{format(new Date(report.updated_at || report.created_at), 'MM/dd')}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
        {!selectedReportId && reports.length > 0 && form.schoolName === '' ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <FileText className="h-10 w-10 opacity-40" />
            <p className="text-sm">좌측에서 보고서를 선택하거나 새로 만드세요</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b-2 border-primary/20 pb-4">
              <div>
                <h3 className="text-xl font-bold text-primary">{selectedReportId ? `${form.subject} 분석보고서` : '새 보고서 작성'}</h3>
                {selectedReportId ? <p className="mt-1 text-sm text-muted-foreground">{form.schoolName} · {form.grade}학년 · {form.examYear}년 {form.examPeriod} {form.examType}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                {canManageLock && selectedReport ? (
                  <Button variant={selectedReport.is_locked ? 'destructive' : 'warning'} onClick={() => void handleToggleLock()} className="gap-2">
                    {selectedReport.is_locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    {selectedReport.is_locked ? '잠금 해제' : '잠금'}
                  </Button>
                ) : null}
                {!isLocked ? (
                  <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    저장
                  </Button>
                ) : null}
              </div>
            </div>

            {selectedReport?.is_locked ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                <Lock className="h-4 w-4" />
                잠금 상태입니다 — {selectedReport.locked_by_name || '관리자'}이(가) {selectedReport.locked_at ? new Date(selectedReport.locked_at).toLocaleDateString('ko-KR') : ''}에 잠금{canManageLock ? ' (위 버튼으로 해제 가능)' : ''}
              </div>
            ) : null}

            <fieldset disabled={isLocked} className={cn('space-y-6', isLocked && 'opacity-75')}>
              <AIParsePanel
                isParsing={isParsing}
                parseResult={parseResult}
                originalPdfPath={form.originalPdfPath}
                onUpload={handleAIParse}
                onParseExisting={() => void parseExistingPdf()}
              />

            <FormSection title="기본정보">
              <div className="grid gap-3 xl:grid-cols-6 md:grid-cols-3">
                <Field label="학교 *"><NativeSelect value={form.schoolName} onChange={(value) => updateForm('schoolName', value)} options={schools.map((s) => s.name)} /></Field>
                <Field label="학년 *"><NativeSelect value={form.grade} onChange={(value) => updateForm('grade', value)} options={GRADES} suffix="학년" /></Field>
                <Field label="과목 *"><NativeSelect value={form.subject} onChange={(value) => updateForm('subject', value)} options={SUBJECTS} /></Field>
                <Field label="시험종류 *"><NativeSelect value={form.examType} onChange={(value) => updateForm('examType', value)} options={EXAM_TYPES} /></Field>
                <Field label="연도 *"><NativeSelect value={form.examYear} onChange={(value) => updateForm('examYear', value)} options={YEARS.map(String)} suffix="년" /></Field>
                <Field label="학기 *"><NativeSelect value={form.examPeriod} onChange={(value) => updateForm('examPeriod', value)} options={EXAM_PERIODS} /></Field>
              </div>
            </FormSection>

            <FormSection title="시험 정보">
              <div className="grid gap-3 xl:grid-cols-[2fr_1fr_1fr_1fr] md:grid-cols-2">
                <Field label="시험 범위"><Input value={form.examScope} onChange={(e) => updateForm('examScope', e.target.value)} placeholder="예) 다항식 ~ 이차방정식" /></Field>
                <Field label="교과서"><Input value={form.textbook} onChange={(e) => updateForm('textbook', e.target.value)} placeholder="예) 천재(전)" /></Field>
                <Field label="시험 난도"><NativeSelect value={form.difficulty} onChange={(value) => updateForm('difficulty', value)} options={DIFFICULTIES} /></Field>
                <Field label="평균 점수"><Input type="number" value={form.avgScore} onChange={(e) => updateForm('avgScore', e.target.value)} placeholder="예) 89.98" /></Field>
              </div>
            </FormSection>

            <FormSection title="시험 총평">
              <Textarea value={form.overallReview} onChange={(e) => updateForm('overallReview', e.target.value)} rows={5} placeholder="시험 특징, 출제 경향, 학습 방향 등을 자유롭게 작성" className="resize-y leading-7" />
            </FormSection>

            <FormSection title="파일 첨부">
              <div className="grid gap-3 md:grid-cols-2">
                <PdfBox title="원본 시험지 PDF" url={originalPdfUrl} linkLabel="파일 보기" onRemove={() => updateForm('originalPdfPath', '')} onUpload={(e) => void handlePdfUpload(e, 'original')} />
                <PdfBox title="답지 PDF" url={answerPdfUrl} linkLabel="답지 보기" onRemove={() => updateForm('answerPdfPath', '')} onUpload={(e) => void handlePdfUpload(e, 'answer')} />
              </div>
            </FormSection>

            <FormSection title="수업자료 링크" action={<Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={addLink}><Plus className="h-3.5 w-3.5" /> 링크 추가</Button>}>
              <div className="space-y-2">
                {form.studyLinks.length === 0 ? <p className="text-sm text-muted-foreground">등록된 링크가 없습니다.</p> : null}
                {form.studyLinks.map((link, index) => (
                  <div key={index} className="flex gap-2">
                    <Input value={link.title} onChange={(e) => updateLink(index, 'title', e.target.value)} placeholder="자료명 (예: 1단원 개념정리)" className="flex-1" />
                    <Input value={link.url} onChange={(e) => updateLink(index, 'url', e.target.value)} placeholder="https://..." className="flex-[2]" />
                    <Button variant="destructive" size="icon" onClick={() => removeLink(index)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </FormSection>

            <FormSection title="문항별 분석" action={<span className="text-sm text-muted-foreground">합계: {pointTotal}점</span>}>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
                  <AnalysisColGroup subject={form.subject} />
                  <thead className="bg-primary text-primary-foreground">
                    <tr>
                      {(SUBJECT_COLUMNS[form.subject] ?? SUBJECT_COLUMNS.기타).map((column) => <th key={column} className="px-3 py-2 text-left text-xs font-medium leading-5">{column}</th>)}
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => <ItemRow key={index} subject={form.subject} item={item} index={index} updateItem={updateItem} removeItem={removeItem} />)}
                    <tr>
                      <td colSpan={99} className="px-3 py-2">
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={addItem}>+ 문항 추가</Button>
                        <span className="float-right px-3 py-1 text-sm text-muted-foreground">합계: {pointTotal}점</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              </FormSection>
            </fieldset>
          </div>
        )}
      </section>
    </div>
  );
}

function FormSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h4 className="text-base font-semibold">{title}</h4>{action}</div>{children}</section>;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><Label className="mb-1.5 block text-xs font-medium">{label}</Label>{children}</div>;
}

function NativeSelect({ value, options, suffix = '', onChange }: { value: string; options: string[]; suffix?: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}{suffix}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function AIParsePanel({ isParsing, parseResult, originalPdfPath, onUpload, onParseExisting }: { isParsing: boolean; parseResult: ParseResult | null; originalPdfPath: string; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onParseExisting: () => void }) {
  return (
    <section className="rounded-xl bg-gradient-to-br from-info/10 to-primary/10 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-2 text-sm font-bold text-info"><Sparkles className="h-4 w-4" /> AI 자동 분석</p>
          <p className="text-xs text-info/80">시험지 이미지나 PDF를 업로드하면 AI가 문항/배점/단원을 자동으로 채워줍니다</p>
        </div>
        {isParsing ? <div className="flex items-center gap-2 text-sm text-primary"><Loader2 className="h-4 w-4 animate-spin" /> AI 분석 중...</div> : null}
      </div>
      <div className="flex gap-2">
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary bg-background px-4 py-3 text-sm font-medium text-primary hover:bg-primary/5">
          <Upload className="h-4 w-4" /> 시험지 업로드 (이미지/PDF)
          <input type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={onUpload} disabled={isParsing} />
        </label>
        {originalPdfPath ? <Button variant="outline" className="h-auto flex-1 border-primary text-primary" onClick={onParseExisting} disabled={isParsing}>업로드된 시험지로 AI 분석</Button> : null}
      </div>
      {parseResult ? <div className="mt-3 rounded-lg bg-background/70 px-3 py-2 text-xs font-medium text-emerald-700">✓ 분석 완료 — 문항 {parseResult.total_items}개, 총점 {parseResult.total_points}점 추출됨. 아래 내용을 확인하고 수정해주세요.</div> : null}
    </section>
  );
}

function PdfBox({ title, url, linkLabel, onRemove, onUpload }: { title: string; url: string | null; linkLabel: string; onRemove: () => void; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-center">
      <p className="mb-2 text-sm font-medium">{title}</p>
      {url ? (
        <div className="flex items-center justify-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline-offset-4 hover:underline">📄 {linkLabel}</a>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={onRemove}>삭제</Button>
        </div>
      ) : (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-accent">
          <Upload className="h-3.5 w-3.5" /> PDF 업로드
          <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={onUpload} />
        </label>
      )}
    </div>
  );
}

function CellInput(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} className={cn('h-8 min-w-24 border-0 bg-transparent px-2 text-xs focus-visible:ring-1', props.className)} />;
}

function CellSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="h-8 min-w-24 border-0 bg-transparent px-2 text-xs focus:ring-1"><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>;
}

function ItemRow({ subject, item, index, updateItem, removeItem }: { subject: string; item: AnalysisItem; index: number; updateItem: <K extends keyof AnalysisItem>(index: number, key: K, value: AnalysisItem[K]) => void; removeItem: (index: number) => void }) {
  return (
    <tr className="border-b even:bg-muted/30">
      <td className="px-3 py-1 text-center text-xs text-muted-foreground">{item.item_number}</td>
      {subject === '수학' ? <><td><CellInput value={item.unit_name ?? ''} onChange={(e) => updateItem(index, 'unit_name', e.target.value)} placeholder="단원명" /></td><td><CellInput value={item.problem_desc ?? ''} onChange={(e) => updateItem(index, 'problem_desc', e.target.value)} placeholder="문제설명" /></td></> : null}
      {subject === '영어' ? <><td><CellInput value={item.source_type ?? ''} onChange={(e) => updateItem(index, 'source_type', e.target.value)} placeholder="모의고사/교과서" /></td><td><CellInput value={item.question_type ?? ''} onChange={(e) => updateItem(index, 'question_type', e.target.value)} placeholder="어휘/어법" /></td></> : null}
      {subject === '국어' ? <><td><CellInput value={item.source_type ?? ''} onChange={(e) => updateItem(index, 'source_type', e.target.value)} placeholder="출제유형" /></td><td><CellInput value={item.content ?? ''} onChange={(e) => updateItem(index, 'content', e.target.value)} placeholder="내용" /></td><td><CellInput value={item.area ?? ''} onChange={(e) => updateItem(index, 'area', e.target.value)} placeholder="독서/문학" /></td></> : null}
      {subject === '과학' ? <td><CellInput value={item.unit_name ?? ''} onChange={(e) => updateItem(index, 'unit_name', e.target.value)} placeholder="단원명" /></td> : null}
      {subject !== '영어' && subject !== '국어' ? <td><CellSelect value={item.item_type ?? ''} options={['객관식', '논술형', '단답형']} onChange={(value) => updateItem(index, 'item_type', value)} /></td> : null}
      {subject === '영어' ? <><td><CellInput type="number" value={item.points ?? ''} onChange={(e) => updateItem(index, 'points', e.target.value ? Number(e.target.value) : null)} /></td><td><CellSelect value={item.difficulty ?? '중'} options={ITEM_DIFFICULTIES} onChange={(value) => updateItem(index, 'difficulty', value)} /></td><td><CellInput value={item.classification ?? ''} onChange={(e) => updateItem(index, 'classification', e.target.value)} placeholder="분류" /></td></> : null}
      {subject === '국어' ? <><td><CellSelect value={item.difficulty ?? '중'} options={ITEM_DIFFICULTIES} onChange={(value) => updateItem(index, 'difficulty', value)} /></td><td><CellInput type="number" value={item.points ?? ''} onChange={(e) => updateItem(index, 'points', e.target.value ? Number(e.target.value) : null)} /></td></> : null}
      {subject !== '영어' && subject !== '국어' ? <><td><CellInput type="number" value={item.points ?? ''} onChange={(e) => updateItem(index, 'points', e.target.value ? Number(e.target.value) : null)} /></td><td><CellSelect value={item.difficulty ?? '중'} options={ITEM_DIFFICULTIES} onChange={(value) => updateItem(index, 'difficulty', value)} /></td><td><CellInput value={item.note ?? ''} onChange={(e) => updateItem(index, 'note', e.target.value)} placeholder="특이사항" /></td></> : null}
      {subject === '영어' ? <td><CellInput value={item.note ?? ''} onChange={(e) => updateItem(index, 'note', e.target.value)} placeholder="특이사항" /></td> : null}
      <td className="px-1 py-1"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(index)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
    </tr>
  );
}
