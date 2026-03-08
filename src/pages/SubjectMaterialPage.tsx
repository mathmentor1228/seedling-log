import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotionBlockRenderer } from '@/components/NotionBlockRenderer';

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

function extractPageId(url: string) {
  const clean = url.split('?')[0].replace(/\/$/, '');
  const lastSegment = clean.substring(clean.lastIndexOf('/') + 1);
  const tail = lastSegment.substring(lastSegment.lastIndexOf('-') + 1);
  return tail.replace(/-/g, '');
}

export default function SubjectMaterialPage() {
  const { subject } = useParams<{ subject: string }>();
  const config = subject ? SUBJECT_CONFIG[subject] : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<any[]>([]);

  const pageId = useMemo(() => (config ? extractPageId(config.notionUrl) : ''), [config]);

  const loadPage = async () => {
    if (!config || !pageId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('notion-proxy', {
        body: { pageId },
      });

      if (fnError) throw fnError;
      setBlocks(Array.isArray(data?.blocks) ? data.blocks : []);
    } catch (e) {
      console.error(e);
      setError('노션 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, [pageId]);

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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">{config.label} 자료실</h1>
            <Button variant="outline" size="sm" onClick={loadPage} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              새로고침
            </Button>
          </div>

          <div className="relative w-full rounded-lg border border-border overflow-auto bg-card p-6" style={{ minHeight: '600px' }}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {error && !loading && (
              <div className="flex flex-col items-center justify-center gap-3 min-h-[300px]">
                <p className="text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={loadPage}>다시 시도</Button>
              </div>
            )}

            {!loading && !error && <NotionBlockRenderer blocks={blocks} />}
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
