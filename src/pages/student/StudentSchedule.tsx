// STUDENT-APP-V1: Student class schedule page
import { useEffect, useState } from 'react';
import { useStudentAuth } from '@/lib/studentAuth';
import { studentApi } from '@/lib/studentApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock } from 'lucide-react';


interface ScheduleItem {
  class_name: string;
  subject: string;
  teacher_name: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const DAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

export default function StudentSchedule() {
  const { student } = useStudentAuth();
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (student?.id) {
      fetchSchedule();
    }
  }, [student?.id]);

  async function fetchSchedule() {
    if (!student?.id) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await studentApi.getSchedule();
      
      if (error) {
        console.error('Schedule fetch error:', error);
        return;
      }

      if (data) {
        setSchedule(data.schedule);
      }
    } catch (error) {
      console.error('Fetch schedule error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const getSubjectColor = (subject: string) => {
    switch (subject) {
      case '수학': return 'bg-blue-500/10 text-blue-600 border-blue-200';
      case '영어': return 'bg-green-500/10 text-green-600 border-green-200';
      case '국어': return 'bg-purple-500/10 text-purple-600 border-purple-200';
      case '과학': return 'bg-orange-500/10 text-orange-600 border-orange-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const today = new Date().getDay();

  // Group by day
  const scheduleByDay: Record<number, ScheduleItem[]> = {};
  for (const item of schedule) {
    if (!scheduleByDay[item.day_of_week]) {
      scheduleByDay[item.day_of_week] = [];
    }
    scheduleByDay[item.day_of_week].push(item);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Calendar className="w-6 h-6" />
        수업 일정
      </h1>

      {schedule.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>등록된 수업이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
            const daySchedule = scheduleByDay[dow];
            if (!daySchedule?.length) return null;
            
            const isToday = dow === today;
            
            return (
              <Card 
                key={dow}
                className={isToday ? 'ring-2 ring-primary' : ''}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isToday ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      {DAY_SHORT[dow]}
                    </div>
                    <span>{DAY_NAMES[dow]}</span>
                    {isToday && (
                      <Badge className="ml-auto">오늘</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {daySchedule.map((item, idx) => (
                    <div 
                      key={idx}
                      className={`p-3 rounded-lg border ${getSubjectColor(item.subject)}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{item.class_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {item.subject}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.start_time?.slice(0, 5)} - {item.end_time?.slice(0, 5)}
                        </span>
                        {item.teacher_name && (
                          <span>{item.teacher_name} 선생님</span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 수학질문방 */}
      <MathQuestionRoom />
    </div>
  );
}
