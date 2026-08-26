// STUDENT-UPLOAD-V2: plays audio stored in private storage buckets via signed URLs.
import { useEffect, useState } from 'react';
import { resolveStorageUrl } from '@/lib/storageUrl';

interface StorageAudioProps {
  src: string;
  className?: string;
}

export function StorageAudio({ src, className }: StorageAudioProps) {
  const [resolved, setResolved] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    resolveStorageUrl(src).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!resolved) {
    return <p className="text-xs text-muted-foreground">음성을 불러오는 중...</p>;
  }

  return (
    <audio controls className={className} src={resolved}>
      브라우저에서 오디오를 지원하지 않습니다.
    </audio>
  );
}

export default StorageAudio;
