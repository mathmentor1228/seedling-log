// STUDENT-UPLOAD-V2: submission buckets are private, so stored public-style URLs
// must be converted into short-lived signed URLs before rendering.
import { getCachedSignedUrl } from '@/lib/signedUrlCache';

const PRIVATE_BUCKETS = [
  'homework-submissions',
  'math-questions',
  'quiz-submissions',
  'vocab-submissions',
];

export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?#]+)/);
  if (!match) return null;
  return { bucket: match[1], path: decodeURIComponent(match[2]) };
}

export function isPrivateStorageUrl(url: string): boolean {
  const parsed = parseStorageUrl(url);
  return !!parsed && PRIVATE_BUCKETS.includes(parsed.bucket) && !url.includes('/object/sign/');
}

// Resolves a stored URL for an authenticated (staff) viewer.
export async function resolveStorageUrl(url: string): Promise<string> {
  if (!isPrivateStorageUrl(url)) return url;
  const parsed = parseStorageUrl(url)!;
  const signed = await getCachedSignedUrl(parsed.bucket, parsed.path, 3600);
  return signed || url;
}

export async function resolveStorageUrls(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map((u) => resolveStorageUrl(u)));
}
