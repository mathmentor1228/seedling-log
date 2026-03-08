import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const SUBJECT_CONFIG: Record<string, { label: string; notionUrl: string }> = {
  math: {
    label: '수학',
    notionUrl: 'https://mentorms.notion.site/Storage_-31d4390663e5802d9c86d77c6c6fcb43',
  },
  english: {
    label: '영어',
    notionUrl: 'https://mentorms.notion.site/Storage_-31d4390663e5801c859edadffa651d1c',
  },
  korean: {
    label: '국어',
    notionUrl: 'https://mentorms.notion.site/Storage_-31d4390663e58011b6eac1cb71514cfa',
  },
  science: {
    label: '과학',
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
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-foreground">{config.label} 자료실</h1>
          <div className="w-full rounded-lg border border-border overflow-hidden bg-card" style={{ height: 'calc(100vh - 160px)', minHeight: '600px' }}>
            <iframe
              src={config.notionUrl}
              className="w-full h-full border-0"
              title={`${config.label} 자료실`}
              allowFullScreen
            />
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
