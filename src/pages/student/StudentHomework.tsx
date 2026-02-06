// STUDENT-APP-V1: Student homework list and submission page
import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, 
  CheckCircle, 
  Clock,
  Loader2,
  ChevronLeft
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
}

export default function StudentHomework() {
  const { homeworkId } = useParams();
  const navigate = useNavigate();
  const { student } = useStudentAuth();
  const { toast } = useToast();
  
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [selectedHomework, setSelectedHomework] = useState<HomeworkItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  
  // Submission form state
  const [uploadImages, setUploadImages] = useState<ImageItem[]>([]);
  const [submissionNote, setSubmissionNote] = useState('');

  useEffect(() => {
    if (student?.id) {
      fetchHomework();
    }
  }, [student?.id]);

  useEffect(() => {
    if (homeworkId && homework.length > 0) {
      const hw = homework.find(h => h.id === homeworkId);
      if (hw) {
        setSelectedHomework(hw);
      }
    }
  }, [homeworkId, homework]);

  async function fetchHomework() {
    if (!student?.id) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await studentApi.getHomeworkList();
      
      if (error) {
        console.error('Homework fetch error:', error);
        toast({
          title: '오류',
          description: '숙제 목록을 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      if (data) {
        setHomework(data.homework);
      }
    } catch (error) {
      console.error('Fetch homework error:', error);
      toast({
        title: '오류',
        description: '숙제 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const clearImages = () => {
    uploadImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setUploadImages([]);
  };

  const handleSubmit = async () => {
    if (!selectedHomework || !student?.id) return;
    
    if (uploadImages.length === 0 && !submissionNote.trim()) {
      toast({
        title: '입력 필요',
        description: '사진 또는 메모를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const imageUrls: string[] = [];
      
      // Upload each image
      for (const img of uploadImages) {
        const fileExt = img.file.name.split('.').pop() || 'jpg';
        const fileName = `${student.id}/${selectedHomework.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('homework-submissions')
          .upload(fileName, img.file, { contentType: img.file.type });
        
        if (uploadError) {
          // Determine error type
          const msg = uploadError.message?.toLowerCase() || '';
          if (msg.includes('payload too large') || msg.includes('size')) {
            throw new Error('FILE_TOO_LARGE');
          }
          throw new Error('NETWORK_ERROR');
        }
        
        const { data: urlData } = supabase.storage
          .from('homework-submissions')
          .getPublicUrl(fileName);
        
        imageUrls.push(urlData.publicUrl);
      }
      
      // Submit via edge function
      const imageUrl = imageUrls.length > 0 ? imageUrls.join(',') : null;
      const { error } = await studentApi.submitHomework(
        selectedHomework.id,
        imageUrl,
        submissionNote.trim() || null
      );
      
      if (error) throw new Error('SUBMIT_ERROR');
      
      toast({
        title: '제출 완료',
        description: '숙제가 제출되었습니다!',
      });
      
      setShowSubmitDialog(false);
      clearImages();
      setSubmissionNote('');
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
    if (hw.check_status === 'checked') {
      if (hw.result === 'completed') {
        return <Badge className="bg-green-500/10 text-green-600">완료</Badge>;
      } else if (hw.result === 'partial') {
        return <Badge className="bg-amber-500/10 text-amber-600">일부 완료</Badge>;
      } else {
        return <Badge className="bg-red-500/10 text-red-600">미완료</Badge>;
      }
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

  // Detail view for a specific homework
  if (selectedHomework) {
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
            
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{selectedHomework.content}</p>
            </div>

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

            {selectedHomework.check_status === 'unchecked' && !selectedHomework.is_expired && (
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
                  {selectedHomework.submitted_at ? '다시 제출하기' : '숙제 제출하기'}
                </Button>
              </div>
            )}

            {selectedHomework.check_status === 'unchecked' && selectedHomework.is_expired && (
              <div className="p-3 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">⏰ 제출 기한이 지났습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submission Dialog */}
        <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>숙제 제출</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Multi-image upload */}
              <HomeworkImageUploader
                images={uploadImages}
                onImagesChange={setUploadImages}
                disabled={isSubmitting}
              />

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
                disabled={isSubmitting || (uploadImages.length === 0 && !submissionNote.trim())}
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const pendingHomework = homework.filter(hw => hw.check_status === 'unchecked');
  const completedHomework = homework.filter(hw => hw.check_status === 'checked');

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-xl font-bold">숙제</h1>

      {/* Pending Section */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Clock className="w-4 h-4" />
          제출 대기 ({pendingHomework.length})
        </h2>
        
        {pendingHomework.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
              <p>제출할 숙제가 없습니다! 🎉</p>
            </CardContent>
          </Card>
        ) : (
          pendingHomework.map((hw) => (
            <Card 
              key={hw.id}
              className="hover:bg-accent transition-colors cursor-pointer"
              onClick={() => {
                setSelectedHomework(hw);
                navigate(`/student/homework/${hw.id}`);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getSubjectColor(hw.subject)}>
                        {hw.subject}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(hw.assigned_date), 'M/d')}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2">{hw.content}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    <Upload className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Completed Section */}
      {completedHomework.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            완료됨 ({completedHomework.length})
          </h2>
          
          {completedHomework.map((hw) => (
            <Card 
              key={hw.id}
              className="opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => {
                setSelectedHomework(hw);
                navigate(`/student/homework/${hw.id}`);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getSubjectColor(hw.subject)}>
                        {hw.subject}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(hw.assigned_date), 'M/d')}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-1">{hw.content}</p>
                  </div>
                  {getStatusBadge(hw)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
