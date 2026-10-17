// SHARE-CHANNEL-V1: /share 화면의 데이터 훅. 글·첨부·댓글·읽음을 한 번에 읽고 Realtime 으로 다시 읽는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { notifyShareUnreadChanged } from '@/hooks/useShareUnread';
import {
  SHARE_BUCKET, SHARE_MAX_FILE_BYTES, formatBytes, storagePathFor,
  type SharePost, type SharePostComment, type SharePostFile, type SharePostRead,
} from '@/lib/share';

// share_* 테이블은 Lovable 이 types.ts 를 재생성하기 전까지 타입 정보가 없다.
const db = supabase as any;

export interface ShareDraft {
  title: string;
  body: string;
  tags: string[];
  links: string[];
}

export function useShareChannel() {
  const { user, role } = useAuth();
  const me = user?.id ?? null;
  const isAdmin = role === 'admin';

  const [posts, setPosts] = useState<SharePost[]>([]);
  const [files, setFiles] = useState<SharePostFile[]>([]);
  const [comments, setComments] = useState<SharePostComment[]>([]);
  const [reads, setReads] = useState<SharePostRead[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const namesRef = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    const [p, f, c, r] = await Promise.all([
      db.from('share_posts').select('*').order('created_at', { ascending: false }).limit(500),
      db.from('share_post_files').select('*').order('created_at', { ascending: true }),
      db.from('share_post_comments').select('*').order('created_at', { ascending: true }),
      db.from('share_post_reads').select('*'),
    ]);
    const firstError = p.error ?? f.error ?? c.error ?? r.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    const postRows = (p.data ?? []) as SharePost[];
    const fileRows = (f.data ?? []) as SharePostFile[];
    const commentRows = (c.data ?? []) as SharePostComment[];
    const readRows = (r.data ?? []) as SharePostRead[];

    const ids = new Set<string>();
    postRows.forEach((x) => ids.add(x.created_by));
    commentRows.forEach((x) => ids.add(x.created_by));
    readRows.forEach((x) => ids.add(x.user_id));
    fileRows.forEach((x) => { if (x.uploaded_by) ids.add(x.uploaded_by); });
    const missing = [...ids].filter((id) => !namesRef.current[id]);
    if (missing.length > 0) {
      const { data: profiles } = await db.from('profiles').select('id, full_name').in('id', missing);
      const next = { ...namesRef.current };
      for (const row of (profiles ?? []) as { id: string; full_name: string | null }[]) {
        next[row.id] = row.full_name || '이름 없음';
      }
      namesRef.current = next;
      setNames(next);
    }

    setPosts(postRows);
    setFiles(fileRows);
    setComments(commentRows);
    setReads(readRows);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime: 어느 표든 바뀌면 0.4초 뒤 한 번만 다시 읽는다.
  useEffect(() => {
    if (!me) return;
    let timer: number | undefined;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void load(); }, 400);
    };
    const channel = supabase.channel(`share-channel-${me}`);
    for (const table of ['share_posts', 'share_post_files', 'share_post_comments', 'share_post_reads']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    }
    channel.subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [me, load]);

  const filesByPost = useMemo(() => {
    const map = new Map<string, SharePostFile[]>();
    for (const file of files) {
      const list = map.get(file.post_id) ?? [];
      list.push(file);
      map.set(file.post_id, list);
    }
    return map;
  }, [files]);

  const commentsByPost = useMemo(() => {
    const map = new Map<string, SharePostComment[]>();
    for (const comment of comments) {
      const list = map.get(comment.post_id) ?? [];
      list.push(comment);
      map.set(comment.post_id, list);
    }
    return map;
  }, [comments]);

  const readsByPost = useMemo(() => {
    const map = new Map<string, SharePostRead[]>();
    for (const read of reads) {
      const list = map.get(read.post_id) ?? [];
      list.push(read);
      map.set(read.post_id, list);
    }
    return map;
  }, [reads]);

  const readIds = useMemo(() => {
    const set = new Set<string>();
    if (me) for (const read of reads) if (read.user_id === me) set.add(read.post_id);
    return set;
  }, [reads, me]);

  // ---- 쓰기 ---------------------------------------------------------------

  const uploadFilesTo = useCallback(async (postId: string, picked: File[]): Promise<number> => {
    if (!me) return 0;
    let ok = 0;
    for (const file of picked) {
      if (file.size > SHARE_MAX_FILE_BYTES) {
        toast.error(`${file.name} 은(는) ${formatBytes(SHARE_MAX_FILE_BYTES)} 를 넘어 올리지 못했습니다. 드라이브 링크로 올려주세요.`);
        continue;
      }
      const path = storagePathFor(me, postId, file.name);
      const { error: upErr } = await supabase.storage
        .from(SHARE_BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (upErr) {
        toast.error(`${file.name} 업로드 실패`, { description: upErr.message });
        continue;
      }
      const { error: rowErr } = await db.from('share_post_files').insert({
        post_id: postId,
        storage_path: path,
        original_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        uploaded_by: me,
      });
      if (rowErr) {
        await supabase.storage.from(SHARE_BUCKET).remove([path]);
        toast.error(`${file.name} 기록 실패`, { description: rowErr.message });
        continue;
      }
      ok += 1;
    }
    return ok;
  }, [me]);

  const createPost = useCallback(async (draft: ShareDraft, picked: File[]): Promise<boolean> => {
    if (!me) return false;
    const { data, error: insErr } = await db
      .from('share_posts')
      .insert({
        created_by: me,
        title: draft.title.trim(),
        body: draft.body.trim() || null,
        tags: draft.tags,
        links: draft.links,
      })
      .select('id')
      .single();
    if (insErr || !data) {
      toast.error('글을 올리지 못했습니다', { description: insErr?.message });
      return false;
    }
    const uploaded = await uploadFilesTo(data.id as string, picked);
    toast.success(picked.length > 0 ? `올렸습니다 (파일 ${uploaded}/${picked.length})` : '올렸습니다');
    await load();
    return true;
  }, [me, uploadFilesTo, load]);

  const updatePost = useCallback(async (postId: string, draft: ShareDraft, picked: File[]): Promise<boolean> => {
    const { error: updErr } = await db
      .from('share_posts')
      .update({
        title: draft.title.trim(),
        body: draft.body.trim() || null,
        tags: draft.tags,
        links: draft.links,
      })
      .eq('id', postId);
    if (updErr) {
      toast.error('수정하지 못했습니다', { description: updErr.message });
      return false;
    }
    if (picked.length > 0) await uploadFilesTo(postId, picked);
    toast.success('수정했습니다');
    await load();
    return true;
  }, [uploadFilesTo, load]);

  const deleteFile = useCallback(async (file: SharePostFile) => {
    const { error: rowErr } = await db.from('share_post_files').delete().eq('id', file.id);
    if (rowErr) {
      toast.error('파일을 지우지 못했습니다', { description: rowErr.message });
      return;
    }
    await supabase.storage.from(SHARE_BUCKET).remove([file.storage_path]);
    await load();
  }, [load]);

  const deletePost = useCallback(async (post: SharePost) => {
    const paths = (filesByPost.get(post.id) ?? []).map((f) => f.storage_path);
    const { error: delErr } = await db.from('share_posts').delete().eq('id', post.id);
    if (delErr) {
      toast.error('글을 지우지 못했습니다', { description: delErr.message });
      return;
    }
    if (paths.length > 0) await supabase.storage.from(SHARE_BUCKET).remove(paths);
    toast.success('지웠습니다');
    await load();
  }, [filesByPost, load]);

  const togglePin = useCallback(async (post: SharePost) => {
    const { error: pinErr } = await db.from('share_posts').update({ pinned: !post.pinned }).eq('id', post.id);
    if (pinErr) {
      toast.error('고정을 바꾸지 못했습니다', { description: pinErr.message });
      return;
    }
    await load();
  }, [load]);

  const addComment = useCallback(async (postId: string, body: string): Promise<boolean> => {
    if (!me || !body.trim()) return false;
    const { error: cErr } = await db.from('share_post_comments').insert({ post_id: postId, created_by: me, body: body.trim() });
    if (cErr) {
      toast.error('댓글을 남기지 못했습니다', { description: cErr.message });
      return false;
    }
    await load();
    return true;
  }, [me, load]);

  const deleteComment = useCallback(async (commentId: string) => {
    const { error: cErr } = await db.from('share_post_comments').delete().eq('id', commentId);
    if (cErr) {
      toast.error('댓글을 지우지 못했습니다', { description: cErr.message });
      return;
    }
    await load();
  }, [load]);

  const markRead = useCallback(async (post: SharePost) => {
    if (!me || post.created_by === me || readIds.has(post.id)) return;
    const row: SharePostRead = { post_id: post.id, user_id: me, read_at: new Date().toISOString() };
    setReads((prev) => [...prev, row]);
    const { error: rErr } = await db.from('share_post_reads').upsert(
      { post_id: post.id, user_id: me },
      { onConflict: 'post_id,user_id', ignoreDuplicates: true },
    );
    if (rErr) {
      setReads((prev) => prev.filter((r) => !(r.post_id === post.id && r.user_id === me)));
      return;
    }
    notifyShareUnreadChanged();
  }, [me, readIds]);

  const markAllRead = useCallback(async () => {
    if (!me) return;
    const targets = posts.filter((p) => p.created_by !== me && !readIds.has(p.id));
    if (targets.length === 0) return;
    const rows = targets.map((p) => ({ post_id: p.id, user_id: me }));
    const { error: rErr } = await db.from('share_post_reads').upsert(rows, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
    if (rErr) {
      toast.error('읽음 처리 실패', { description: rErr.message });
      return;
    }
    toast.success(`${targets.length}건 읽음 처리`);
    notifyShareUnreadChanged();
    await load();
  }, [me, posts, readIds, load]);

  /** 서명 URL. download=true 면 원본 파일명으로 내려받는다(저장소 키는 난수라 이 옵션이 없으면 이름이 깨진다). */
  const getFileUrl = useCallback(async (file: SharePostFile, download: boolean): Promise<string | null> => {
    const { data, error: sErr } = await supabase.storage
      .from(SHARE_BUCKET)
      .createSignedUrl(file.storage_path, 600, download ? { download: file.original_name } : undefined);
    if (sErr || !data?.signedUrl) {
      toast.error('파일 링크를 만들지 못했습니다', { description: sErr?.message });
      return null;
    }
    return data.signedUrl;
  }, []);

  return {
    me, isAdmin, loading, error,
    posts, filesByPost, commentsByPost, readsByPost, readIds, names,
    reload: load,
    createPost, updatePost, deletePost, deleteFile, togglePin,
    addComment, deleteComment, markRead, markAllRead, getFileUrl,
  };
}

export type ShareChannelApi = ReturnType<typeof useShareChannel>;
