import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SUBJECT_CONFIG: Record<string, { label: string; notionUrl: string; emoji: string }> = {
  math: {
    label: '수학',
    emoji: '📐',
    notionUrl: 'https://mentorms.notion.site/Storage_-31d4390663e5802d9c86d77c6c6fcb43',
  },
  english: {
    label: '영어',
    emoji: '📖',
    notionUrl: 'https://mentorms.notion.site/Storage_-31d4390663e5801c859edadffa651d1c',
  },
  korean: {
    label: '국어',
    emoji: '📝',
    notionUrl: 'https://mentorms.notion.site/Storage_-31d4390663e58011b6eac1cb71514cfa',
  },
  science: {
    label: '과학',
    emoji: '🔬',
    notionUrl: 'https://mentorms.notion.site/Storage_-31d4390663e58096a1cecffc651a5a67',
  },
};

export default function SubjectMaterialPage() {
  const { subject } = useParams<{ subject: string }>();
  const config = subject ? SUBJECT_CONFIG[subject] : null;

  if (!config) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-muted-foreground">존재하지 않는 과목입니다.</p>
          </div>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
          <div className="text-center space-y-6 max-w-md">
            <div className="text-6xl">{config.emoji}</div>
            <h1 className="text-2xl font-bold text-foreground">{config.label} 자료실</h1>
            <p className="text-muted-foreground">
              노션에서 {config.label} 수업 자료를 확인하세요.
            </p>
            <Button asChild size="lg" className="gap-2">
              <a href={config.notionUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
                노션에서 열기
              </a>
            </Button>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
