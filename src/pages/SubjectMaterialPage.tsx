import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotionBlockRenderer } from '@/components/NotionBlockRenderer';

// Extract page ID from Notion URLs (remove dashes, take last 32 chars)
function extractPageId(url: string): string {
  const match = url.match(/([a-f0-9]{32})$/);
  if (match) return match[1];
  // Try with dashes
  const match2 = url.match(/([a-f0-9-]{36})$/);
  if (match2) return match2[1].replace(/-/g, '');
  // Fallback: take last segment after last dash
  const parts = url.split('-');
  return parts[parts.length - 1];
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [pageTitle, setPageTitle] = useState('');

  const loadPage = async () => {
    if (!config) return;
    setLoading(true);
    setError(null);
    try {
      const pageId = extractPageId(config.notionUrl);
      const { data, error: fnError } = await supabase.functions.invoke('notion-proxy', {
        body: { pageId },
      });

      if (fnError) throw fnError;
      
      setBlocks(data?.blocks || []);
      setPageTitle(data?.pageTitle || '');
    } catch (err: any) {
      console.error('Failed to load Notion page:', err);
      setError('페이지를 불러오는데 실패했습니다. 노션 연결 상태를 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, [config?.notionUrl]);

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

          <div className="relative w-full rounded-lg border border-border overflow-hidden bg-card p-6" style={{ minHeight: '600px' }}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background z-10">
                <p className="text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={loadPage}>
                  다시 시도
                </Button>
              </div>
            )}
            {!loading && !error && (
              <NotionBlockRenderer blocks={blocks} />
            )}
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
