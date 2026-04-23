import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DEFAULT_ERROR_TYPES = ['개념이해 부족', '문제이해 오류', '시간부족', '풀이누락', '유형파악 못함'] as const;
const ALWAYS_INCLUDED_ERROR_TYPE = '기타(직접입력)';
const DEFAULT_TOTAL_ITEMS = 20;
const EXAM_YEAR_OPTIONS = [2025, 2026, 2027] as const;
const EXAM_TYPE_OPTIONS = ['중간고사', '기말고사'] as const;

type TemplateItemType = '객관식' | '주관식';

interface TemplateItem {
  no: number;
  type: TemplateItemType;
  points: number;
  is_essay: boolean;
}

interface TemplateParseResponse {
  total_items?: number;
  total_points?: number;
  items?: Array<{
    no?: number;
    type?: string;
    points?: number;
    is_essay?: boolean;
  }>;
}

interface ExamTemplateRecord {
  id: string;
  total_items: number;
  items: unknown;
  error_types: unknown;
}

interface ExamTemplateSetupRecord {
  id: string;
  school_name: string;
  subject: string;
  exam_type: string;
  exam_year: number | null;
  exam_period: string | null;
  students: {
    grade: string | null;
  } | null;
}

interface ExamTemplateSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: ExamTemplateSetupRecord | null;
  currentUserId: string | null;
  onSaved?: () => void;
}

function buildDefaultItems(totalItems: number = DEFAULT_TOTAL_ITEMS): TemplateItem[] {
  return Array.from({ length: totalItems }, (_, index) => ({
    no: index + 1,
    type: '객관식',
    points: 0,
    is_essay: false,
  }));
}

function normalizeTemplateItem(raw: unknown, fallbackNo: number): TemplateItem {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const itemType = source.type === '주관식' ? '주관식' : '객관식';
  const isEssay = typeof source.is_essay === 'boolean' ? source.is_essay : itemType === '주관식';
  const parsedPoints = typeof source.points === 'number' && Number.isFinite(source.points) ? source.points : 0;
  return {
    no: typeof source.no === 'number' && Number.isFinite(source.no) ? source.no : fallbackNo,
    type: isEssay ? '주관식' : itemType,
    points: Math.round(parsedPoints * 100) / 100,
    is_essay: isEssay,
  };
}

function roundPoints(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPoints(value: number) {
  if (!Number.isFinite(value)) return '0';
  const rounded = roundPoints(value);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
}

function normalizeTemplateItems(raw: unknown, fallbackTotal: number = DEFAULT_TOTAL_ITEMS): TemplateItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return buildDefaultItems(fallbackTotal);
  }

  const normalized = raw
    .map((item, index) => normalizeTemplateItem(item, index + 1))
    .sort((a, b) => a.no - b.no)
    .map((item, index) => ({ ...item, no: index + 1 }));

  return normalized.length > 0 ? normalized : buildDefaultItems(fallbackTotal);
}

function normalizeErrorTypes(raw: unknown) {
  const values = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : [];
  const cleaned = values.filter((value) => value !== ALWAYS_INCLUDED_ERROR_TYPE);
  const selectedDefaults = DEFAULT_ERROR_TYPES.filter((value) => cleaned.includes(value));
  const customErrorTypes = cleaned.filter((value) => !DEFAULT_ERROR_TYPES.includes(value as (typeof DEFAULT_ERROR_TYPES)[number]));
  return { selectedDefaults, customErrorTypes };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('파일을 읽을 수 없습니다.'));
    };
    reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsDataURL(file);
  });
}

