import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PhotoThumbProps {
  storagePath: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  imageStyle?: React.CSSProperties;
  fit?: 'cover' | 'contain';
  onResolvedUrl?: (url: string) => void;
  signedUrl?: string | null;
}

export function PhotoThumb({
  storagePath,
  alt,
  className,
  imageClassName,
  imageStyle,
  fit = 'cover',
  onResolvedUrl,
  signedUrl,
}: PhotoThumbProps) {
  const [src, setSrc] = useState<string | null>(signedUrl ?? null);
  const [loading, setLoading] = useState(!signedUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // If signedUrl is provided by parent, use it directly — no need to re-resolve
    if (signedUrl) {
      setSrc(signedUrl);
      setLoading(false);
      setFailed(false);
      onResolvedUrl?.(signedUrl);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setSrc(null);

    void (async () => {
      try {
        const { data, error } = await supabase.storage
          .from('exam-results')
          .createSignedUrl(storagePath, 3600);

        if (cancelled) return;

        if (error || !data?.signedUrl) {
          setFailed(true);
        } else {
          setSrc(data.signedUrl);
          onResolvedUrl?.(data.signedUrl);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storagePath, onResolvedUrl, signedUrl]);

  if (loading) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-md border border-border text-center text-xs font-medium',
          className,
        )}
        style={{
          backgroundColor: 'hsl(var(--review-photo-placeholder-surface))',
          color: 'hsl(var(--review-photo-placeholder-foreground))',
        }}
      >
        로딩 중...
      </div>
    );
  }

  if (failed || !src) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-md border border-border text-center text-xs font-medium',
          className,
        )}
        style={{
          backgroundColor: 'hsl(var(--review-photo-placeholder-surface))',
          color: 'hsl(var(--review-photo-placeholder-foreground))',
        }}
      >
        사진을 불러올 수 없습니다
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      loading="lazy"
      className={cn(
        'h-full w-full rounded-md',
        fit === 'cover' ? 'object-cover' : 'object-contain',
        imageClassName,
        className,
      )}
      style={imageStyle}
    />
  );
}
