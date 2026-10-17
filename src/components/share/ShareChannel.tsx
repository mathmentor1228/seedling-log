// SHARE-CHANNEL-V1: /share 화면 본체. 검색·태그·안읽음 필터, 글/파일 탭, 새 글·수정·삭제.
import { useMemo, useState } from 'react';
import { CheckCheck, Plus, Search, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  countUnread, filterPosts, isInlineViewable, fileKind, isUnread, tagCounts,
  type SharePost, type SharePostFile,
} from '@/lib/share';
import { ShareComposerDialog } from './ShareComposerDialog';
import { ShareFilesTable, type ShareFileRow } from './ShareFilesTable';
import { SharePostCard } from './SharePostCard';
import { useShareChannel } from './useShareChannel';

export function ShareChannel() {
  const api = useShareChannel();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [tab, setTab] = useState<'posts' | 'files'>('posts');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<SharePost | null>(null);
  const [deleting, setDeleting] = useState<SharePost | null>(null);

  const counts = useMemo(() => tagCounts(api.posts), [api.posts]);
  const unreadCount = useMemo(() => countUnread(api.posts, api.readIds, api.me), [api.posts, api.readIds, api.me]);
  const visible = useMemo(
    () => filterPosts(api.posts, api.filesByPost, api.names, api.readIds, api.me, { query, tag, unreadOnly }),
    [api.posts, api.filesByPost, api.names, api.readIds, api.me, query, tag, unreadOnly],
  );
  const fileRows = useMemo<ShareFileRow[]>(
    () => visible.flatMap((post) => (api.filesByPost.get(post.id) ?? []).map((file) => ({ file, post }))),
    [visible, api.filesByPost],
  );
  const filtersActive = Boolean(query.trim() || tag || unreadOnly);

  const toggleExpanded = (post: SharePost) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(post.id)) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    void api.markRead(post);
  };

  const openFile = async (file: SharePostFile, download: boolean) => {
    const post = api.posts.find((p) => p.id === file.post_id);
    if (post) void api.markRead(post);
    const inline = !download && isInlineViewable(fileKind(file.original_name, file.mime_type));
    // 팝업 차단을 피하려고 창은 클릭 직후(동기) 열고, 서명 URL 은 그 뒤에 넣는다.
    const win = inline ? window.open('about:blank', '_blank') : null;
    const url = await api.getFileUrl(file, !inline);
    if (!url) {
      win?.close();
      return;
    }
    if (inline) {
      if (win) win.location.href = url;
      else window.location.href = url;
      return;
    }
    // Content-Disposition: attachment 라 페이지 이동 없이 원본 이름으로 내려받는다.
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const startEdit = (post: SharePost) => {
    setEditing(post);
    setComposerOpen(true);
  };

  const startCreate = () => {
    setEditing(null);
    setComposerOpen(true);
  };

  const clearFilters = () => {
    setQuery('');
    setTag(null);
    setUnreadOnly(false);
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">자료·전달</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            선생님·조교·원장이 자료와 전달사항을 한 곳에서. 카톡·드라이브 대신 여기에 올리면 모두에게 알림이 갑니다.
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" onClick={() => { void api.markAllRead(); }}>
              <CheckCheck className="mr-1.5 h-4 w-4" /> 모두 읽음 ({unreadCount})
            </Button>
          )}
          <Button onClick={startCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> 새 글
          </Button>
        </div>
      </div>

      {api.error && (
        <Alert variant="destructive">
          <AlertTitle>불러오지 못했습니다</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>{api.error}</span>
            <Button size="sm" variant="outline" onClick={() => { void api.reload(); }}>다시 시도</Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목·내용·파일명·태그·올린 사람 검색"
              className="pl-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="검색어 지우기"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            variant={unreadOnly ? 'default' : 'outline'}
            size="sm"
            className="h-10 sm:h-9"
            onClick={() => setUnreadOnly((v) => !v)}
          >
            안 읽은 것만{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </Button>
        </div>
        {counts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <TagChip active={tag === null} onClick={() => setTag(null)}>전체</TagChip>
            {counts.map((c) => (
              <TagChip key={c.tag} active={tag === c.tag} onClick={() => setTag(tag === c.tag ? null : c.tag)}>
                #{c.tag} <span className="opacity-60">{c.count}</span>
              </TagChip>
            ))}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'posts' | 'files')}>
        <TabsList>
          <TabsTrigger value="posts">글 {visible.length}</TabsTrigger>
          <TabsTrigger value="files">파일 {fileRows.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-3 space-y-3">
          {api.loading ? (
            <>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </>
          ) : api.posts.length === 0 ? (
            <EmptyBox
              title="아직 올라온 글이 없습니다"
              hint="첫 자료를 올려보세요. PDF·zip 같은 파일, 드라이브 링크, 짧은 전달사항 모두 됩니다."
              action={<Button onClick={startCreate}><Plus className="mr-1.5 h-4 w-4" /> 첫 글 올리기</Button>}
            />
          ) : visible.length === 0 ? (
            <EmptyBox
              title="조건에 맞는 글이 없습니다"
              action={filtersActive ? <Button variant="outline" onClick={clearFilters}>필터 지우기</Button> : undefined}
            />
          ) : (
            visible.map((post) => (
              <SharePostCard
                key={post.id}
                post={post}
                files={api.filesByPost.get(post.id) ?? []}
                comments={api.commentsByPost.get(post.id) ?? []}
                reads={api.readsByPost.get(post.id) ?? []}
                names={api.names}
                me={api.me}
                isAdmin={api.isAdmin}
                unread={isUnread(post, api.readIds, api.me)}
                expanded={expanded.has(post.id)}
                onToggle={() => toggleExpanded(post)}
                onOpenFile={(file, download) => { void openFile(file, download); }}
                onLinkOpen={() => { void api.markRead(post); }}
                onEdit={() => startEdit(post)}
                onDelete={() => setDeleting(post)}
                onTogglePin={() => { void api.togglePin(post); }}
                onAddComment={(body) => api.addComment(post.id, body)}
                onDeleteComment={(id) => { void api.deleteComment(id); }}
                onTagClick={(t) => setTag(t)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="files" className="mt-3">
          {api.loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ShareFilesTable
              rows={fileRows}
              names={api.names}
              onOpenFile={(file, download) => { void openFile(file, download); }}
              onTagClick={(t) => setTag(t)}
            />
          )}
        </TabsContent>
      </Tabs>

      <ShareComposerDialog
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) setEditing(null);
        }}
        editing={editing}
        existingFiles={editing ? api.filesByPost.get(editing.id) ?? [] : []}
        tagSuggestions={counts.map((c) => c.tag)}
        onSubmit={(draft, files) => (editing ? api.updatePost(editing.id, draft, files) : api.createPost(draft, files))}
        onDeleteFile={editing ? api.deleteFile : undefined}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 글을 지울까요?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.title}" 글과 첨부 파일 {deleting ? (api.filesByPost.get(deleting.id)?.length ?? 0) : 0}개,
              댓글이 함께 지워지고 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting) void api.deletePost(deleting);
                setDeleting(null);
              }}
            >
              지우기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TagChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function EmptyBox({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}
