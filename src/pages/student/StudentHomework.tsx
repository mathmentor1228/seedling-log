// STUDENT-APP-V1: Student homework list and submission page
import { useEffect, useState, useCallback } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  CheckCircle, 
  Clock,
  Loader2,
  ChevronLeft,
  AlertTriangle,
  Mic,
  WifiOff,
  RefreshCw,
  PartyPopper
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import HomeworkImageUploader, { type ImageItem } from '@/components/student/HomeworkImageUploader';
import VoiceRecorder, { type RecordedAudio } from '@/components/student/VoiceRecorder';
import { ExamResultSubmitCard } from '@/components/student/ExamResultSubmitCard';

interface HomeworkItem {
  id: string;
  content: string;
  subject: string;
  assigned_date: string;
  check_status: string;
  result: string | null;
  notes: string | null;
  submitted_at: string | null;
  submission_image_url: string | null;
  is_expired?: boolean;
  is_submission_closed?: boolean;
  homework_type?: string;
  deadline_at?: string | null;
  is_deadline_passed?: boolean;
  is_no_homework?: boolean;
  submission_audio_url?: string | null;
  required_submissions?: number;
  end_date?: string | null;
  submission_count?: number;
}

// VOICE-RECORD-V1: All subjects support voice recording; 영어 is the only required one
const VOICE_SUBJECTS = ['영어'];

