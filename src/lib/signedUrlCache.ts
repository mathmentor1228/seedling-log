import { supabase } from '@/integrations/supabase/client';

type CacheEntry = {
  url: string;
  expiresAt: number;
};

const signedUrlCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<string | null>>();

export async function getCachedSignedUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!storagePath) return null;

  const key = `${bucket}:${storagePath}:${expiresInSeconds}`;
  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const inFlight = inFlightRequests.get(key);
  if (inFlight) return inFlight;

  const request = supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) return null;
      signedUrlCache.set(key, {
        url: data.signedUrl,
        expiresAt: Date.now() + Math.max(expiresInSeconds - 60, 30) * 1000,
      });
      return data.signedUrl;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, request);
  return request;
}