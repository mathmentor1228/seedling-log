// STUDENT-UPLOAD-V2: renders images stored in private storage buckets by
// resolving the stored URL into a signed URL for authenticated viewers.
import { useEffect, useState } from 'react';
import { resolveStorageUrl } from '@/lib/storageUrl';

interface StorageImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export function StorageImage({ src, ...rest }: StorageImageProps) {
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
    return <div className={rest.className} aria-hidden="true" />;
  }

  return <img {...rest} src={resolved} />;
}

export default StorageImage;
