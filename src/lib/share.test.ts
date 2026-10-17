import { describe, expect, it } from 'vitest';
import {
  addTag, countUnread, fileKind, filterPosts, formatBytes, isInlineViewable, isUnread, linkLabel,
  matchesQuery, normalizeTag, normalizeUrl, parseTagInput, sortPosts, storagePathFor, tagCounts,
  type SharePost, type SharePostFile,
} from './share';

const post = (over: Partial<SharePost> = {}): SharePost => ({
  id: 'p1', created_by: 'u1', title: '중3 수학 프린트', body: null, tags: [], links: [], pinned: false,
  created_at: '2026-10-17T09:00:00Z', updated_at: '2026-10-17T09:00:00Z', ...over,
});

describe('formatBytes', () => {
  it('단위를 고른다', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(900)).toBe('900B');
    expect(formatBytes(1536)).toBe('1.5KB');
    expect(formatBytes(120 * 1024)).toBe('120KB');
    expect(formatBytes(3.2 * 1024 * 1024)).toBe('3.2MB');
    expect(formatBytes(52428800)).toBe('50MB');
  });
  it('값이 없으면 빈 문자열', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes(-1)).toBe('');
  });
});

describe('태그', () => {
  it('# 과 공백을 정리하고 길이를 자른다', () => {
    expect(normalizeTag('  #중3   수학 ')).toBe('중3 수학');
    expect(normalizeTag('가'.repeat(30))).toHaveLength(20);
  });
  it('대소문자만 다른 중복은 넣지 않는다', () => {
    expect(addTag(['PDF'], 'pdf')).toEqual(['PDF']);
    expect(addTag(['PDF'], '공지')).toEqual(['PDF', '공지']);
    expect(addTag(['PDF'], '   ')).toEqual(['PDF']);
  });
  it('쉼표·줄바꿈으로 나누고 띄어쓰기는 유지한다', () => {
    expect(parseTagInput('공지, 중3 수학\n#영어,,')).toEqual(['공지', '중3 수학', '영어']);
  });
  it('태그 사용 횟수를 많은 순으로 센다', () => {
    const counts = tagCounts([
      { tags: ['수학', '프린트'] }, { tags: ['수학'] }, { tags: ['공지'] },
    ]);
    expect(counts[0]).toEqual({ tag: '수학', count: 2 });
    expect(counts.map((c) => c.tag)).toEqual(['수학', '공지', '프린트']);
  });
});

describe('링크', () => {
  it('스킴이 없으면 https 를 붙이고 이상한 값은 거부한다', () => {
    expect(normalizeUrl('drive.google.com/drive/folders/abc')).toBe('https://drive.google.com/drive/folders/abc');
    expect(normalizeUrl('  https://example.com/x?y=1 ')).toBe('https://example.com/x?y=1');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('그냥글자')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
  });
  it('자주 쓰는 서비스는 한글 이름으로', () => {
    expect(linkLabel('https://drive.google.com/file/d/1')).toBe('구글 드라이브');
    expect(linkLabel('https://docs.google.com/spreadsheets/d/1')).toBe('구글 문서');
    expect(linkLabel('https://1drv.ms/x')).toBe('OneDrive');
    expect(linkLabel('https://www.example.co.kr/a')).toBe('example.co.kr');
    expect(linkLabel('nonsense')).toBe('nonsense');
  });
});

describe('파일 종류', () => {
  it('확장자 우선, 없으면 mime', () => {
    expect(fileKind('오답클릭_업데이트.zip')).toBe('archive');
    expect(fileKind('수학 프린트.PDF')).toBe('pdf');
    expect(fileKind('문서.hwpx')).toBe('hwp');
    expect(fileKind('noext', 'image/png')).toBe('image');
    expect(fileKind('노트', null)).toBe('other');
    expect(fileKind('update.py')).toBe('code');
  });
  it('PDF·이미지만 바로 연다', () => {
    expect(isInlineViewable('pdf')).toBe(true);
    expect(isInlineViewable('archive')).toBe(false);
  });
  it('저장소 경로는 <uid>/<post>/<난수>.<ext>', () => {
    const path = storagePathFor('u1', 'p1', '오답 클릭 v2.ZIP', 1700000000000);
    expect(path).toMatch(/^u1\/p1\/1700000000000-[a-z0-9]{6}\.zip$/);
    expect(storagePathFor('u1', 'p1', 'README', 1)).toMatch(/^u1\/p1\/1-[a-z0-9]{6}$/);
  });
});

describe('목록', () => {
  const older = post({ id: 'a', created_at: '2026-10-01T00:00:00Z' });
  const newer = post({ id: 'b', created_at: '2026-10-10T00:00:00Z' });
  const pinnedOld = post({ id: 'c', created_at: '2026-09-01T00:00:00Z', pinned: true });

  it('고정이 위, 그다음 최신순', () => {
    expect(sortPosts([older, newer, pinnedOld]).map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('내 글과 읽은 글은 읽지 않음이 아니다', () => {
    const mine = post({ id: 'm', created_by: 'me' });
    const read = new Set(['a']);
    expect(isUnread(mine, read, 'me')).toBe(false);
    expect(isUnread(older, read, 'me')).toBe(false);
    expect(isUnread(newer, read, 'me')).toBe(true);
    expect(isUnread(newer, read, null)).toBe(false);
    expect(countUnread([mine, older, newer], read, 'me')).toBe(1);
  });

  it('검색은 제목·본문·태그·링크·작성자·파일명을 본다', () => {
    const p = post({ body: '이번 주 숙제', tags: ['중3'], links: ['https://drive.google.com/x'] });
    const files: SharePostFile[] = [{
      id: 'f', post_id: 'p1', storage_path: 'x', original_name: '오답클릭_v3.zip', mime_type: null,
      file_size: 1, uploaded_by: null, created_at: '',
    }];
    expect(matchesQuery(p, files, '황은지', '오답클릭')).toBe(true);
    expect(matchesQuery(p, files, '황은지', '황은')).toBe(true);
    expect(matchesQuery(p, files, '황은지', 'DRIVE')).toBe(true);
    expect(matchesQuery(p, files, '황은지', '없는말')).toBe(false);
    expect(matchesQuery(p, files, '황은지', '   ')).toBe(true);
  });

  it('필터는 태그·읽지않음·검색을 함께 적용한다', () => {
    const a = post({ id: 'a', tags: ['수학'], created_by: 'other' });
    const b = post({ id: 'b', tags: ['영어'], created_by: 'other', title: '영어 단어' });
    const filesByPost = new Map<string, SharePostFile[]>();
    const names = { other: '이나연' };
    const readIds = new Set(['a']);
    expect(filterPosts([a, b], filesByPost, names, readIds, 'me', { query: '', tag: '수학', unreadOnly: false }).map((p) => p.id)).toEqual(['a']);
    expect(filterPosts([a, b], filesByPost, names, readIds, 'me', { query: '', tag: null, unreadOnly: true }).map((p) => p.id)).toEqual(['b']);
    expect(filterPosts([a, b], filesByPost, names, readIds, 'me', { query: '나연', tag: null, unreadOnly: false })).toHaveLength(2);
    expect(filterPosts([a, b], filesByPost, names, readIds, 'me', { query: '단어', tag: '수학', unreadOnly: false })).toHaveLength(0);
  });
});
