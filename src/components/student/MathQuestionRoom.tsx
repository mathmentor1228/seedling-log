// MATH-QUESTION-ROOM-V1: 수학질문방 component for student schedule tab
import { useState, useEffect, useCallback, useRef } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi, fileToBase64 } from '@/lib/studentApi';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  BookOpen,
  Plus,
  ClipboardList,
  Camera,
  CheckCircle2,
  Upload,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  Eye,
  MessageCircle,
  Share2,
  ImageIcon,
  ZoomIn,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { compressImage } from '@/lib/imageCompression';
import ImageViewerModal from './ImageViewerModal';

const GRADES = ['고1', '고2', '고3', '중3'] as const;
const SUBJECTS = [
  { value: '수학I', icon: '📐' },
  { value: '수학II', icon: '📊' },
  { value: '미적분', icon: '📈' },
  { value: '확통', icon: '🎲' },
  { value: '기하', icon: '📏' },
] as const;

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  '대기중': { color: 'bg-yellow-500/10 text-yellow-600 border-yellow-300', label: '대기중', icon: '🟡' },
  '답변완료': { color: 'bg-green-500/10 text-green-600 border-green-300', label: '답변완료', icon: '🟢' },
  '힌트제공': { color: 'bg-blue-500/10 text-blue-600 border-blue-300', label: '힌트제공', icon: '🔵' },
  '공유됨': { color: 'bg-purple-500/10 text-purple-600 border-purple-300', label: '공유됨', icon: '🔗' },
};

const MAX_DAILY = 10;

interface MathQuestion {
  id: string;
  title: string;
  description: string | null;
  photo_problem_url: string;
  photo_solution_url: string;
  grade: string;
  subject: string;
  source_text: string;
  status: string;
  created_at: string;
  date: string;
  view_count: number;
  is_shared: boolean;
  answers?: MathAnswer[];
}

interface MathAnswer {
  id: string;
  answer_type: string;
  content: string | null;
  answer_photo_urls: string[];
  video_url: string | null;
  answer_input_mode: string;
  created_at: string;
}

