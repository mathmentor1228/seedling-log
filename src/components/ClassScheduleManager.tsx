import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Loader2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const DAYS_OF_WEEK = [
  { value: 0, label: '일요일' },
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
];

export interface Schedule {
  id: string;
  class_id?: string;
  teacher_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

interface ClassScheduleManagerProps {
  classId: string;
  teacherId: string | null;
  onSchedulesChange?: () => void;
}

export function ClassScheduleManager({ classId, teacherId, onSchedulesChange }: ClassScheduleManagerProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    day_of_week: '',
    start_time: '',
    end_time: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchSchedules();
  }, [classId]);

  async function fetchSchedules() {
    try {
      const { data, error } = await supabase
        .from('class_schedules')
        .select('*')
        .eq('class_id', classId)
        .eq('is_active', true)
        .order('day_of_week')
        .order('start_time');

      if (error) throw error;
      setSchedules(data || []);
    } catch (error: any) {
      console.error('Error fetching schedules:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!teacherId) {
      toast({
        title: '오류',
        description: '담당 선생님이 지정되어야 일정을 추가할 수 있습니다',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.day_of_week || !formData.start_time || !formData.end_time) {
      toast({
        title: '유효성 오류',
        description: '요일, 시작 시간, 종료 시간은 필수입니다',
        variant: 'destructive',
      });
      return;
    }

    if (formData.start_time >= formData.end_time) {
      toast({
        title: '유효성 오류',
        description: '종료 시간은 시작 시간보다 늦어야 합니다',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('class_schedules')
        .insert({
          class_id: classId,
          teacher_id: teacherId,
          day_of_week: parseInt(formData.day_of_week),
          start_time: formData.start_time,
          end_time: formData.end_time,
        });

      if (error) {
        // Check for unique constraint violation
        if (error.code === '23505' || error.message?.includes('unique_teacher_slot')) {
          toast({
            title: '일정 중복',
            description: '해당 요일/시간에는 이미 슬롯이 있습니다. (같은 선생님 기준)',
            variant: 'destructive',
          });
          return;
        }
        throw error;
      }

      toast({
        title: '성공',
        description: '일정이 추가되었습니다',
      });

      setIsDialogOpen(false);
      setFormData({ day_of_week: '', start_time: '', end_time: '' });
      fetchSchedules();
      onSchedulesChange?.();
    } catch (error: any) {
      console.error('Error adding schedule:', error);
      toast({
        title: '오류',
        description: error.message || '일정 추가에 실패했습니다',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('class_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;

      toast({
        title: '성공',
        description: '일정이 삭제되었습니다',
      });

      fetchSchedules();
      onSchedulesChange?.();
    } catch (error: any) {
      console.error('Error deleting schedule:', error);
      toast({
        title: '오류',
        description: error.message || '일정 삭제에 실패했습니다',
        variant: 'destructive',
      });
    }
  };

  const formatTimeRange = (startTime: string, endTime: string) => {
    const formatTime = (time: string) => time.slice(0, 5); // HH:MM
    return `${formatTime(startTime)}–${formatTime(endTime)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">수업 일정</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          disabled={!teacherId}
        >
          <Plus className="w-3 h-3 mr-1" />
          일정 추가
        </Button>
      </div>

      {!teacherId && (
        <p className="text-xs text-muted-foreground">담당 선생님을 먼저 지정해주세요</p>
      )}

      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">등록된 일정이 없습니다</p>
      ) : (
        <div className="space-y-2">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="flex items-center justify-between p-2 bg-secondary/50 rounded-md"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <Badge variant="outline">
                  {DAYS_OF_WEEK.find((d) => d.value === schedule.day_of_week)?.label}
                </Badge>
                <span className="text-sm font-medium">
                  {formatTimeRange(schedule.start_time, schedule.end_time)}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => handleDelete(schedule.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>일정 추가</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>요일 *</Label>
              <Select
                value={formData.day_of_week}
                onValueChange={(value) => setFormData({ ...formData, day_of_week: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="요일 선택" />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day.value} value={day.value.toString()}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>시작 시간 *</Label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>종료 시간 *</Label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                추가
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper to format schedules as display string
export function formatScheduleDisplay(schedules: Schedule[]): string {
  if (!schedules || schedules.length === 0) return '-';
  
  const grouped = schedules.reduce((acc, s) => {
    const dayLabel = DAYS_OF_WEEK.find((d) => d.value === s.day_of_week)?.label?.charAt(0) || '';
    const timeRange = `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
    const key = `${dayLabel} ${timeRange}`;
    if (!acc.includes(key)) acc.push(key);
    return acc;
  }, [] as string[]);

  return grouped.join(', ');
}