// DEADLINE-V1: Format deadline for display
function formatDeadline(deadlineAt: string): string {
  const d = new Date(deadlineAt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const timeStr = format(d, 'M월 d일 (EEE) a h:mm', { locale: ko });

  if (diffMs <= 0) return `마감됨`;
  if (diffHours < 1) return `${diffMinutes}분 후 마감`;
  if (diffHours < 24) return `${diffHours}시간 ${diffMinutes > 0 ? diffMinutes + '분' : ''} 후 마감`;
  return `${timeStr}까지`;
}

function getDeadlineUrgency(deadlineAt: string): 'expired' | 'urgent' | 'warning' | 'normal' {
  const d = new Date(deadlineAt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) return 'expired';
  if (diffHours <= 2) return 'urgent';
  if (diffHours <= 6) return 'warning';
  return 'normal';
}

export default function StudentHomework() {
  const { homeworkId } = useParams();
  const navigate = useNavigate();
  const { student } = useStudentAuth();
  const { toast } = useToast();
  
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [selectedHomework, setSelectedHomework] = useState<HomeworkItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Submission form state
  const [uploadImages, setUploadImages] = useState<ImageItem[]>([]);
  const [submissionNote, setSubmissionNote] = useState('');
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(null);
  
  // COUNTDOWN-V1: Live countdown ticker
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000); // tick every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (student?.id) {
      fetchHomework();
    }
  }, [student?.id]);

  // Auto-refetch when page becomes visible (e.g. teacher deleted homework while student was away)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && student?.id && !showSubmitDialog) {
        fetchHomework();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [student?.id, showSubmitDialog]);

  useEffect(() => {
    if (homeworkId && homework.length > 0) {
      const hw = homework.find(h => h.id === homeworkId);
      if (hw) {
        setSelectedHomework(hw);
      } else {
        // Homework was deleted — clear selection and go back to list
        setSelectedHomework(null);
        navigate('/student/homework', { replace: true });
      }
    }
  }, [homeworkId, homework]);

  async function fetchHomework() {
    if (!student?.id) return;
    
    setIsLoading(true);
    setFetchError(false);
    try {
      const { data, error } = await studentApi.getHomeworkList();
      
      if (error) {
        console.error('Homework fetch error:', error);
        setFetchError(true);
        return;
      }

      if (data) {
        setHomework(data.homework);
      }
    } catch (error) {
      console.error('Fetch homework error:', error);
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }

  const clearImages = () => {
    uploadImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setUploadImages([]);
  };

  // VOICE-RECORD-V1: All subjects can use voice recording; only English is required
  const showVoiceRecorder = (subject: string): boolean => {
    return true; // 모든 과목에서 음성 녹음 선택 가능
  };

  const isVoiceRequired = (subject: string): boolean => {
    return VOICE_SUBJECTS.includes(subject);
  };

  // DEADLINE-V1: Check if submission is allowed
  const isSubmissionBlocked = (hw: HomeworkItem): boolean => {
    if (hw.check_status === 'checked') return true;
    if (hw.check_status === 'resubmit') return false; // Allow resubmission
    if (hw.check_status !== 'unchecked') return true;
    if (hw.is_expired) return true;
    if (hw.is_submission_closed) return true;
    if (hw.is_deadline_passed) return true;
    // For daily homework: blocked if all submissions done
    if (hw.homework_type === 'daily' && hw.required_submissions && hw.required_submissions > 1) {
      if ((hw.submission_count || 0) >= hw.required_submissions) return true;
    }
    return false;
  };

  const handleSubmit = async () => {
    if (!selectedHomework || !student?.id) return;
    
    // DEADLINE-V1: Client-side deadline check
    if (selectedHomework.is_deadline_passed) {
      toast({
        title: '마감 시간 초과',
        description: '숙제 제출 마감 시간이 지났습니다.',
        variant: 'destructive',
      });
      return;
    }
    
    // VOICE-RECORD-V1: Check voice requirement
    if (isVoiceRequired(selectedHomework.subject) && !recordedAudio && uploadImages.length === 0 && !submissionNote.trim()) {
      toast({
        title: '음성 녹음 필요',
        description: `${selectedHomework.subject} 과목은 음성 녹음을 포함해야 합니다.`,
        variant: 'destructive',
      });
      return;
    }
    
    if (uploadImages.length === 0 && !submissionNote.trim() && !recordedAudio) {
      toast({
        title: '입력 필요',
        description: '사진, 음성 녹음 또는 메모를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const imageUrls: string[] = [];
      
      // STUDENT-UPLOAD-V2: buckets are private, upload through the secure student endpoint
      for (const img of uploadImages) {
        const fileExt = img.file.name.split('.').pop() || 'jpg';
        const base64 = await fileToBase64(img.file);
        const { data: up, error: upErr } = await studentApi.uploadFile({
          bucket: 'homework-submissions',
          homework_id: selectedHomework.id,
          content: base64,
          content_type: img.file.type || 'image/jpeg',
          ext: fileExt,
        });

        if (upErr || !up?.url) {
          if ((upErr || '').includes('FILE_TOO_LARGE')) throw new Error('FILE_TOO_LARGE');
          throw new Error('NETWORK_ERROR');
        }
        imageUrls.push(up.url);
      }
      
      // VOICE-RECORD-V1: Upload audio if present
      let audioUrl: string | null = null;
      if (recordedAudio) {
        const audioExt = recordedAudio.blob.type.includes('mp4') ? 'mp4' : 'webm';
        const audioBase64 = await fileToBase64(recordedAudio.blob);
        const { data: upAudio, error: audioUploadError } = await studentApi.uploadFile({
          bucket: 'homework-submissions',
          homework_id: selectedHomework.id,
          content: audioBase64,
          content_type: recordedAudio.blob.type || 'audio/webm',
          ext: audioExt,
        });

        if (audioUploadError || !upAudio?.url) {
          throw new Error('NETWORK_ERROR');
        }

        audioUrl = upAudio.url;
      }


      // Submit via edge function
      const imageUrl = imageUrls.length > 0 ? imageUrls.join(',') : null;
      const { error, data: submitData } = await studentApi.submitHomework(
        selectedHomework.id,
        imageUrl,
        submissionNote.trim() || null,
        audioUrl
      );
      
      // DEADLINE-V1: Handle server-side deadline rejection
      if (error) {
        if (error.includes('DEADLINE_PASSED') || error.includes('마감')) {
          toast({
            title: '마감 시간 초과',
            description: '숙제 제출 마감 시간이 지났습니다. 다음 수업 전까지 제출해주세요.',
            variant: 'destructive',
          });
          setShowSubmitDialog(false);
          fetchHomework(); // Refresh to update deadline status
          return;
        }
        throw new Error('SUBMIT_ERROR');
      }
      
      // Show success animation
      setShowSubmitDialog(false);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
      }, 2500);
      
      clearImages();
      setSubmissionNote('');
      setRecordedAudio(null);
      fetchHomework();
      
    } catch (error: any) {
      const code = error?.message || '';
      if (code === 'FILE_TOO_LARGE') {
        toast({
          title: '용량 초과',
          description: '이미지 파일 크기가 너무 큽니다. 더 작은 사진을 사용해주세요.',
          variant: 'destructive',
        });
      } else if (code === 'NETWORK_ERROR') {
        toast({
          title: '네트워크 오류',
          description: '인터넷 연결을 확인하고 다시 시도해주세요.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: '제출 실패',
          description: '숙제 제출에 실패했습니다. 다시 시도해주세요.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (hw: HomeworkItem) => {
    if (hw.check_status === 'resubmit') {
      return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/30">재제출 요청</Badge>;
    }
    if (hw.check_status === 'checked') {
      return <Badge className="bg-green-500/10 text-green-600">확인완료</Badge>;
    }
    if (hw.submitted_at || (hw.submission_count && hw.submission_count > 0)) {
      return <Badge className="bg-blue-500/10 text-blue-600">제출완료</Badge>;
    }
    return <Badge className="bg-muted text-muted-foreground">대기중</Badge>;
  };

  const getSubjectColor = (subject: string) => {
    switch (subject) {
      case '수학': return 'bg-blue-500/10 text-blue-600';
      case '영어': return 'bg-green-500/10 text-green-600';
      case '국어': return 'bg-purple-500/10 text-purple-600';
      case '과학': return 'bg-orange-500/10 text-orange-600';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // DEADLINE-V1: Deadline badge component
  const DeadlineBadge = ({ hw }: { hw: HomeworkItem }) => {
    if (hw.check_status !== 'unchecked' || !hw.deadline_at) return null;

    const urgency = getDeadlineUrgency(hw.deadline_at);
    const label = formatDeadline(hw.deadline_at);

    const colorMap = {
      expired: 'bg-red-500/10 text-red-600 border-red-500/30',
      urgent: 'bg-red-500/10 text-red-600 border-red-500/30',
      warning: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
      normal: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    };

    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${colorMap[urgency]}`}>
        {urgency === 'expired' ? (
          <AlertTriangle className="w-3 h-3" />
        ) : (
          <Clock className="w-3 h-3" />
        )}
        {label}
      </span>
    );
  };

  // Success overlay
  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
        <div className="text-center space-y-4 animate-scale-in">
          <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
            <PartyPopper className="w-10 h-10 text-green-500" />
          </div>
          <div>
            <p className="text-xl font-bold">제출 완료! 🎉</p>
            <p className="text-sm text-muted-foreground mt-1">잘했어요! 선생님이 확인할 거예요</p>
          </div>
        </div>
      </div>
    );
  }

  // Detail view for a specific homework
  if (selectedHomework) {
    const blocked = isSubmissionBlocked(selectedHomework);
    const deadlinePassed = selectedHomework.is_deadline_passed;

    return (
      <div className="space-y-4 pb-20">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              setSelectedHomework(null);
              navigate('/student/homework');
            }}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold">숙제 상세</h1>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Badge className={getSubjectColor(selectedHomework.subject)}>
                {selectedHomework.subject}
              </Badge>
              {getStatusBadge(selectedHomework)}
            </div>
            
            <p className="text-sm text-muted-foreground">
              {format(new Date(selectedHomework.assigned_date), 'M월 d일 (EEEE)', { locale: ko })}
            </p>

            {/* DEADLINE-V1: Show deadline info (hide for submission-closed items) */}
            {selectedHomework.check_status === 'unchecked' && selectedHomework.deadline_at && !selectedHomework.is_submission_closed && (
              <div className={`p-3 rounded-lg border flex items-center gap-2 ${
                deadlinePassed
                  ? 'bg-red-500/10 border-red-500/30'
                  : getDeadlineUrgency(selectedHomework.deadline_at) === 'urgent'
                    ? 'bg-red-500/10 border-red-500/30'
                    : getDeadlineUrgency(selectedHomework.deadline_at) === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-blue-500/10 border-blue-500/30'
              }`}>
                <Clock className="w-4 h-4 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {deadlinePassed ? '⏰ 제출 마감됨' : `⏰ 마감: ${formatDeadline(selectedHomework.deadline_at)}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    수업 시작 3시간 전에 제출이 마감됩니다
                  </p>
                </div>
              </div>
            )}
            
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{selectedHomework.content}</p>
            </div>

            {/* Teacher feedback / comment */}
            {(selectedHomework.check_status === 'resubmit' || selectedHomework.check_status === 'checked') && selectedHomework.result && (
              <div className={`p-3 rounded-lg border ${
                selectedHomework.check_status === 'resubmit' 
                  ? 'bg-orange-500/10 border-orange-500/30' 
                  : 'bg-green-500/10 border-green-500/30'
              }`}>
                <p className="text-xs font-medium mb-1">
                  {selectedHomework.check_status === 'resubmit' ? '📝 선생님 코멘트 (재제출 요청)' : '✅ 선생님 코멘트'}
                </p>
                <p className="text-sm whitespace-pre-wrap">{selectedHomework.result}</p>
              </div>
            )}

            {selectedHomework.check_status === 'resubmit' && !selectedHomework.result && (
              <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <p className="text-sm font-medium">📝 선생님이 다시 제출을 요청했습니다</p>
                <p className="text-xs text-muted-foreground mt-0.5">아래 버튼을 눌러 숙제를 다시 제출해주세요</p>
              </div>
            )}

            {selectedHomework.notes && (
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-xs text-muted-foreground mb-1">선생님 메모</p>
                <p className="text-sm">{selectedHomework.notes}</p>
              </div>
            )}

            {/* Show submitted images */}
            {selectedHomework.submission_image_url && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">📷 제출한 사진</p>
                <div className="grid grid-cols-3 gap-2">
                  {selectedHomework.submission_image_url.split(',').map((url, idx) => (
                    <a key={idx} href={url.trim()} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border">
                      <img
                        src={url.trim()}
                        alt={`제출 사진 ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </a>
                  ))}
                </div>
                {selectedHomework.submitted_at && (
                  <p className="text-xs text-muted-foreground">
                    제출: {format(new Date(selectedHomework.submitted_at), 'M월 d일 HH:mm', { locale: ko })}
                  </p>
                )}
              </div>
            )}

            {/* VOICE-RECORD-V1: Show submitted audio */}
            {selectedHomework.submission_audio_url && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">🎙️ 제출한 음성</p>
                <audio controls className="w-full" src={selectedHomework.submission_audio_url}>
                  브라우저가 오디오 재생을 지원하지 않습니다.
                </audio>
              </div>
            )}

            {/* Daily homework submission progress */}
            {selectedHomework.homework_type === 'daily' && selectedHomework.required_submissions && selectedHomework.required_submissions > 1 && (
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">인증 진행</span>
                  <span className="text-sm font-bold text-primary">
                    {selectedHomework.submission_count || 0} / {selectedHomework.required_submissions}회
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((selectedHomework.submission_count || 0) / selectedHomework.required_submissions) * 100)}%` }}
                  />
                </div>
                {selectedHomework.end_date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    기간: {selectedHomework.assigned_date} ~ {selectedHomework.end_date}
                  </p>
                )}
              </div>
            )}

            {/* DEADLINE-V1: Show submit button or deadline-passed message */}
            {(selectedHomework.check_status === 'unchecked' || selectedHomework.check_status === 'resubmit') && !selectedHomework.is_expired && !selectedHomework.is_submission_closed && !deadlinePassed && !isSubmissionBlocked(selectedHomework) && (
              <div className="space-y-3">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-700 font-medium">
                    ⚠️ 반드시 전체 페이지가 잘 나오게 올려주세요. 페이지가 보이지 않거나 흔들려 제대로 안보이는 경우 숙제는 미제출로 기록됩니다.
                  </p>
                </div>
                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={() => setShowSubmitDialog(true)}
                >
                  <Upload className="w-5 h-5 mr-2" />
                  {selectedHomework.check_status === 'resubmit'
                    ? '다시 제출하기'
                    : selectedHomework.homework_type === 'daily' && selectedHomework.required_submissions && selectedHomework.required_submissions > 1
                      ? `${(selectedHomework.submission_count || 0) + 1}번째 인증하기`
                      : selectedHomework.submitted_at ? '다시 제출하기' : '숙제 제출하기'}
                </Button>
              </div>
            )}

            {/* Daily homework: all submissions complete */}
            {selectedHomework.homework_type === 'daily' && selectedHomework.required_submissions && selectedHomework.required_submissions > 1 && 
             (selectedHomework.submission_count || 0) >= selectedHomework.required_submissions && selectedHomework.check_status === 'unchecked' && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                <CheckCircle className="w-6 h-6 mx-auto mb-1 text-green-500" />
                <p className="text-sm font-medium text-green-600">모든 인증을 완료했습니다! 🎉</p>
              </div>
            )}

            {selectedHomework.check_status === 'unchecked' && deadlinePassed && !selectedHomework.is_expired && !selectedHomework.is_submission_closed && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-red-500" />
                <p className="text-sm font-medium text-red-600">제출 마감 시간이 지났습니다</p>
                <p className="text-xs text-muted-foreground mt-1">수업 시작 3시간 전까지 제출해야 합니다</p>
              </div>
            )}

            {selectedHomework.check_status === 'unchecked' && selectedHomework.is_expired && (
              <div className="p-3 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">⏰ 제출 기한이 지났습니다.</p>
              </div>
            )}

            {selectedHomework.check_status === 'unchecked' && selectedHomework.is_submission_closed && (
              <div className="p-3 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">미제출</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submission Dialog */}
        <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
          <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>숙제 제출</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {/* Multi-image upload */}
              <HomeworkImageUploader
                images={uploadImages}
                onImagesChange={setUploadImages}
                disabled={isSubmitting}
              />

              {/* VOICE-RECORD-V1: Voice recorder (subject-based) */}
              {selectedHomework && showVoiceRecorder(selectedHomework.subject) && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      음성 녹음 {isVoiceRequired(selectedHomework.subject) ? '(필수)' : '(선택)'}
                    </span>
                  </div>
                  <VoiceRecorder
                    audio={recordedAudio}
                    onAudioChange={setRecordedAudio}
                    disabled={isSubmitting}
                  />
                </div>
              )}

              {/* Note input */}
              <div>
                <Textarea
                  placeholder="메모 (선택사항)"
                  value={submissionNote}
                  onChange={(e) => setSubmissionNote(e.target.value)}
                  rows={3}
                />
              </div>

              <Button 
                className="w-full" 
                size="lg"
                onClick={handleSubmit}
                disabled={isSubmitting || (uploadImages.length === 0 && !submissionNote.trim() && !recordedAudio)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    제출 중...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    제출하기
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Homework list view
  if (isLoading) {
    return (
      <div className="space-y-6 pb-20 animate-fade-in">
        <Skeleton className="h-7 w-20" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
    );
  }

  // Network error state
  if (fetchError) {
    return (
      <div className="space-y-6 pb-20 animate-fade-in">
        <h1 className="text-xl font-bold">숙제</h1>
        <Card className="border-destructive/30">
          <CardContent className="p-8 text-center space-y-4">
            <WifiOff className="w-12 h-12 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">숙제를 불러올 수 없습니다</p>
              <p className="text-sm text-muted-foreground mt-1">인터넷 연결을 확인하고 다시 시도해주세요</p>
            </div>
            <Button onClick={fetchHomework} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              다시 시도
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingHomework = homework.filter(hw => 
    (hw.check_status === 'unchecked' || hw.check_status === 'resubmit') && 
    !hw.is_expired && 
    !hw.is_submission_closed && 
    !hw.is_deadline_passed &&
    !hw.is_no_homework &&
    hw.content?.trim() !== '없음'
  );
  const expiredHomework = homework.filter(hw =>
    hw.check_status === 'unchecked' &&
    (hw.is_deadline_passed || hw.is_expired) &&
    !hw.is_submission_closed &&
    !hw.is_no_homework &&
    hw.content?.trim() !== '없음'
  );
  const completedHomework = homework.filter(hw => hw.check_status === 'checked');

  // Group homework by date, then sort subjects within each date
  const SUBJECT_ORDER = ['수학', '영어', '국어', '과학'];
  const groupByDate = (items: HomeworkItem[]) => {
    const groups: Record<string, HomeworkItem[]> = {};
    items.forEach(hw => {
      const dateKey = hw.assigned_date;
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(hw);
    });
    // Sort each group by subject order
    Object.values(groups).forEach(group => {
      group.sort((a, b) => {
        const ai = SUBJECT_ORDER.indexOf(a.subject);
        const bi = SUBJECT_ORDER.indexOf(b.subject);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    });
    // Return sorted by date descending
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

  const expiredByDate = groupByDate(expiredHomework);
  const pendingByDate = groupByDate(pendingHomework);
  const completedByDate = groupByDate(completedHomework);

  const renderHomeworkCard = (hw: HomeworkItem, isPending: boolean) => (
    <Card 
      key={hw.id}
      className={`hover:bg-accent transition-colors cursor-pointer ${!isPending ? 'opacity-70 hover:opacity-100' : ''}`}
      onClick={() => {
        setSelectedHomework(hw);
        navigate(`/student/homework/${hw.id}`);
      }}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className={getSubjectColor(hw.subject)}>
                {hw.subject}
              </Badge>
              {hw.homework_type === 'daily' && (
                <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                  데일리 {hw.required_submissions && hw.required_submissions > 1 
                    ? `${hw.submission_count || 0}/${hw.required_submissions}` 
                    : ''}
                </Badge>
              )}
              {isPending && showVoiceRecorder(hw.subject) && (
                <Mic className="w-3 h-3 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm line-clamp-2">{hw.content}</p>
            {isPending && hw.deadline_at && !hw.is_submission_closed && (
              <div className="mt-1.5">
                <DeadlineBadge hw={hw} />
              </div>
            )}
          </div>
          {isPending ? (
            hw.check_status === 'resubmit' ? (
              <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/30 flex-shrink-0">
                재제출
              </Badge>
            ) : hw.is_submission_closed ? (
              <Badge variant="outline" className="text-xs border-muted text-muted-foreground flex-shrink-0">
                미제출
              </Badge>
            ) : hw.is_deadline_passed ? (
              <Badge variant="outline" className="text-xs border-red-500/40 text-red-500 flex-shrink-0">
                마감됨
              </Badge>
            ) : (
              <Button variant="outline" size="sm" className="flex-shrink-0">
                <Upload className="w-4 h-4" />
              </Button>
            )
          ) : (
            getStatusBadge(hw)
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderDateGroup = (dateGroups: [string, HomeworkItem[]][], isPending: boolean) => (
    dateGroups.map(([dateKey, items]) => (
      <div key={dateKey} className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium text-muted-foreground px-2">
            {format(new Date(dateKey + 'T00:00:00'), 'M월 d일 (EEE)', { locale: ko })}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        {items.map(hw => renderHomeworkCard(hw, isPending))}
      </div>
    ))
  );

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-xl font-bold">숙제</h1>

      <ExamResultSubmitCard />

      {/* Pending Section */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Clock className="w-4 h-4" />
          제출 대기 ({pendingHomework.length})
        </h2>
        
        {pendingByDate.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
              <p>제출할 숙제가 없습니다! 🎉</p>
            </CardContent>
          </Card>
        ) : (
          renderDateGroup(pendingByDate, true)
        )}
      </div>

      {/* Expired Section */}
      {expiredByDate.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            제출 시간 초과 ({expiredHomework.length})
          </h2>
          {expiredByDate.map(([dateKey, items]) => (
            <div key={dateKey} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground px-2">
                  {format(new Date(dateKey + 'T00:00:00'), 'M월 d일 (EEE)', { locale: ko })}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              {items.map(hw => (
                <Card 
                  key={hw.id}
                  className="opacity-70 hover:opacity-100 transition-colors cursor-pointer border-destructive/20"
                  onClick={() => {
                    setSelectedHomework(hw);
                    navigate(`/student/homework/${hw.id}`);
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge className={getSubjectColor(hw.subject)}>
                            {hw.subject}
                          </Badge>
                        </div>
                        <p className="text-sm line-clamp-2">{hw.content}</p>
                      </div>
                      <Badge variant="outline" className="text-xs border-destructive/40 text-destructive flex-shrink-0">
                        시간 초과
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Completed Section */}
      {completedByDate.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            완료됨 ({completedHomework.length})
          </h2>
          {renderDateGroup(completedByDate, false)}
        </div>
      )}
    </div>
  );
}
