import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;

    const loadNotionPage = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke('notion-proxy', {
          body: { url: config.notionUrl },
        });

        if (fnError) throw fnError;

        // data is the HTML string
        const htmlContent = typeof data === 'string' ? data : '';
        
        if (iframeRef.current) {
          const doc = iframeRef.current.contentDocument;
          if (doc) {
            doc.open();
            doc.write(htmlContent);
            doc.close();
            
            // Make all links open in new tab
            const links = doc.querySelectorAll('a');
            links.forEach(link => {
              link.setAttribute('target', '_blank');
              link.setAttribute('rel', 'noopener noreferrer');
            });
          }
        }
      } catch (err: any) {
        console.error('Failed to load Notion page:', err);
        setError('페이지를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadNotionPage();
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

  const handleReload = () => {
    setLoading(true);
    setError(null);
    const loadNotionPage = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('notion-proxy', {
          body: { url: config.notionUrl },
        });
        if (fnError) throw fnError;
        const htmlContent = typeof data === 'string' ? data : '';
        if (iframeRef.current) {
          const doc = iframeRef.current.contentDocument;
          if (doc) {
            doc.open();
            doc.write(htmlContent);
            doc.close();
          }
        }
      } catch (err) {
        setError('페이지를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };
    loadNotionPage();
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">{config.label} 자료실</h1>
            <Button variant="outline" size="sm" onClick={handleReload} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              새로고침
            </Button>
          </div>

          <div
            className="relative w-full rounded-lg border border-border overflow-hidden bg-card"
            style={{ height: 'calc(100vh - 160px)', minHeight: '600px' }}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background z-10">
                <p className="text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={handleReload}>
                  다시 시도
                </Button>
              </div>
            )}
            <iframe
              ref={iframeRef}
              className="w-full h-full border-0"
              title={`${config.label} 자료실`}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
