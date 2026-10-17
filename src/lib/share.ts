// SHARE-CHANNEL-V1: 자료·전달 채널 순수 도우미 (DB·UI 의존 없음 → share.test.ts 로 검증)

export interface SharePost {
  id: string;
  created_by: string;
  title: string;
  body: string | null;
  tags: string[];
  links: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface SharePostFile {
  id: string;
  post_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface SharePostComment {
  id: string;
  post_id: string;
  created_by: string;
  body: string;
  created_at: string;
}

export interface SharePostRead {
  post_id: string;
  user_id: string;
  read_at: string;
}

export const SHARE_BUCKET = 'share-files';
/** 버킷 file_size_limit(50MB)과 같아야 한다. 더 큰 파일은 드라이브 링크로. */
export const SHARE_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const SHARE_TAG_MAX_LEN = 20;
/** 새 글 작성창에 항상 보이는 추천 태그. 실제 쓰인 태그가 뒤에 이어 붙는다. */
export const SHARE_PRESET_TAGS = ['공지', '수학', '영어', '국어', '과학', '프린트', '프로그램', '시험', '학부모'];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
  return `${(mb / 1024).toFixed(1)}GB`;
}

// ---- 태그 -----------------------------------------------------------------

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, SHARE_TAG_MAX_LEN);
}

/** 대소문자만 다른 중복은 넣지 않는다. */
export function addTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  if (!tag) return tags;
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

/** 쉼표·줄바꿈으로 여러 태그를 한 번에. 태그 안의 띄어쓰기("중3 수학")는 유지. */
export function parseTagInput(raw: string): string[] {
  return raw.split(/[,\n]/).map(normalizeTag).filter(Boolean);
}

export function tagCounts(posts: Pick<SharePost, 'tags'>[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ko'));
}

// ---- 링크 -----------------------------------------------------------------

/** 스킴 없는 "drive.google.com/..." 도 https 로 보정. http(s) 외는 거부. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function linkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'drive.google.com') return '구글 드라이브';
    if (host === 'docs.google.com') return '구글 문서';
    if (host === '1drv.ms' || host === 'onedrive.live.com' || host.endsWith('sharepoint.com')) return 'OneDrive';
    if (host === 'youtu.be' || host.endsWith('youtube.com')) return '유튜브';
    if (host === 'notion.so' || host.endsWith('.notion.so') || host.endsWith('notion.site')) return '노션';
    return host;
  } catch {
    return url;
  }
}

// ---- 파일 종류 ------------------------------------------------------------

export type FileKind =
  | 'pdf' | 'image' | 'archive' | 'doc' | 'sheet' | 'slide' | 'hwp' | 'video' | 'audio' | 'code' | 'other';

const EXT_KIND: Record<string, FileKind> = {
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', heic: 'image', svg: 'image',
  zip: 'archive', '7z': 'archive', rar: 'archive', tar: 'archive', gz: 'archive', tgz: 'archive',
  hwp: 'hwp', hwpx: 'hwp',
  doc: 'doc', docx: 'doc', rtf: 'doc', txt: 'doc', md: 'doc',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet',
  ppt: 'slide', pptx: 'slide', key: 'slide',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
  mp3: 'audio', m4a: 'audio', wav: 'audio', aac: 'audio',
  py: 'code', js: 'code', ts: 'code', json: 'code', html: 'code', css: 'code', sh: 'code', ipynb: 'code',
  exe: 'code', dmg: 'code', pkg: 'code', msi: 'code',
};

export function fileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export function fileKind(name: string, mime?: string | null): FileKind {
  const byExt = EXT_KIND[fileExt(name)];
  if (byExt) return byExt;
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.includes('zip') || m.includes('compressed')) return 'archive';
  return 'other';
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF', image: '이미지', archive: '압축', doc: '문서', sheet: '표', slide: '슬라이드',
  hwp: '한글', video: '영상', audio: '음성', code: '프로그램', other: '파일',
};

/** 브라우저에서 바로 열어도 되는 종류. 나머지는 원본 이름으로 내려받는다. */
export function isInlineViewable(kind: FileKind): boolean {
  return kind === 'pdf' || kind === 'image';
}

/** 저장소 키는 한글·공백을 피해 난수로. 원본 이름은 DB(original_name)에 남긴다. */
export function storagePathFor(userId: string, postId: string, originalName: string, now = Date.now()): string {
  const ext = fileExt(originalName).replace(/[^a-z0-9]/g, '');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${userId}/${postId}/${now}-${rand}${ext ? `.${ext}` : ''}`;
}

// ---- 목록 -----------------------------------------------------------------

/** 고정 글이 위, 그다음 최신순. */
export function sortPosts<T extends Pick<SharePost, 'pinned' | 'created_at'>>(posts: T[]): T[] {
  return [...posts].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at),
  );
}

/** 내가 쓴 글은 읽지 않음으로 치지 않는다. */
export function isUnread(
  post: Pick<SharePost, 'id' | 'created_by'>,
  readIds: ReadonlySet<string>,
  me: string | null | undefined,
): boolean {
  if (!me || post.created_by === me) return false;
  return !readIds.has(post.id);
}

export function countUnread(
  posts: Pick<SharePost, 'id' | 'created_by'>[],
  readIds: ReadonlySet<string>,
  me: string | null | undefined,
): number {
  return posts.filter((p) => isUnread(p, readIds, me)).length;
}

export function matchesQuery(
  post: Pick<SharePost, 'title' | 'body' | 'tags' | 'links'>,
  files: Pick<SharePostFile, 'original_name'>[],
  authorName: string,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    post.title,
    post.body ?? '',
    ...(post.tags ?? []),
    ...(post.links ?? []),
    authorName,
    ...files.map((f) => f.original_name),
  ].join('\n').toLowerCase();
  return haystack.includes(needle);
}

export interface PostFilter {
  query: string;
  tag: string | null;
  unreadOnly: boolean;
}

export function filterPosts(
  posts: SharePost[],
  filesByPost: ReadonlyMap<string, SharePostFile[]>,
  names: Readonly<Record<string, string>>,
  readIds: ReadonlySet<string>,
  me: string | null | undefined,
  filter: PostFilter,
): SharePost[] {
  return sortPosts(posts).filter((post) => {
    if (filter.tag && !(post.tags ?? []).includes(filter.tag)) return false;
    if (filter.unreadOnly && !isUnread(post, readIds, me)) return false;
    return matchesQuery(post, filesByPost.get(post.id) ?? [], names[post.created_by] ?? '', filter.query);
  });
}
