import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { Loader2, Wand2 } from 'lucide-react';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i),
  label: `${i + 1}월`,
}));

const DAY_MAP: Record<string, number[]> = {
  mon_wed: [1, 3], // Monday, Wednesday
  tue_thu: [2, 4], // Tuesday, Thursday
};

export function VocabScheduleGenerator() {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth()));
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);

    // Fetch all active settings
    const { data: settings, error: settErr } = await supabase
      .from('vocab_settings')
      .select('*')
      .eq('is_active', true);

    if (settErr || !settings?.length) {
      toast.error(settings?.length === 0 ? '활성화된 학생 설정이 없습니다' : settErr?.message || '오류');
      setGenerating(false);
      return;
    }

    const targetMonth = new Date(Number(year), Number(month), 1);
    const monthStart = startOfMonth(targetMonth);
    const monthEnd = endOfMonth(targetMonth);
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Check for existing schedules in this month
    const { data: existing } = await supabase
      .from('vocab_schedules')
      .select('id')
      .gte('test_date', format(monthStart, 'yyyy-MM-dd'))
      .lte('test_date', format(monthEnd, 'yyyy-MM-dd'));

    if (existing && existing.length > 0) {
      const confirm = window.confirm(
        `${Number(month) + 1}월에 이미 ${existing.length}건의 스케줄이 있습니다. 기존 스케줄을 삭제하고 새로 생성할까요?`
      );
      if (!confirm) {
        setGenerating(false);
        return;
      }
      await supabase
        .from('vocab_schedules')
        .delete()
        .gte('test_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('test_date', format(monthEnd, 'yyyy-MM-dd'))
        .eq('schedule_type', 'regular');
    }

    // Generate schedules for each student
    const inserts: any[] = [];

    for (const setting of settings) {
      const testDayKey = setting.test_days[0] || 'mon_wed';
      const allowedDays = DAY_MAP[testDayKey] || [1, 3];
      const testDates = allDays.filter(d => allowedDays.includes(getDay(d)));

      let dayNumber = setting.current_day_number;

      for (const testDate of testDates) {
        for (let i = 0; i < setting.days_per_test; i++) {
          inserts.push({
            student_id: setting.student_id,
            setting_id: setting.id,
            test_date: format(testDate, 'yyyy-MM-dd'),
            day_number: dayNumber,
            book_name: setting.book_name,
            schedule_type: 'regular',
          });
          dayNumber++;
        }
      }
    }

    if (inserts.length === 0) {
      toast.info('생성할 스케줄이 없습니다');
      setGenerating(false);
      return;
    }

    const { error } = await supabase.from('vocab_schedules').insert(inserts);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${inserts.length}건의 스케줄이 생성되었습니다`);
    }
    setGenerating(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Wand2 className="w-4 h-4" />
          월별 스케줄 자동 생성
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">년도</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={String(now.getFullYear())}>{now.getFullYear()}</SelectItem>
                <SelectItem value={String(now.getFullYear() + 1)}>{now.getFullYear() + 1}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">월</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerate} disabled={generating} size="sm">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
            생성
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          활성 학생의 시험 요일에 맞춰 해당 월 전체 스케줄을 자동 생성합니다
        </p>
      </CardContent>
    </Card>
  );
}
