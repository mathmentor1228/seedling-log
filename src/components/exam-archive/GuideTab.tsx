import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import type { Schedule, Textbook } from './types';

interface Props {
  schoolName: string;
  schedules: Schedule[];
  textbooks: Textbook[];
  archives: any[];
}

export function GuideTab({ schoolName, schedules, textbooks, archives }: Props) {
  const [guide, setGuide] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-school-guide`,
        {
          method: 'POST',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            schoolName,
            schedules: schedules.filter(s => s.school_name === schoolName),
            textbooks: textbooks.filter(t => t.school_name === schoolName),
            archives: archives.filter(a => a.school_name === schoolName),
          }),
        }
      );

      const result = await res.json();
      if (!res.ok || result.error) {
        toast.error(result.error || '가이드 생성 실패');
        return;
      }

      setGuide(result.guide);
    } catch (err: any) {
      toast.error(err.message || '가이드 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={handleGenerate} disabled={loading} className="gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
        {loading ? '가이드 생성 중...' : '가이드 생성'}
      </Button>

      {guide ? (
        <Card>
          <CardContent className="p-4 prose prose-sm max-w-none dark:prose-invert">
            <div dangerouslySetInnerHTML={{ __html: guide.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/#{3}\s(.*?)(<br\/>|$)/g, '<h3>$1</h3>').replace(/#{2}\s(.*?)(<br\/>|$)/g, '<h2>$1</h2>').replace(/#{1}\s(.*?)(<br\/>|$)/g, '<h1>$1</h1>') }} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          "가이드 생성" 버튼을 클릭하면 AI가 해당 학교 데이터를 종합해서 수업 준비 가이드를 생성합니다.
        </p>
      )}
    </div>
  );
}