export default function MathQuestionRoom() {
  const { student } = useStudentAuth();
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const [questions, setQuestions] = useState<MathQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  // Form state
  const [grade, setGrade] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [sourceText, setSourceText] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [problemPhoto, setProblemPhoto] = useState<File | null>(null);
  const [solutionPhoto, setSolutionPhoto] = useState<File | null>(null);
  const [problemPreview, setProblemPreview] = useState<string | null>(null);
  const [solutionPreview, setSolutionPreview] = useState<string | null>(null);

  const problemInputRef = useRef<HTMLInputElement>(null);
  const solutionInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    if (!student?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await studentApi.getMathQuestions();
      if (data && !error) {
        setQuestions(data.questions || []);
        setDailyCount(data.daily_count || 0);
      }
    } catch (e) {
      console.error('fetch math questions error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [student?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // REALTIME: Listen for new answers and status changes
  useEffect(() => {
    if (!student?.id) return;

    // Listen for answers on this student's questions
    const questionIds = questions.map(q => q.id);

    const answersChannel = supabase
      .channel('math-answers-student')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'math_answers',
        },
        (payload) => {
          const newAnswer = payload.new as any;
          // Check if answer is for one of our questions
          if (questionIds.includes(newAnswer.question_id)) {
            toast.success('선생님이 답변해주셨어요! 📚✨', {
              description: '내 질문함에서 확인해보세요',
              duration: 5000,
            });
            fetchData();
          }
        }
      )
      .subscribe();

    // Listen for status changes on our questions
    const questionsChannel = supabase
      .channel('math-questions-student')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'math_questions',
          filter: `student_id=eq.${student.id}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(answersChannel);
      supabase.removeChannel(questionsChannel);
    };
  }, [student?.id, questions.length, fetchData]);

  const handlePhotoSelect = (type: 'problem' | 'solution') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === 'problem') {
      setProblemPhoto(file);
      setProblemPreview(url);
    } else {
      setSolutionPhoto(file);
      setSolutionPreview(url);
    }
  };

  const uploadPhoto = async (file: File, path: string): Promise<string | null> => {
    try {
      const compressed = await compressImage(file);
      // STUDENT-UPLOAD-V2: private bucket → upload through the secure student endpoint
      const content = await fileToBase64(compressed);
      const { data, error } = await studentApi.uploadFile({
        bucket: 'math-questions',
        homework_id: path.split('/')[1] || 'question',
        content,
        content_type: compressed.type || 'image/jpeg',
        ext: 'jpg',
      });
      if (error || !data?.url) {
        console.error('Upload error:', error);
        return null;
      }
      return data.url;
    } catch (err) {
      console.error('Upload failed:', err);
      return null;
    }
  };

  const resetForm = () => {
    setGrade('');
    setSubject('');
    setSourceText('');
    setTitle('');
    setDescription('');
    setProblemPhoto(null);
    setSolutionPhoto(null);
    setProblemPreview(null);
    setSolutionPreview(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!student?.id) return;

    // Validation
    if (!problemPhoto) return toast.error('문제 사진을 업로드해주세요');
    if (!solutionPhoto) return toast.error('풀이 사진을 업로드해주세요');
    if (!grade) return toast.error('학년을 선택해주세요');
    if (!subject) return toast.error('과목을 선택해주세요');
    if (!sourceText.trim()) return toast.error('출처를 입력해주세요');
    if (title.trim().length < 8) return toast.error('제목은 8자 이상 입력해주세요');
    if (dailyCount >= MAX_DAILY) return toast.error('오늘 질문 횟수를 모두 사용했어요 (10/10)');

    setIsSubmitting(true);
    try {
      const ts = Date.now();
      const problemPath = `${student.id}/${ts}_problem.jpg`;
      const solutionPath = `${student.id}/${ts}_solution.jpg`;

      const [problemUrl, solutionUrl] = await Promise.all([
        uploadPhoto(problemPhoto, problemPath),
        uploadPhoto(solutionPhoto, solutionPath),
      ]);

      if (!problemUrl || !solutionUrl) {
        toast.error('사진 업로드에 실패했어요. 다시 시도해주세요.');
        return;
      }

      const { error } = await studentApi.submitMathQuestion({
        title: title.trim(),
        description: description.trim() || null,
        photo_problem_url: problemUrl,
        photo_solution_url: solutionUrl,
        grade,
        subject,
        source_text: sourceText.trim(),
      });

      if (error) {
        toast.error(error);
        return;
      }

      toast.success('질문이 제출되었어요! 선생님이 확인 후 답변드릴게요 📚');
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Submit error:', err);
      toast.error('제출 중 오류가 발생했어요');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = problemPhoto && solutionPhoto && grade && subject && sourceText.trim() && title.trim().length >= 8 && dailyCount < MAX_DAILY;

  const newAnswerCount = questions.filter(q => q.status === '답변완료' || q.status === '힌트제공').length;

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-white">
              <BookOpen className="w-5 h-5" />
              <span className="font-bold text-base">수학질문방</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/90 text-xs font-medium">[{dailyCount}/{MAX_DAILY}]</span>
              <div className="flex gap-0.5">
                {Array.from({ length: MAX_DAILY }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-2 h-2 rounded-full transition-colors',
                      i < dailyCount ? 'bg-white' : 'bg-white/30'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
              onClick={() => { setShowForm(!showForm); setShowHistory(false); }}
            >
              <Plus className="w-4 h-4 mr-1" />
              새 질문 올리기
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm relative"
              onClick={() => setShowHistory(true)}
            >
              <ClipboardList className="w-4 h-4 mr-1" />
              내 질문함
              {newAnswerCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                  {newAnswerCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Question Form - Slide down */}
      {showForm && (
        <Card className="animate-fade-in border border-border">
          <CardContent className="p-4 space-y-4">
            {/* Photo Uploads */}
            <div className="space-y-3">
              <PhotoUploadZone
                label="📌 문제 사진 업로드"
                hint="카메라로 촬영하거나 갤러리에서 선택"
                preview={problemPreview}
                inputRef={problemInputRef}
                onChange={handlePhotoSelect('problem')}
                onClear={() => { setProblemPhoto(null); setProblemPreview(null); }}
              />
              <PhotoUploadZone
                label="📝 내 풀이 사진 업로드"
                hint="내가 시도한 풀이 과정을 촬영"
                preview={solutionPreview}
                inputRef={solutionInputRef}
                onChange={handlePhotoSelect('solution')}
                onClear={() => { setSolutionPhoto(null); setSolutionPreview(null); }}
              />
            </div>

            {/* Grade - Pill selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">학년</label>
              <div className="flex gap-2">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    onClick={() => setGrade(g)}
                    className={cn(
                      'flex-1 py-2 rounded-full text-sm font-medium transition-all border',
                      grade === g
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">과목</label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="과목을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.icon} {s.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Source */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">출처</label>
              <Input
                placeholder="수능특강 수학II P.47 문제3"
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                maxLength={100}
              />
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                제목 <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="질문 제목 (8자 이상)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              {title.length > 0 && title.length < 8 && (
                <p className="text-xs text-destructive mt-1">
                  {8 - title.length}자 더 입력해주세요
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">설명</label>
              <Textarea
                placeholder="어느 부분이 막히는지 설명해주세요"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>

            {/* Validation Checklist */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <ValidationItem ok={!!problemPhoto} label="문제 사진" />
              <ValidationItem ok={!!solutionPhoto} label="풀이 사진" />
              <ValidationItem ok={!!grade} label="학년 선택" />
              <ValidationItem ok={!!subject} label="과목 선택" />
              <ValidationItem ok={!!sourceText.trim()} label="출처 입력" />
              <ValidationItem ok={title.trim().length >= 8} label="제목 8자 이상" />
            </div>

            {/* Submit */}
            <Button
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg"
              disabled={!canSubmit || isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              📤 질문 제출하기
            </Button>

            <Button variant="ghost" className="w-full" onClick={resetForm}>
              취소
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Question History - Bottom Sheet */}
      <Sheet open={showHistory} onOpenChange={setShowHistory}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
          <SheetHeader className="pb-3">
            <SheetTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              내 질문함
              <Badge variant="secondary">{questions.length}개</Badge>
            </SheetTitle>
          </SheetHeader>

          <div className="overflow-y-auto space-y-3 pb-8" style={{ maxHeight: 'calc(85vh - 80px)' }}>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : questions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">아직 올린 질문이 없어요</p>
                <p className="text-xs mt-1">새 질문을 올려보세요!</p>
              </div>
            ) : (
              questions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  isExpanded={expandedQuestion === q.id}
                  onToggle={() => setExpandedQuestion(expandedQuestion === q.id ? null : q.id)}
                />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// --- Sub-components ---

function PhotoUploadZone({
  label,
  hint,
  preview,
  inputRef,
  onChange,
  onClear,
}: {
  label: string;
  hint: string;
  preview: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onChange}
      />
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-green-300 bg-green-50/10">
          <img src={preview} alt="preview" className="w-full h-32 object-cover" />
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            업로드 완료
          </div>
          <button
            onClick={onClear}
            className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-muted-foreground/30 rounded-xl p-6 flex flex-col items-center gap-2 hover:bg-muted/30 transition-colors"
        >
          <Camera className="w-8 h-8 text-muted-foreground/50" />
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </button>
      )}
    </div>
  );
}

function ValidationItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30" />
      )}
      <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

function QuestionCard({
  question,
  isExpanded,
  onToggle,
}: {
  question: MathQuestion;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const statusCfg = STATUS_CONFIG[question.status] || STATUS_CONFIG['대기중'];
  const hasAnswer = question.answers && question.answers.length > 0;
  const dateStr = new Date(question.created_at).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card className="overflow-hidden border border-border">
      <button
        onClick={onToggle}
        className="w-full text-left p-3 flex items-center gap-3"
      >
        <div className="flex-shrink-0 flex gap-1">
          <img
            src={question.photo_problem_url}
            alt="문제"
            className="w-10 h-10 rounded-md object-cover border"
          />
          <img
            src={question.photo_solution_url}
            alt="풀이"
            className="w-10 h-10 rounded-md object-cover border"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm">{statusCfg.icon}</span>
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', statusCfg.color)}>
              {statusCfg.label}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{question.subject}</span>
          </div>
          <p className="text-sm font-medium truncate">{question.title}</p>
          <p className="text-[10px] text-muted-foreground">{dateStr} · {question.source_text}</p>
        </div>
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border p-3 space-y-3 animate-fade-in bg-muted/20">
          {/* Question Details */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative group cursor-pointer" onClick={() => setViewerSrc(question.photo_problem_url)}>
                <img
                  src={question.photo_problem_url}
                  alt="문제"
                  className="w-full rounded-lg border object-contain max-h-48"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                  <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                </div>
                <span className="absolute bottom-1 left-1 text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded">문제</span>
              </div>
              <div className="relative group cursor-pointer" onClick={() => setViewerSrc(question.photo_solution_url)}>
                <img
                  src={question.photo_solution_url}
                  alt="내 풀이"
                  className="w-full rounded-lg border object-contain max-h-48"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                  <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                </div>
                <span className="absolute bottom-1 left-1 text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded">내 풀이</span>
              </div>
            </div>
            <div className="flex gap-1 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">{question.grade}</Badge>
              <Badge variant="outline" className="text-[10px]">{question.subject}</Badge>
              <span className="ml-auto flex items-center gap-1">
                <Eye className="w-3 h-3" /> {question.view_count}
              </span>
            </div>
            {question.description && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                {question.description}
              </p>
            )}
          </div>

          {/* Answers */}
          {hasAnswer ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <MessageCircle className="w-3.5 h-3.5" />
                선생님 답변 ({question.answers!.length}개)
              </div>
              {question.answers!.map((answer) => (
                <AnswerCard key={answer.id} answer={answer} />
              ))}
            </div>
          ) : (
            <div className="text-center py-3 text-xs text-muted-foreground">
              <MessageCircle className="w-5 h-5 mx-auto mb-1 opacity-40" />
              아직 답변이 없어요. 조금만 기다려주세요!
            </div>
          )}
        </div>
      )}

      {/* Image Viewer Modal */}
      <ImageViewerModal
        open={!!viewerSrc}
        onOpenChange={(v) => { if (!v) setViewerSrc(null); }}
        src={viewerSrc || ''}
        alt="수학질문 이미지"
      />
    </Card>
  );
}

function AnswerCard({ answer }: { answer: MathAnswer }) {
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const typeColors: Record<string, string> = {
    '힌트': 'bg-blue-500/10 text-blue-600',
    '전체해설': 'bg-green-500/10 text-green-600',
    '사진풀이': 'bg-purple-500/10 text-purple-600',
    '영상링크': 'bg-red-500/10 text-red-600',
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Badge className={cn('text-[10px]', typeColors[answer.answer_type] || 'bg-muted')}>
          {answer.answer_type}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {new Date(answer.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      {answer.content && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{answer.content}</p>
      )}

      {answer.answer_photo_urls?.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {answer.answer_photo_urls.map((url, i) => (
            <div key={i} className="relative group cursor-pointer flex-shrink-0" onClick={() => setViewerSrc(url)}>
              <img
                src={url}
                alt={`답변 사진 ${i + 1}`}
                className="h-32 rounded-lg border object-contain"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </div>
          ))}
        </div>
      )}

      {answer.video_url && (
        <a
          href={answer.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          🎬 영상 해설 보기
        </a>
      )}

      <ImageViewerModal
        open={!!viewerSrc}
        onOpenChange={(v) => { if (!v) setViewerSrc(null); }}
        src={viewerSrc || ''}
        alt="답변 이미지"
      />
    </div>
  );
}
