import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PhotoThumbProps {
  storagePath: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  fit?: 'cover' | 'contain';
}

function getPublicImageUrl(storagePath: string) {
  return supabase.storage.from('exam-results').getPublicUrl(storagePath).data.publicUrl;
}

async function getSignedImageUrl(storagePath: string) {
  const { data } = await supabase.storage.from('exam-results').createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? '';
}

export function PhotoThumb({
  storagePath,
  alt,
  className,
  imageClassName,
  fit = 'cover',
}: PhotoThumbProps) {
  const publicUrl = useMemo(() => getPublicImageUrl(storagePath), [storagePath]);
  const [src, setSrc] = useState(publicUrl);
  const [failed, setFailed] = useState(false);
  const triedSignedUrl = useRef(false);

  useEffect(() => {
    triedSignedUrl.current = false;
    setFailed(false);
    setSrc(publicUrl);
  }, [publicUrl]);

  const handleError = async () => {
    if (triedSignedUrl.current) {
      setFailed(true);
      setSrc('');
      return;
    }

    triedSignedUrl.current = true;
    const signedUrl = await getSignedImageUrl(storagePath);
    if (signedUrl) {
      setSrc(signedUrl);
      return;
    }

    setFailed(true);
    setSrc('');
  };

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
      onError={() => void handleError()}
      loading="lazy"
      className={cn(
        'h-full w-full rounded-md',
        fit === 'cover' ? 'object-cover' : 'object-contain',
        imageClassName,
        className,
      )}
    />
  );
}