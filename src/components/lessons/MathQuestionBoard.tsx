// MATH-QUESTION-BOARD-V1: Teacher-side math question management with realtime
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  MessageCircle,
  Clock,
  CheckCircle2,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  Eye,
  Camera,
  Video,
  Lightbulb,
  FileText,
  RefreshCw,
  X,
  ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { compressImage } from '@/lib/imageCompression';

const ANSWER_TYPES = [
  { value: '힌트', icon: '💡', color: 'bg-blue-500/10 text-blue-600' },
  { value: '전체해설', icon: '📝', color: 'bg-green-500/10 text-green-600' },
  { value: '사진풀이', icon: '📸', color: 'bg-purple-500/10 text-purple-600' },
  { value: '영상링크', icon: '🎬', color: 'bg-red-500/10 text-red-600' },
] as const;

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  '대기중': { color: 'bg-yellow-500/10 text-yellow-600 border-yellow-300', label: '대기중', icon: '🟡' },
  '답변완료': { color: 'bg-green-500/10 text-green-600 border-green-300', label: '답변완료', icon: '🟢' },
  '힌트제공': { color: 'bg-blue-500/10 text-blue-600 border-blue-300', label: '힌트제공', icon: '🔵' },
  '공유됨': { color: 'bg-purple-500/10 text-purple-600 border-purple-300', label: '공유됨', icon: '🔗' },
};

interface Question {
  id: string;
  student_id: string;
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
  teacher_id: string | null;
  students?: { name: string } | null;
  math_answers?: Answer[];
}

interface Answer {
  id: string;
  answer_type: string;
  content: string | null;
  answer_photo_urls: string[];
  video_url: string | null;
  answer_input_mode: string;
  created_at: string;
  teacher_id: string;
}

