import { useEffect, useState } from 'react';
import { useAuth, isAdmin as checkIsAdmin } from '@/lib/auth';
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
  Trash2
} from 'lucide-react';
import { format, addDays, startOfMonth, endOfMonth, isSameDay, isWithinInterval } from 'date-fns';
import { ko } from 'date-fns/locale';

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
}

const CATEGORY_OPTIONS = [
  { value: 'general', label: '일반', variant: 'secondary' as const },
  { value: 'notice', label: '공지', variant: 'default' as const },
  { value: 'exam', label: '시험', variant: 'destructive' as const },
  { value: 'meeting', label: '회의', variant: 'outline' as const },
  { value: 'holiday', label: '휴강', variant: 'warning' as const },
  { value: 'event', label: '행사', variant: 'success' as const },
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchEvents();
    }
  }, [user, filterCategory]);

  async function fetchEvents() {
    try {
      setLoading(true);
      
      let query = supabase
        .from('academy_events')
        .select('*')
        .order('start_at', { ascending: true });
      
      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }
      
      // Filter by date range (next 30 days for list view)
      const today = getTodayKST();
      const futureDate = format(addDays(getKSTDateObject(), 30), 'yyyy-MM-dd');
      query = query.gte('start_at', today + 'T00:00:00');
      query = query.lte('start_at', futureDate + 'T23:59:59');
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Fetch creator names
      const eventsWithDetails: AcademyEvent[] = [];
      
      for (const event of (data || [])) {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', event.created_by)
          .maybeSingle();
        
        eventsWithDetails.push({
          ...event,
          creator_name: creatorProfile?.full_name || creatorProfile?.email || '알 수 없음',
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

  async function handleCreateEvent() {
    if (!formData.title.trim() || !user) return;
    
    setIsSubmitting(true);
    try {
      const startAt = formData.all_day 
        ? `${formData.start_date}T00:00:00`
        : `${formData.start_date}T${formData.start_time}:00`;
      
      let endAt = null;
      if (formData.end_date) {
        endAt = formData.all_day 
          ? `${formData.end_date}T23:59:59`
          : `${formData.end_date}T${formData.end_time || formData.start_time}:00`;
      }
      
      const { error } = await supabase
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
        });
      
      if (error) throw error;
      
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

  function getCategoryBadge(category: string) {
    const option = CATEGORY_OPTIONS.find(o => o.value === category);
    if (!option) return null;
    return (
      <Badge variant={option.variant}>
        {option.label}
      </Badge>
    );
  }

  // Get dates with events for calendar dots
  const eventDates = events.map(e => new Date(e.start_at));
  
  // Filter events for list view
  const announcements = events.filter(e => e.is_announcement || e.category === 'notice');
  const upcomingEvents = events.filter(e => !e.is_announcement && e.category !== 'notice');
  
  // Sort: pinned first, then by date
  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
  });

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
                {upcomingEvents.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{upcomingEvents.length}</Badge>
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
                  <div className="space-y-4 mt-4">
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
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {/* Announcements */}
                {sortedAnnouncements.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      공지사항
                    </h4>
                    {sortedAnnouncements.map((event) => (
                      <div 
                        key={event.id}
                        className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {event.pinned && <Pin className="w-4 h-4 text-blue-500" />}
                              <span className="font-medium">{event.title}</span>
                              {getCategoryBadge(event.category)}
                            </div>
                            {event.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {event.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span>{format(new Date(event.start_at), 'M/d (EEE)', { locale: ko })}</span>
                              {event.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {event.location}
                                </span>
                              )}
                            </div>
                          </div>
                          {(isAdmin || event.created_by === user?.id) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteEvent(event.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Upcoming Events */}
                {upcomingEvents.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">다가오는 일정</h4>
                    {upcomingEvents.map((event) => (
                      <div 
                        key={event.id}
                        className="p-3 rounded-lg bg-secondary/50 border"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{event.title}</span>
                              {getCategoryBadge(event.category)}
                            </div>
                            {event.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {event.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span>
                                {format(new Date(event.start_at), event.all_day ? 'M/d (EEE)' : 'M/d (EEE) HH:mm', { locale: ko })}
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {event.location}
                                </span>
                              )}
                            </div>
                          </div>
                          {(isAdmin || event.created_by === user?.id) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteEvent(event.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {events.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>일정이 없습니다</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