export function ExamTemplateSetup({ open, onOpenChange, record, currentUserId, onSaved }: ExamTemplateSetupProps) {
  const { toast } = useToast();
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [items, setItems] = useState<TemplateItem[]>(buildDefaultItems());
  const [selectedDefaultErrors, setSelectedDefaultErrors] = useState<string[]>([...DEFAULT_ERROR_TYPES]);
  const [customErrorTypes, setCustomErrorTypes] = useState<string[]>([]);
  const [newErrorType, setNewErrorType] = useState('');
  const [grade, setGrade] = useState('');
  const [examYear, setExamYear] = useState<number | null>(null);
  const [examPeriod, setExamPeriod] = useState('');
  const [examType, setExamType] = useState('');

  const canSave = Boolean(record && currentUserId && grade && examYear && examPeriod && examType && items.length > 0);
  const dialogTitle = templateId ? '템플릿 수정' : '템플릿 새로 만들기';

  const totalPoints = useMemo(
    () => roundPoints(items.reduce((sum, item) => sum + (Number.isFinite(item.points) ? item.points : 0), 0)),
    [items],
  );

  useEffect(() => {
    if (!open || !record) return;

    setGrade(record.students?.grade ?? '');
    setExamYear(record.exam_year ?? null);
    setExamPeriod(record.exam_period ?? '');
    setExamType(record.exam_type ?? '');
    setNewErrorType('');
  }, [open, record]);

  useEffect(() => {
    if (!open || !record) return;

    let active = true;

    const loadTemplate = async () => {
      if (!grade || !examYear || !examPeriod || !examType) {
        setTemplateId(null);
        setItems(buildDefaultItems());
        setSelectedDefaultErrors([...DEFAULT_ERROR_TYPES]);
        setCustomErrorTypes([]);
        return;
      }

      setLoadingTemplate(true);
      try {
        const { data, error } = await supabase
          .from('exam_score_templates')
          .select('id, total_items, items, error_types')
          .eq('school_name', record.school_name)
          .eq('subject', record.subject)
          .eq('grade', grade)
          .eq('exam_type', examType)
          .eq('exam_year', examYear)
          .eq('exam_period', examPeriod)
          .maybeSingle();

        if (error) throw error;
        if (!active) return;

        const existingTemplate = (data ?? null) as ExamTemplateRecord | null;

        if (!existingTemplate) {
          setTemplateId(null);
          setItems(buildDefaultItems());
          setSelectedDefaultErrors([...DEFAULT_ERROR_TYPES]);
          setCustomErrorTypes([]);
          return;
        }

        const normalizedItems = normalizeTemplateItems(existingTemplate.items, existingTemplate.total_items || DEFAULT_TOTAL_ITEMS);
        const { selectedDefaults, customErrorTypes: customTypes } = normalizeErrorTypes(existingTemplate.error_types);

        setTemplateId(existingTemplate.id);
        setItems(normalizedItems);
        setSelectedDefaultErrors(selectedDefaults.length > 0 ? selectedDefaults : [...DEFAULT_ERROR_TYPES]);
        setCustomErrorTypes(customTypes);
        setNewErrorType('');
      } catch (error: any) {
        if (!active) return;
        toast({ title: '템플릿 조회 실패', description: error.message, variant: 'destructive' });
      } finally {
        if (active) setLoadingTemplate(false);
      }
    };

    void loadTemplate();

    return () => {
      active = false;
    };
  }, [examPeriod, examType, examYear, grade, open, record, toast]);

  const updateItem = <K extends keyof TemplateItem>(index: number, key: K, value: TemplateItem[K]) => {
    setItems((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const nextItem = { ...item, [key]: value };

      if (key === 'type') {
        nextItem.is_essay = value === '주관식';
      }
      if (key === 'is_essay') {
        nextItem.type = value ? '주관식' : '객관식';
      }

      return nextItem;
    }));
  };

  const handlePointsChange = (index: number, value: string) => {
    const trimmedValue = value.trim();
    if (trimmedValue === '') {
      updateItem(index, 'points', 0);
      return;
    }

    const parsed = Number.parseFloat(trimmedValue);
    if (Number.isNaN(parsed)) return;

    updateItem(index, 'points', roundPoints(parsed));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { no: prev.length + 1, type: '객관식', points: 0, is_essay: false }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, no: itemIndex + 1 })));
  };

  const toggleDefaultErrorType = (value: string, checked: boolean) => {
    setSelectedDefaultErrors((prev) => {
      if (checked) return [...prev, value];
      return prev.filter((item) => item !== value);
    });
  };

  const updateErrorType = (index: number, value: string) => {
    setCustomErrorTypes((prev) => prev.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const addErrorType = () => {
    const trimmed = newErrorType.trim();
    if (!trimmed) return;

    setCustomErrorTypes((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setNewErrorType('');
  };
  const removeErrorType = (index: number) => setCustomErrorTypes((prev) => prev.filter((_, itemIndex) => itemIndex !== index));

  const handleTemplateFileParse = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !record) return;

    setParsing(true);
    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      const { data, error } = await supabase.functions.invoke('analyze-school-document', {
        body: {
          fileDataUrl,
          fileType: 'exam_template',
          fileName: file.name,
          fileMimeType: file.type || null,
        },
      });

      if (error) throw error;
      if (data?.error) {
        throw new Error(typeof data.error === 'string' ? data.error : '시험지 분석에 실패했습니다.');
      }

      const parsed = (data?.data ?? data) as TemplateParseResponse;
      const parsedItems = normalizeTemplateItems(parsed.items, parsed.total_items || DEFAULT_TOTAL_ITEMS);
      setItems(parsedItems);
      toast({ title: '시험지 템플릿을 불러왔습니다' });
    } catch (error: any) {
      toast({ title: 'AI 파싱 실패', description: error.message ?? '시험지 분석에 실패했습니다.', variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!record || !currentUserId) return;
    if (!grade || !examYear || !examPeriod || !examType) {
      toast({ title: '템플릿 저장 불가', description: '학년, 시험 연도, 학기 정보가 있어야 저장할 수 있습니다.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const normalizedItems = items
        .map((item, index) => ({
          no: index + 1,
          type: item.is_essay ? '주관식' : item.type,
          points: roundPoints(Number.isFinite(item.points) ? item.points : 0),
          is_essay: item.is_essay,
        }))
        .filter((item) => item.no > 0);

      const errorTypes = Array.from(
        new Set([
          ...selectedDefaultErrors,
          ...customErrorTypes.map((value) => value.trim()).filter(Boolean),
          ALWAYS_INCLUDED_ERROR_TYPE,
        ]),
      );

      const { error } = await supabase.from('exam_score_templates').upsert(
        {
          school_name: record.school_name,
          subject: record.subject,
          grade,
          exam_type: examType,
          exam_year: examYear,
          exam_period: examPeriod,
          total_items: normalizedItems.length,
          items: normalizedItems,
          error_types: errorTypes,
          created_by: currentUserId,
        } as any,
        { onConflict: 'school_name,subject,grade,exam_type,exam_year,exam_period' },
      );

      if (error) throw error;

      toast({ title: '템플릿이 저장되었습니다' });
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: '템플릿 저장 실패', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            시험 문항 수, 배점, 오답유형을 이 시험 기준으로 저장합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">
          {loadingTemplate ? (
            <div className="flex min-h-[18rem] items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-lg border p-4" style={{ backgroundColor: 'hsl(var(--review-progress-surface))', borderColor: 'hsl(var(--review-progress-border))' }}>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4" />
                  AI로 시험지 스캔
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  정답지 또는 시험지를 업로드하면 AI가 문항 수와 배점을 자동으로 추출합니다.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input type="file" accept="image/*,.pdf" onChange={handleTemplateFileParse} disabled={parsing} className="max-w-md" />
                  {parsing ? (
                    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      시험지를 분석하는 중입니다.
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">템플릿 기본 정보 (필수)</h3>
                  <p className="text-sm text-muted-foreground">학교명과 과목은 현재 시험지 정보에서 자동으로 가져옵니다.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="template-grade">학년 *</Label>
                    <select
                      id="template-grade"
                      value={grade}
                      onChange={(event) => setGrade(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">선택</option>
                      <option value="1">1학년</option>
                      <option value="2">2학년</option>
                      <option value="3">3학년</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-exam-year">시험 연도 *</Label>
                    <select
                      id="template-exam-year"
                      value={examYear ?? ''}
                      onChange={(event) => setExamYear(event.target.value ? Number(event.target.value) : null)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">선택</option>
                      {EXAM_YEAR_OPTIONS.map((year) => (
                        <option key={year} value={year}>{year}년</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-exam-period">학기 *</Label>
                    <select
                      id="template-exam-period"
                      value={examPeriod}
                      onChange={(event) => setExamPeriod(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">선택</option>
                      <option value="1학기">1학기</option>
                      <option value="2학기">2학기</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-exam-type">시험 종류 *</Label>
                    <select
                      id="template-exam-type"
                      value={examType}
                      onChange={(event) => setExamType(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">선택</option>
                      {EXAM_TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {!canSave ? (
                  <p className="text-sm text-warning">위 항목을 모두 입력해야 템플릿을 저장할 수 있습니다.</p>
                ) : null}
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">문항별 배점</h3>
                    <p className="text-sm text-muted-foreground">문항번호, 유형, 배점을 직접 수정할 수 있습니다.</p>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-foreground">
                    총점 <span className="font-semibold">{formatPoints(totalPoints)}점</span>
                  </div>
                </div>

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[96px]">문항번호</TableHead>
                        <TableHead>유형</TableHead>
                        <TableHead className="w-[140px]">배점</TableHead>
                        <TableHead className="w-[120px]">주관식</TableHead>
                        <TableHead className="w-[80px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={`${item.no}-${index}`}>
                          <TableCell>{item.no}번</TableCell>
                          <TableCell>
                            <select
                              value={item.type}
                              onChange={(event) => updateItem(index, 'type', event.target.value as TemplateItemType)}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none"
                            >
                              <option value="객관식">객관식</option>
                              <option value="주관식">주관식</option>
                            </select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={formatPoints(item.points)}
                                onChange={(event) => handlePointsChange(index, event.target.value)}
                                className="h-10 w-20"
                              />
                              <span className="text-sm text-muted-foreground">점</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Checkbox checked={item.is_essay} onCheckedChange={(checked) => updateItem(index, 'is_essay', checked === true)} />
                              <span className="text-sm text-foreground">서술형</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length <= 1}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Button type="button" variant="outline" onClick={addItem} className="gap-2">
                  <Plus className="h-4 w-4" />
                  문항 추가
                </Button>
              </section>

              <section className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">오답유형 설정</h3>
                  <p className="text-sm text-muted-foreground">기본 유형을 포함/제외하고, 과목별 커스텀 유형을 추가할 수 있습니다.</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {DEFAULT_ERROR_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-foreground">
                      <Checkbox checked={selectedDefaultErrors.includes(type)} onCheckedChange={(checked) => toggleDefaultErrorType(type, checked === true)} />
                      <span>{type}</span>
                    </label>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>추가 오답유형</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newErrorType}
                      onChange={(event) => {
                        event.stopPropagation();
                        setNewErrorType(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        event.stopPropagation();
                        addErrorType();
                      }}
                      placeholder="오답유형 입력 후 Enter 또는 추가 버튼"
                    />
                    <Button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        addErrorType();
                      }}
                    >
                      추가
                    </Button>
                  </div>
                  {customErrorTypes.map((type, index) => (
                    <div key={`${index}-${type}`} className="flex items-center gap-2 rounded-md bg-accent/40 px-3 py-2 text-sm text-foreground">
                      <span className="flex-1">{type}</span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeErrorType(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">‘{ALWAYS_INCLUDED_ERROR_TYPE}’ 항목은 항상 자동 포함됩니다.</p>
                </div>
              </section>

              {!canSave ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  학년, 시험 연도, 학기 정보가 있어야 템플릿을 저장할 수 있습니다.
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  닫기
                </Button>
                <Button type="button" onClick={() => void handleSave()} disabled={!canSave || saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  템플릿 저장
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}