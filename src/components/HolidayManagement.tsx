import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { format, subDays, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn, getTodayKST, getKSTDateObject } from '@/lib/utils';

interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  scope: 'all' | 'teacher';
  teacher_id: string | null;
  teacher_name?: string;
  created_at: string;
}

interface Teacher {
  id: string;
  full_name: string;
}

export default function HolidayManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Form state
  const [holidayDate, setHolidayDate] = useState<Date>(getKSTDateObject());
  const [holidayName, setHolidayName] = useState('');
  const [scope, setScope] = useState<'all' | 'teacher'>('all');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Data state
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHolidays();
    fetchTeachers();
  }, []);

  async function fetchHolidays() {
    try {
      // Fetch holidays from last 30 days to next 90 days
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const ninetyDaysLater = format(addDays(new Date(), 90), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .gte('holiday_date', thirtyDaysAgo)
        .lte('holiday_date', ninetyDaysLater)
        .order('holiday_date', { ascending: true });
      
      if (error) throw error;
      
      // Fetch teacher names for teacher-scoped holidays
      const teacherIds = [...new Set((data || [])
        .filter(h => h.scope === 'teacher' && h.teacher_id)
        .map(h => h.teacher_id)
      )];
      
      let teacherNameMap: Record<string, string> = {};
      if (teacherIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', teacherIds);
        
        (profiles || []).forEach(p => {
          teacherNameMap[p.id] = p.full_name;
        });
      }
      
      setHolidays((data || []).map(h => ({
        ...h,
        scope: h.scope as 'all' | 'teacher',
        teacher_name: h.teacher_id ? teacherNameMap[h.teacher_id] : undefined,
      })));
    } catch (error) {
      console.error('Error fetching holidays:', error);
      toast({
        title: '데이터 로드 오류',
        description: '휴강일 목록을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchTeachers() {
    try {
      // Fetch users who have teacher role
      const { data: teacherRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'teacher');
      
      if (rolesError) throw rolesError;
      
      const teacherUserIds = (teacherRoles || []).map(r => r.user_id);
      
      if (teacherUserIds.length === 0) {
        setTeachers([]);
        return;
      }
      
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherUserIds);
      
      if (profilesError) throw profilesError;
      
      setTeachers((profiles || []).map(p => ({
        id: p.id,
        full_name: p.full_name,
      })));
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  }

  async function handleAddHoliday() {
    if (!holidayName.trim()) {
      toast({
        title: '입력 오류',
        description: '휴강일 명칭을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }
    
    if (scope === 'teacher' && !selectedTeacherId) {
      toast({
        title: '입력 오류',
        description: '선생님을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('holidays')
        .insert({
          holiday_date: format(holidayDate, 'yyyy-MM-dd'),
          name: holidayName.trim(),
          scope: scope,
          teacher_id: scope === 'teacher' ? selectedTeacherId : null,
          created_by: user?.id,
        });
      
      if (error) {
        if (error.code === '23505') {
          toast({
            title: '중복 오류',
            description: '해당 날짜에 동일한 휴강일이 이미 등록되어 있습니다.',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
        return;
      }
      
      toast({
        title: '휴강일 추가 완료',
        description: `${format(holidayDate, 'M월 d일')} ${holidayName} 휴강일이 등록되었습니다.`,
      });
      
      // Reset form
      setHolidayName('');
      setScope('all');
      setSelectedTeacherId('');
      
      // Refresh list
      await fetchHolidays();
    } catch (error) {
      console.error('Error adding holiday:', error);
      toast({
        title: '등록 오류',
        description: '휴강일 등록 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteHoliday(holidayId: string) {
    try {
      const { error } = await supabase
        .from('holidays')
        .delete()
        .eq('id', holidayId);
      
      if (error) throw error;
      
      toast({
        title: '휴강일 삭제 완료',
        description: '휴강일이 삭제되었습니다.',
      });
      
      await fetchHolidays();
    } catch (error) {
      console.error('Error deleting holiday:', error);
      toast({
        title: '삭제 오류',
        description: '휴강일 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  }

  const today = getTodayKST();

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700">
          <CalendarIcon className="w-5 h-5" />
          휴강일 관리
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add Form */}
        <div className="p-4 rounded-lg bg-background border space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date Picker */}
            <div className="space-y-2">
              <Label>날짜</Label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !holidayDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {holidayDate ? format(holidayDate, 'yyyy년 M월 d일', { locale: ko }) : '날짜 선택'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={holidayDate}
                    onSelect={(date) => {
                      if (date) {
                        setHolidayDate(date);
                        setIsCalendarOpen(false);
                      }
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Name Input */}
            <div className="space-y-2">
              <Label>명칭</Label>
              <Input
                placeholder="설날 / 대체공휴일 / 학원휴강"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
              />
            </div>
            
            {/* Scope Selector */}
            <div className="space-y-2">
              <Label>범위</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as 'all' | 'teacher')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 휴강</SelectItem>
                  <SelectItem value="teacher">선생님 휴강</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Teacher Selector (only when scope=teacher) */}
            {scope === 'teacher' ? (
              <div className="space-y-2">
                <Label>선생님</Label>
                <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                  <SelectTrigger>
                    <SelectValue placeholder="선생님 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-end">
                <Button
                  onClick={handleAddHoliday}
                  disabled={isSubmitting || !holidayName.trim()}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  추가
                </Button>
              </div>
            )}
          </div>
          
          {/* Add button when scope=teacher (moved to new row) */}
          {scope === 'teacher' && (
            <Button
              onClick={handleAddHoliday}
              disabled={isSubmitting || !holidayName.trim() || !selectedTeacherId}
              className="w-full md:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              추가
            </Button>
          )}
        </div>
        
        {/* Holidays List */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">
            등록된 휴강일 (최근 30일 ~ 향후 90일)
          </h4>
          
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">불러오는 중...</div>
          ) : holidays.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">등록된 휴강일이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {holidays.map((holiday) => {
                const isToday = holiday.holiday_date === today;
                const isPast = holiday.holiday_date < today;
                
                return (
                  <div
                    key={holiday.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border bg-background",
                      isToday && "border-amber-500/50 bg-amber-500/5",
                      isPast && "opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className={cn(
                          "font-medium",
                          isToday && "text-amber-700"
                        )}>
                          {format(new Date(holiday.holiday_date), 'M월 d일 (E)', { locale: ko })}
                          {isToday && <span className="ml-2 text-xs text-amber-600">(오늘)</span>}
                        </span>
                        <span className="text-sm text-muted-foreground">{holiday.name}</span>
                      </div>
                      <Badge variant={holiday.scope === 'all' ? 'default' : 'secondary'}>
                        {holiday.scope === 'all' ? '전체' : holiday.teacher_name || '선생님'}
                      </Badge>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteHoliday(holiday.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
