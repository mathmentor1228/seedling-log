import { useEffect, useState } from 'react';
import { useAuth, isAdmin as checkIsAdmin, isAssistant as checkIsAssistant } from '@/lib/auth';
import { getTodayKST, getKSTDateObject } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  CalendarDays, 
  Plus, 
  List,
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  Loader2,
  MapPin,
  Bell,
  Pin,
  Trash2,
  Upload,
  Image,
  Download,
  X,
  Paperclip
} from 'lucide-react';
import { format, addDays, startOfMonth, endOfMonth, isSameDay, isWithinInterval } from 'date-fns';
import { ko } from 'date-fns/locale';

interface EventAttachment {
  id: string;
  event_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface AcademyEvent {
  id: string;
  created_at: string;
  created_by: string;
  creator_name?: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  visibility: string;
  location: string | null;
  category: string;
  is_announcement: boolean;
  pinned: boolean;
  attachments?: EventAttachment[];
}

const CATEGORY_OPTIONS = [
  { value: 'general', label: '일반', variant: 'secondary' as const, color: 'bg-slate-400' },
  { value: 'notice', label: '공지', variant: 'default' as const, color: 'bg-blue-500' },
  { value: 'exam', label: '시험', variant: 'destructive' as const, color: 'bg-red-500' },
  { value: 'meeting', label: '회의', variant: 'outline' as const, color: 'bg-purple-500' },
  { value: 'holiday', label: '휴강', variant: 'warning' as const, color: 'bg-amber-500' },
  { value: 'event', label: '행사', variant: 'success' as const, color: 'bg-emerald-500' },
  { value: 'makeup', label: '보강', variant: 'outline' as const, color: 'bg-cyan-500' },
  { value: 'attendance_issue', label: '출결이슈', variant: 'destructive' as const, color: 'bg-orange-500' },
];

const VISIBILITY_OPTIONS = [
  { value: 'all', label: '전체 공개' },
  { value: 'admin', label: '원장만' },
  { value: 'teacher', label: '선생님만' },
  { value: 'assistant', label: '조교만' },
];

export function AcademyCalendar() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = checkIsAdmin(role);
  const isAssistant = checkIsAssistant(role);
  const canUploadPosters = isAdmin || isAssistant;
  
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AcademyEvent[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Filter
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
  // Create form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: getTodayKST(),
    start_time: '09:00',
    end_date: '',
    end_time: '',
    all_day: false,
    visibility: 'all',
    location: '',
    category: 'general',
    is_announcement: false,
    pinned: false,
  });
  const [posterFiles, setPosterFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit dialog for posters
  const [editEvent, setEditEvent] = useState<AcademyEvent | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [additionalPosterFiles, setAdditionalPosterFiles] = useState<File[]>([]);
  const [uploadingPosters, setUploadingPosters] = useState(false);

  useEffect(() => {
    if (user) {
      fetchEvents();
    }
  }, [user, filterCategory]);

  async function fetchEvents() {
    try {
      setLoading(true);
      
      const today = getTodayKST();
      const futureDate = format(addDays(getKSTDateObject(), 30), 'yyyy-MM-dd');
      // Use KST offset (+09:00) to ensure correct timezone comparison
      const todayStart = today + 'T00:00:00+09:00';
      const futureEnd = futureDate + 'T23:59:59+09:00';
      
      // Fetch events where:
      // 1. start_at is within range, OR
      // 2. end_at is in the future (multi-day events that started earlier)
      let query = supabase
        .from('academy_events')
        .select('*')
        .or(`and(start_at.gte.${todayStart},start_at.lte.${futureEnd}),and(end_at.gte.${todayStart},start_at.lte.${futureEnd})`)
        .order('start_at', { ascending: true });
      
      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const eventsWithDetails: AcademyEvent[] = [];
      
      for (const event of (data || [])) {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', event.created_by)
          .maybeSingle();
        
        // Fetch attachments
        const { data: attachments } = await supabase
          .from('event_attachments')
          .select('*')
          .eq('event_id', event.id);
        
        eventsWithDetails.push({
          ...event,
          creator_name: creatorProfile?.full_name || creatorProfile?.email || '알 수 없음',
          attachments: attachments || [],
        });
      }
      
      setEvents(eventsWithDetails);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast({
        title: '데이터 로드 오류',
        description: '일정을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function uploadPostersToEvent(eventId: string, files: File[]) {
    if (!user || files.length === 0) return;
    
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const storagePath = `events/${eventId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(storagePath, file);
      
      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast({ title: '포스터 업로드 실패', description: file.name, variant: 'destructive' });
        continue;
      }
      
      const { error: insertError } = await supabase
        .from('event_attachments')
        .insert({
          event_id: eventId,
          storage_path: storagePath,
          original_name: file.name,
          mime_type: file.type || null,
          file_size: file.size,
          uploaded_by: user.id,
        });
      
      if (insertError) {
        console.error('Insert error:', insertError);
      }
    }
  }

  async function handleCreateEvent() {
    if (!formData.title.trim() || !user) return;
    
    setIsSubmitting(true);
    try {
      const startAt = formData.all_day 
        ? `${formData.start_date}T00:00:00+09:00`
        : `${formData.start_date}T${formData.start_time}:00+09:00`;
      
      let endAt = null;
      if (formData.end_date) {
        endAt = formData.all_day 
          ? `${formData.end_date}T23:59:59+09:00`
          : `${formData.end_date}T${formData.end_time || formData.start_time}:00+09:00`;
      }
      
      const { data, error } = await supabase
        .from('academy_events')
        .insert({
          created_by: user.id,
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          start_at: startAt,
          end_at: endAt,
          all_day: formData.all_day,
          visibility: formData.visibility,
          location: formData.location.trim() || null,
          category: formData.category,
          is_announcement: formData.is_announcement,
          pinned: formData.pinned,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Upload poster files if any (only admin/assistant can)
      if (data && posterFiles.length > 0 && canUploadPosters) {
        await uploadPostersToEvent(data.id, posterFiles);
      }
      
      toast({
        title: '일정 생성 완료',
        description: '새 일정이 생성되었습니다.',
      });
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        start_date: getTodayKST(),
        start_time: '09:00',
        end_date: '',
        end_time: '',
        all_day: false,
        visibility: 'all',
        location: '',
        category: 'general',
        is_announcement: false,
        pinned: false,
      });
      setPosterFiles([]);
      setIsCreateOpen(false);
      fetchEvents();
    } catch (error: any) {
      console.error('Error creating event:', error);
      toast({
        title: '오류',
        description: error.message || '일정 생성에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteEvent(eventId: string) {
    try {
      await supabase
        .from('academy_events')
        .delete()
        .eq('id', eventId);
      
      toast({
        title: '삭제 완료',
      });
      
      fetchEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: '오류',
        description: '삭제에 실패했습니다.',
        variant: 'destructive',
      });
    }
  }

  async function handleDeletePoster(attachmentId: string, storagePath: string) {
    try {
      await supabase.storage.from('attachments').remove([storagePath]);
      await supabase.from('event_attachments').delete().eq('id', attachmentId);
      
      toast({ title: '포스터 삭제됨' });
      
      // Update local state
      if (editEvent) {
        setEditEvent(prev => prev ? {
          ...prev,
          attachments: (prev.attachments || []).filter(a => a.id !== attachmentId)
        } : null);
      }
      
      fetchEvents();
    } catch (err) {
      toast({ title: '삭제 오류', variant: 'destructive' });
    }
  }

  async function handleAddPostersToEvent(eventId: string, files: File[]) {
    if (files.length === 0) return;
    
    setUploadingPosters(true);
    await uploadPostersToEvent(eventId, files);
    setAdditionalPosterFiles([]);
    await fetchEvents();
    
    // Update editEvent
    const updatedEvent = events.find(e => e.id === eventId);
    if (updatedEvent) {
      const { data: attachments } = await supabase
        .from('event_attachments')
        .select('*')
        .eq('event_id', eventId);
      
      setEditEvent({ ...updatedEvent, attachments: attachments || [] });
    }
    
    setUploadingPosters(false);
    toast({ title: '포스터 추가됨' });
  }

  async function getSignedUrl(storagePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(storagePath, 60 * 5);
    
    if (error || !data) return null;
    return data.signedUrl;
  }

  async function handleDownloadPoster(attachment: EventAttachment) {
    const url = await getSignedUrl(attachment.storage_path);
    if (url) {
      window.open(url, '_blank');
    } else {
      toast({ title: '다운로드 실패', variant: 'destructive' });
    }
  }

  function getCategoryBadge(category: string) {
    const option = CATEGORY_OPTIONS.find(o => o.value === category);
    if (!option) return null;
    return (
      <Badge variant={option.variant} className="text-[10px] px-1.5 py-0 leading-4">
        {option.label}
      </Badge>
    );
  }

  function getCategoryColor(category: string) {
    return CATEGORY_OPTIONS.find(o => o.value === category)?.color || 'bg-slate-400';
  }

  function isImageType(mimeType: string | null): boolean {
    return mimeType?.startsWith('image/') || false;
  }

  // Get dates with events for calendar dots
  const eventDates = events.map(e => new Date(e.start_at));
  
  // Group events by date for better readability
  // Multi-day events appear under their start date
  const today = getTodayKST();
  const groupedEvents = events.reduce<Record<string, AcademyEvent[]>>((acc, event) => {
    const startDate = format(new Date(event.start_at), 'yyyy-MM-dd');
    // For multi-day events that started before today, also show under today
    const dateKey = startDate < today && event.end_at ? today : startDate;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {});

  // Sort dates
  const sortedDateKeys = Object.keys(groupedEvents).sort();

  // Pinned announcements (shown at top)
  const pinnedAnnouncements = events.filter(e => e.pinned || (e.is_announcement && e.category === 'notice'));
  const regularDateKeys = sortedDateKeys; // all dates shown in groups

  function renderEventRow(event: AcademyEvent, showDate: boolean = false) {
    const hasPosters = (event.attachments || []).length > 0;
    const eventDate = new Date(event.start_at);
    const isToday = format(eventDate, 'yyyy-MM-dd') === getTodayKST();
    
    return (
      <div 
        key={event.id}
        className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-accent/50 ${
          event.pinned ? 'bg-blue-500/5' : ''
        }`}
      >
        {/* Color bar */}
        <div className={`w-1 self-stretch rounded-full shrink-0 mt-0.5 ${getCategoryColor(event.category)}`} />
        
        {/* Time column */}
        <div className="w-14 shrink-0 text-center pt-0.5">
          {event.all_day ? (
            <span className="text-[11px] font-medium text-muted-foreground">종일</span>
          ) : (
            <span className="text-sm font-mono font-medium tabular-nums">
              {format(eventDate, 'HH:mm')}
            </span>
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {event.pinned && <Pin className="w-3 h-3 text-blue-500 shrink-0" />}
            <span className="font-medium text-sm leading-tight">{event.title}</span>
            {getCategoryBadge(event.category)}
            {hasPosters && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Image className="w-3 h-3" />
                {event.attachments?.length}
              </span>
            )}
          </div>
          {event.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {event.description}
            </p>
          )}
          {event.location && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
              <MapPin className="w-3 h-3" />
              {event.location}
            </span>
          )}
          
          {/* Poster thumbnails */}
          {hasPosters && (
            <div className="flex gap-1.5 mt-1.5">
              {event.attachments?.filter(a => isImageType(a.mime_type)).slice(0, 3).map(att => (
                <PosterThumbnail key={att.id} attachment={att} onClick={() => handleDownloadPoster(att)} />
              ))}
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex gap-0.5 shrink-0">
          {canUploadPosters && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditEvent(event); setEditDialogOpen(true); }}>
              <Image className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          )}
          {(isAdmin || event.created_by === user?.id) && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteEvent(event.id)}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                <span>원내 일정</span>
                {events.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{events.length}</Badge>
                )}
              </div>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={(e) => e.stopPropagation()}>
                    <Plus className="w-4 h-4 mr-1" />
                    일정 추가
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
                  <DialogHeader>
                    <DialogTitle>새 일정 추가</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto">
                    <div className="space-y-2">
                      <Label>제목 *</Label>
                      <Input
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="일정 제목..."
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>설명</Label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="일정 설명..."
                        rows={2}
                      />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={formData.all_day}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, all_day: checked }))}
                      />
                      <Label>종일</Label>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>시작 날짜 *</Label>
                        <Input
                          type="date"
                          value={formData.start_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                        />
                      </div>
                      {!formData.all_day && (
                        <div className="space-y-2">
                          <Label>시작 시간</Label>
                          <Input
                            type="time"
                            value={formData.start_time}
                            onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>종료 날짜</Label>
                        <Input
                          type="date"
                          value={formData.end_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                        />
                      </div>
                      {!formData.all_day && formData.end_date && (
                        <div className="space-y-2">
                          <Label>종료 시간</Label>
                          <Input
                            type="time"
                            value={formData.end_time}
                            onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>카테고리</Label>
                        <Select
                          value={formData.category}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>공개 범위</Label>
                        <Select
                          value={formData.visibility}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, visibility: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VISIBILITY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>장소</Label>
                      <Input
                        value={formData.location}
                        onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                        placeholder="장소..."
                      />
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={formData.is_announcement}
                          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_announcement: checked }))}
                        />
                        <Label>공지사항</Label>
                      </div>
                      
                      {isAdmin && (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={formData.pinned}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, pinned: checked }))}
                          />
                          <Label>상단 고정</Label>
                        </div>
                      )}
                    </div>
                    
                    {/* Poster upload (admin/assistant only) */}
                    {canUploadPosters && (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Image className="w-4 h-4" />
                          포스터 이미지 업로드 (선택)
                        </Label>
                        <div className="border rounded-md p-3 space-y-2">
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={e => setPosterFiles(Array.from(e.target.files || []))}
                            className="text-sm"
                          />
                          {posterFiles.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {posterFiles.map((f, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {f.name}
                                  <button onClick={() => setPosterFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-1">
                                    <X className="w-3 h-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <Button 
                      onClick={handleCreateEvent}
                      disabled={!formData.title.trim() || isSubmitting}
                      className="w-full"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      일정 생성
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* View toggle and filters */}
            <div className="flex items-center justify-between mb-4">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'calendar' | 'list')}>
                <TabsList className="grid w-[200px] grid-cols-2">
                  <TabsTrigger value="list">
                    <List className="w-4 h-4 mr-1" />
                    목록
                  </TabsTrigger>
                  <TabsTrigger value="calendar">
                    <CalendarIcon className="w-4 h-4 mr-1" />
                    달력
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : viewMode === 'calendar' ? (
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  locale={ko}
                  modifiers={{
                    hasEvent: eventDates,
                  }}
                  modifiersStyles={{
                    hasEvent: { 
                      backgroundColor: 'hsl(var(--primary) / 0.1)',
                      borderRadius: '50%',
                    },
                  }}
                />
              </div>
            ) : (
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {/* Pinned announcements at top */}
                {pinnedAnnouncements.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 mb-1.5 px-1">
                      <Bell className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs font-semibold text-blue-500 uppercase tracking-wide">공지</span>
                    </div>
                    <div className="space-y-0.5 border-l-2 border-blue-500/30 ml-1">
                      {pinnedAnnouncements.map((event) => renderEventRow(event))}
                    </div>
                  </div>
                )}
                
                {/* Date-grouped events */}
                {sortedDateKeys.map((dateKey) => {
                  const dayEvents = groupedEvents[dateKey].filter(
                    e => !pinnedAnnouncements.some(pa => pa.id === e.id)
                  );
                  if (dayEvents.length === 0) return null;
                  
                  const dateObj = new Date(dateKey + 'T00:00:00+09:00');
                  const isToday = dateKey === getTodayKST();
                  
                  return (
                    <div key={dateKey} className="mb-2">
                      <div className={`sticky top-0 z-10 flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-semibold ${
                        isToday 
                          ? 'bg-primary/10 text-primary' 
                          : 'bg-muted/60 text-muted-foreground'
                      }`}>
                        <span className="tabular-nums">{format(dateObj, 'M/d', { locale: ko })}</span>
                        <span>{format(dateObj, 'EEEE', { locale: ko })}</span>
                        {isToday && <Badge variant="default" className="text-[9px] px-1 py-0 leading-3">오늘</Badge>}
                      </div>
                      <div className="space-y-0.5 mt-0.5">
                        {dayEvents
                          .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                          .map((event) => renderEventRow(event))}
                      </div>
                    </div>
                  );
                })}
                
                {events.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">등록된 일정이 없습니다</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>

      {/* Edit Event Posters Dialog (admin/assistant only) */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="w-5 h-5" />
              포스터 관리: {editEvent?.title}
            </DialogTitle>
          </DialogHeader>
          {editEvent && canUploadPosters && (
            <div className="space-y-4 pt-2">
              {/* Existing posters */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  현재 포스터 ({(editEvent.attachments || []).length})
                </Label>
                <div className="border rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
                  {(editEvent.attachments || []).map(att => (
                    <div key={att.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                      {isImageType(att.mime_type) ? (
                        <PosterThumbnail attachment={att} onClick={() => handleDownloadPoster(att)} />
                      ) : null}
                      <span className="flex-1 text-sm truncate">{att.original_name}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadPoster(att)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeletePoster(att.id, att.storage_path)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {(editEvent.attachments || []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">포스터 없음</p>
                  )}
                </div>
              </div>
              
              {/* Add more posters */}
              <div className="space-y-2">
                <Label>포스터 추가</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={e => setAdditionalPosterFiles(Array.from(e.target.files || []))}
                    className="text-sm flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={additionalPosterFiles.length === 0 || uploadingPosters}
                    onClick={() => handleAddPostersToEvent(editEvent.id, additionalPosterFiles)}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    {uploadingPosters ? '업로드 중...' : '추가'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}

// Poster thumbnail component
function PosterThumbnail({ attachment, onClick }: { attachment: EventAttachment; onClick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  
  useEffect(() => {
    async function loadUrl() {
      const { data } = await supabase.storage
        .from('attachments')
        .createSignedUrl(attachment.storage_path, 60 * 5);
      if (data) setUrl(data.signedUrl);
    }
    loadUrl();
  }, [attachment.storage_path]);
  
  if (!url) {
    return <div className="w-12 h-12 bg-muted rounded animate-pulse" />;
  }
  
  return (
    <img
      src={url}
      alt={attachment.original_name}
      className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
      onClick={onClick}
    />
  );
}