export default function MathQuestionBoard() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pendingCount, setPendingCount] = useState(0);

  // Answer form
  const [answerType, setAnswerType] = useState<string>('전체해설');
  const [answerContent, setAnswerContent] = useState('');
  const [answerPhotos, setAnswerPhotos] = useState<File[]>([]);
  const [answerPhotoUrls, setAnswerPhotoUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [isSending, setIsSending] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('math_questions')
        .select('*, students!math_questions_student_id_fkey(name), math_answers(*)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Fetch questions error:', error);
        return;
      }

      // Sort: 대기중 first, then by created_at desc
      const sorted = (data || []).sort((a, b) => {
        if (a.status === '대기중' && b.status !== '대기중') return -1;
        if (a.status !== '대기중' && b.status === '대기중') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }) as Question[];

      setQuestions(sorted);
      setPendingCount(sorted.filter(q => q.status === '대기중').length);
    } catch (e) {
      console.error('fetchQuestions error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Realtime: new questions
  useEffect(() => {
    const channel = supabase
      .channel('math-questions-teacher')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'math_questions',
        },
        (payload) => {
          toast.info('새 수학 질문이 올라왔어요! 📚', {
            description: (payload.new as any).title,
            duration: 4000,
          });
          fetchQuestions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'math_questions',
        },
        () => {
          fetchQuestions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchQuestions]);

  const handleAnswerSubmit = async (questionId: string) => {
    if (!user?.id) return;
    if (!answerContent.trim() && answerPhotos.length === 0 && !videoUrl.trim()) {
      toast.error('답변 내용을 입력해주세요');
      return;
    }

    setIsSending(true);
    try {
      // Upload photos if any
      const uploadedUrls: string[] = [];
      for (const photo of answerPhotos) {
        const compressed = await compressImage(photo);
        const path = `answers/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('math-questions')
          .upload(path, compressed, { upsert: true });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from('math-questions')
            .getPublicUrl(path);
          uploadedUrls.push(urlData.publicUrl);
        }
      }

      const allPhotoUrls = [...answerPhotoUrls, ...uploadedUrls];

      const inputMode = answerPhotos.length > 0 && answerContent.trim()
        ? 'both'
        : answerPhotos.length > 0
          ? 'photo'
          : videoUrl.trim()
            ? 'video'
            : 'text';

      const { error: insertErr } = await supabase
        .from('math_answers')
        .insert({
          question_id: questionId,
          teacher_id: user.id,
          answer_type: answerType,
          content: answerContent.trim() || null,
          answer_photo_urls: allPhotoUrls,
          video_url: videoUrl.trim() || null,
          answer_input_mode: inputMode,
        });

      if (insertErr) {
        console.error('Insert answer error:', insertErr);
        toast.error('답변 저장에 실패했어요');
        return;
      }

      // Update question status
      const newStatus = answerType === '힌트' ? '힌트제공' : '답변완료';
      await supabase
        .from('math_questions')
        .update({ status: newStatus, teacher_id: user.id })
        .eq('id', questionId);

      toast.success('답변이 등록되었습니다 ✅');
      resetAnswerForm();
      setAnsweringId(null);
      fetchQuestions();
    } catch (e) {
      console.error('Answer submit error:', e);
      toast.error('답변 제출 중 오류가 발생했어요');
    } finally {
      setIsSending(false);
    }
  };

  const resetAnswerForm = () => {
    setAnswerType('전체해설');
    setAnswerContent('');
    setAnswerPhotos([]);
    setAnswerPhotoUrls([]);
    setVideoUrl('');
  };

  const handleAnswerPhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAnswerPhotos(prev => [...prev, ...files]);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            📚 수학질문방
          </h3>
          {pendingCount > 0 && (
            <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-400">
              대기중 {pendingCount}건
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="대기중">🟡 대기중</SelectItem>
              <SelectItem value="답변완료">🟢 답변완료</SelectItem>
              <SelectItem value="힌트제공">🔵 힌트제공</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchQuestions} className="h-8">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Questions List */}
      {questions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              {statusFilter === 'all' ? '아직 올라온 질문이 없습니다' : `${statusFilter} 상태의 질문이 없습니다`}
            </p>
          </CardContent>
        </Card>
      ) : (
        questions.map((q) => {
          const statusCfg = STATUS_CONFIG[q.status] || STATUS_CONFIG['대기중'];
          const isExpanded = expandedId === q.id;
          const isAnswering = answeringId === q.id;
          const studentName = (q.students as any)?.name || '학생';
          const answers = (q.math_answers || []) as Answer[];
          const dateStr = new Date(q.created_at).toLocaleDateString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          });

          return (
            <Card key={q.id} className={cn(
              'overflow-hidden transition-all border',
              q.status === '대기중' && 'border-yellow-300/50 shadow-sm',
            )}>
              {/* Question Header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : q.id)}
                className="w-full text-left p-4 flex items-start gap-3"
              >
                <div className="flex-shrink-0 flex gap-1.5">
                  <img src={q.photo_problem_url} alt="문제" className="w-12 h-12 rounded-md object-cover border" />
                  <img src={q.photo_solution_url} alt="풀이" className="w-12 h-12 rounded-md object-cover border" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <Badge variant="outline" className={cn('text-[10px] px-1.5', statusCfg.color)}>
                      {statusCfg.icon} {statusCfg.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{q.grade}</Badge>
                    <Badge variant="outline" className="text-[10px]">{q.subject}</Badge>
                    {q.status === '대기중' && (
                      <Badge className="bg-yellow-500/20 text-yellow-700 text-[10px] animate-pulse">
                        <Clock className="w-2.5 h-2.5 mr-0.5" /> 답변 대기
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate">{q.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {studentName} · {dateStr} · {q.source_text}
                  </p>
                </div>
                <div className="flex-shrink-0 mt-1">
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="border-t border-border p-4 space-y-4 animate-fade-in bg-muted/20">
                  {/* Photos */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">📌 문제 사진</p>
                      <img src={q.photo_problem_url} alt="문제" className="w-full rounded-lg border object-contain max-h-64" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">📝 학생 풀이</p>
                      <img src={q.photo_solution_url} alt="풀이" className="w-full rounded-lg border object-contain max-h-64" />
                    </div>
                  </div>

                  {q.description && (
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">학생 설명</p>
                      <p className="text-sm">{q.description}</p>
                    </div>
                  )}

                  {/* Existing Answers */}
                  {answers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">기존 답변 ({answers.length}개)</p>
                      {answers.map((a) => (
                        <div key={a.id} className="bg-card border rounded-lg p-3 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Badge className={cn('text-[10px]', ANSWER_TYPES.find(t => t.value === a.answer_type)?.color || 'bg-muted')}>
                              {a.answer_type}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(a.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          {a.content && <p className="text-sm whitespace-pre-wrap">{a.content}</p>}
                          {a.answer_photo_urls?.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto">
                              {a.answer_photo_urls.map((url, i) => (
                                <img key={i} src={url} alt="" className="h-24 rounded border object-contain" />
                              ))}
                            </div>
                          )}
                          {a.video_url && (
                            <a href={a.video_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                              🎬 영상 해설 보기
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Answer Form */}
                  {isAnswering ? (
                    <div className="border rounded-lg p-4 space-y-3 bg-card">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">답변 작성</p>
                        <Button variant="ghost" size="sm" onClick={() => { setAnsweringId(null); resetAnswerForm(); }}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Answer Type */}
                      <div className="flex gap-2 flex-wrap">
                        {ANSWER_TYPES.map((t) => (
                          <button
                            key={t.value}
                            onClick={() => setAnswerType(t.value)}
                            className={cn(
                              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                              answerType === t.value
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/50 border-border hover:bg-muted'
                            )}
                          >
                            {t.icon} {t.value}
                          </button>
                        ))}
                      </div>

                      {/* Text content */}
                      <Textarea
                        placeholder="답변 내용을 입력하세요..."
                        value={answerContent}
                        onChange={(e) => setAnswerContent(e.target.value)}
                        rows={4}
                      />

                      {/* Photo upload */}
                      <div>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                          <Camera className="w-4 h-4" />
                          사진 첨부
                          <input type="file" accept="image/*" multiple className="hidden" onChange={handleAnswerPhotoAdd} />
                        </label>
                        {answerPhotos.length > 0 && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {answerPhotos.map((f, i) => (
                              <div key={i} className="relative">
                                <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 rounded border object-cover" />
                                <button
                                  onClick={() => setAnswerPhotos(prev => prev.filter((_, j) => j !== i))}
                                  className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[8px]"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Video URL */}
                      {(answerType === '영상링크') && (
                        <Input
                          placeholder="영상 URL (YouTube 등)"
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                        />
                      )}

                      <Button
                        className="w-full"
                        disabled={isSending || (!answerContent.trim() && answerPhotos.length === 0 && !videoUrl.trim())}
                        onClick={() => handleAnswerSubmit(q.id)}
                      >
                        {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                        답변 보내기
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => { setAnsweringId(q.id); resetAnswerForm(); }}
                      className="w-full"
                      variant={q.status === '대기중' ? 'default' : 'outline'}
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      {q.status === '대기중' ? '답변하기' : '추가 답변'}
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
