 // STUDENT-APP-V1: Student homework list and submission page
 import { useEffect, useState, useRef } from 'react';
 import { useStudentAuth } from '@/lib/studentAuth';
 import { supabase } from '@/integrations/supabase/client';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { Textarea } from '@/components/ui/textarea';
 import { useToast } from '@/hooks/use-toast';
 import { 
   Camera, 
   Upload, 
   CheckCircle, 
   Clock,
   Image as ImageIcon,
   X,
   Loader2,
   ChevronLeft
 } from 'lucide-react';
 import { Link, useParams, useNavigate } from 'react-router-dom';
 import { format } from 'date-fns';
 import { ko } from 'date-fns/locale';
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from '@/components/ui/dialog';
 
 interface HomeworkItem {
   id: string;
   content: string;
   subject: string;
   assigned_date: string;
   check_status: string;
   result: string | null;
   notes: string | null;
 }
 
 interface SubmissionData {
   id: string;
   image_url: string | null;
   submission_note: string | null;
   submitted_at: string;
   status: string;
   feedback: string | null;
   points_awarded: number;
 }
 
 export default function StudentHomework() {
   const { homeworkId } = useParams();
   const navigate = useNavigate();
   const { student } = useStudentAuth();
   const { toast } = useToast();
   
   const [homework, setHomework] = useState<HomeworkItem[]>([]);
   const [selectedHomework, setSelectedHomework] = useState<HomeworkItem | null>(null);
   const [submission, setSubmission] = useState<SubmissionData | null>(null);
   const [isLoading, setIsLoading] = useState(true);
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [showSubmitDialog, setShowSubmitDialog] = useState(false);
   
   // Submission form state
   const [imageFile, setImageFile] = useState<File | null>(null);
   const [imagePreview, setImagePreview] = useState<string | null>(null);
   const [submissionNote, setSubmissionNote] = useState('');
   
   const fileInputRef = useRef<HTMLInputElement>(null);
 
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
         fetchSubmission(homeworkId);
       }
     }
   }, [homeworkId, homework]);
 
   async function fetchHomework() {
     if (!student?.id) return;
     
     setIsLoading(true);
     try {
       // Fetch homework from last 30 days
       const thirtyDaysAgo = new Date();
       thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
       
       const { data, error } = await supabase
         .from('homework_assignments')
         .select('id, content, subject, assigned_date, check_status, result, notes')
         .eq('student_id', student.id)
         .gte('assigned_date', thirtyDaysAgo.toISOString().split('T')[0])
         .order('assigned_date', { ascending: false });
       
       if (error) throw error;
       setHomework(data || []);
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
 
   async function fetchSubmission(hwId: string) {
     try {
       const { data } = await supabase
         .from('homework_submissions')
         .select('*')
         .eq('homework_id', hwId)
         .eq('student_id', student?.id)
         .order('submitted_at', { ascending: false })
         .limit(1)
         .single();
       
       setSubmission(data);
     } catch {
       setSubmission(null);
     }
   }
 
   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (file) {
       // Validate file type
       if (!file.type.startsWith('image/')) {
         toast({
           title: '오류',
           description: '이미지 파일만 업로드할 수 있습니다.',
           variant: 'destructive',
         });
         return;
       }
       
       // Validate file size (max 10MB)
       if (file.size > 10 * 1024 * 1024) {
         toast({
           title: '오류',
           description: '파일 크기는 10MB 이하여야 합니다.',
           variant: 'destructive',
         });
         return;
       }
       
       setImageFile(file);
       
       // Create preview
       const reader = new FileReader();
       reader.onload = (e) => {
         setImagePreview(e.target?.result as string);
       };
       reader.readAsDataURL(file);
     }
   };
 
   const clearImage = () => {
     setImageFile(null);
     setImagePreview(null);
     if (fileInputRef.current) {
       fileInputRef.current.value = '';
     }
   };
 
   const handleSubmit = async () => {
     if (!selectedHomework || !student?.id) return;
     
     if (!imageFile && !submissionNote.trim()) {
       toast({
         title: '입력 필요',
         description: '사진 또는 메모를 입력해주세요.',
         variant: 'destructive',
       });
       return;
     }
     
     setIsSubmitting(true);
     
     try {
       let imageUrl: string | null = null;
       
       // Upload image if provided
       if (imageFile) {
         const fileExt = imageFile.name.split('.').pop();
         const fileName = `${student.id}/${selectedHomework.id}/${Date.now()}.${fileExt}`;
         
         const { error: uploadError } = await supabase.storage
           .from('homework-submissions')
           .upload(fileName, imageFile);
         
         if (uploadError) throw uploadError;
         
         const { data: urlData } = supabase.storage
           .from('homework-submissions')
           .getPublicUrl(fileName);
         
         imageUrl = urlData.publicUrl;
       }
       
       // Note: We can't insert directly due to RLS, so we'll update the homework_assignments table
       // and let the backend handle the submission creation
       const { error } = await supabase
         .from('homework_assignments')
         .update({
           submission_image_url: imageUrl,
           submission_text: submissionNote.trim() || null,
           submitted_at: new Date().toISOString(),
         })
         .eq('id', selectedHomework.id);
       
       if (error) throw error;
       
       toast({
         title: '제출 완료',
         description: '숙제가 제출되었습니다!',
       });
       
       setShowSubmitDialog(false);
       clearImage();
       setSubmissionNote('');
       fetchHomework();
       
     } catch (error) {
       console.error('Submit error:', error);
       toast({
         title: '제출 실패',
         description: '숙제 제출에 실패했습니다. 다시 시도해주세요.',
         variant: 'destructive',
       });
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
 
             {selectedHomework.check_status === 'unchecked' && (
               <Button 
                 className="w-full" 
                 size="lg"
                 onClick={() => setShowSubmitDialog(true)}
               >
                 <Upload className="w-5 h-5 mr-2" />
                 숙제 제출하기
               </Button>
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
               {/* Image upload */}
               <div>
                 <input
                   ref={fileInputRef}
                   type="file"
                   accept="image/*"
                   capture="environment"
                   onChange={handleFileSelect}
                   className="hidden"
                 />
                 
                 {imagePreview ? (
                   <div className="relative">
                     <img 
                       src={imagePreview} 
                       alt="Preview" 
                       className="w-full h-48 object-cover rounded-lg"
                     />
                     <Button
                       variant="destructive"
                       size="icon"
                       className="absolute top-2 right-2 h-8 w-8"
                       onClick={clearImage}
                     >
                       <X className="w-4 h-4" />
                     </Button>
                   </div>
                 ) : (
                   <Button
                     variant="outline"
                     className="w-full h-32 flex flex-col gap-2"
                     onClick={() => fileInputRef.current?.click()}
                   >
                     <Camera className="w-8 h-8" />
                     <span>사진 촬영 / 선택</span>
                   </Button>
                 )}
               </div>
 
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
                 disabled={isSubmitting || (!imageFile && !submissionNote.trim())}
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