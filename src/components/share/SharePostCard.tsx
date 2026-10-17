// SHARE-CHANNEL-V1: 글 한 장. 접힌 상태는 제목·올린 사람·태그·파일, 펼치면 본문 전체·댓글·읽은 사람.
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Archive, ChevronDown, ChevronUp, Download, Eye, File, FileCode, FileSpreadsheet, FileText, Image,
  Link2, MessageCircle, MoreHorizontal, Music, Pencil, Pin, PinOff, Presentation, Send, Trash2, Video,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  FILE_KIND_LABEL, fileKind, formatBytes, linkLabel,
  type FileKind, type SharePost, type SharePostComment, type SharePostFile, type SharePostRead,
} from '@/lib/share';

const KIND_ICON: Record<FileKind, ReactNode> = {
  pdf: <FileText className="h-4 w-4 text-red-500" />,
  image: <Image className="h-4 w-4 text-emerald-500" />,
  archive: <Archive className="h-4 w-4 text-amber-500" />,
  doc: <FileText className="h-4 w-4 text-blue-500" />,
  sheet: <FileSpreadsheet className="h-4 w-4 text-green-600" />,
  slide: <Presentation className="h-4 w-4 text-orange-500" />,
  hwp: <FileText className="h-4 w-4 text-sky-500" />,
  video: <Video className="h-4 w-4 text-purple-500" />,
  audio: <Music className="h-4 w-4 text-pink-500" />,
  code: <FileCode className="h-4 w-4 text-slate-500" />,
  other: <File className="h-4 w-4 text-muted-foreground" />,
};

export function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffHours = (Date.now() - date.getTime()) / 36e5;
  if (diffHours < 48) return formatDistanceToNowStrict(date, { addSuffix: true, locale: ko });
  return format(date, 'M월 d일 (EEE) HH:mm', { locale: ko });
}

interface SharePostCardProps {
  post: SharePost;
  files: SharePostFile[];
  comments: SharePostComment[];
  reads: SharePostRead[];
  names: Record<string, string>;
  me: string | null;
  isAdmin: boolean;
  unread: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpenFile: (file: SharePostFile, download: boolean) => void;
  onLinkOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onAddComment: (body: string) => Promise<boolean>;
  onDeleteComment: (commentId: string) => void;
  onTagClick: (tag: string) => void;
}

export function SharePostCard({
  post, files, comments, reads, names, me, isAdmin, unread, expanded,
  onToggle, onOpenFile, onLinkOpen, onEdit, onDelete, onTogglePin, onAddComment, onDeleteComment, onTagClick,
}: SharePostCardProps) {
  const [commentInput, setCommentInput] = useState('');
  const [sending, setSending] = useState(false);
  const mine = post.created_by === me;
  const canEdit = mine || isAdmin;
  const author = names[post.created_by] ?? '…';
  const readers = reads.filter((r) => r.user_id !== post.created_by);
  const body = post.body ?? '';
  const bodyIsLong = body.length > 160 || body.split('\n').length > 3;

  const sendComment = async () => {
    if (!commentInput.trim() || sending) return;
    setSending(true);
    const ok = await onAddComment(commentInput);
    setSending(false);
    if (ok) setCommentInput('');
  };

  const onCommentKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.nativeEvent as { isComposing?: boolean }).isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); void sendComment(); }
  };

  return (
    <Card
      className={cn(
        'transition-colors',
        unread && 'border-primary/40 bg-primary/[0.03]',
        post.pinned && 'border-amber-400/60',
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="min-w-0 flex-1 text-left"
            aria-expanded={expanded}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {post.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="고정" />}
              <h3 className="font-semibold leading-snug">{post.title}</h3>
              {unread && <Badge className="h-5 px-1.5 text-[10px]">NEW</Badge>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">{author}</span>
              <span> · {relativeTime(post.created_at)}</span>
              {files.length > 0 && <span> · 파일 {files.length}</span>}
              {post.links.length > 0 && <span> · 링크 {post.links.length}</span>}
              {comments.length > 0 && <span> · 댓글 {comments.length}</span>}
            </div>
          </button>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="글 메뉴">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />수정</DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={onTogglePin}>
                    {post.pinned
                      ? <><PinOff className="mr-2 h-4 w-4" />고정 해제</>
                      : <><Pin className="mr-2 h-4 w-4" />맨 위에 고정</>}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />지우기
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTagClick(tag)}
                className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-secondary/70"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {body && (
          <p className={cn('whitespace-pre-wrap text-sm leading-relaxed', !expanded && bodyIsLong && 'line-clamp-3')}>
            {body}
          </p>
        )}

        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((file) => {
              const kind = fileKind(file.original_name, file.mime_type);
              return (
                <li key={file.id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
                  <span className="shrink-0">{KIND_ICON[kind]}</span>
                  <button
                    type="button"
                    onClick={() => onOpenFile(file, false)}
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                    title={`${FILE_KIND_LABEL[kind]} 열기`}
                  >
                    {file.original_name}
                  </button>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.file_size)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onOpenFile(file, true)}
                    aria-label={`${file.original_name} 내려받기`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {post.links.length > 0 && (
          <ul className="space-y-1">
            {post.links.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onLinkOpen}
                  className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm hover:bg-accent/50"
                >
                  <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 font-medium">{linkLabel(url)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{url}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground">
                <Eye className="h-3.5 w-3.5" /> 읽음 {readers.length}명
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-3 text-sm">
              {readers.length === 0 ? (
                <p className="text-muted-foreground">아직 아무도 안 읽었습니다.</p>
              ) : (
                <ul className="space-y-1">
                  {readers.map((r) => (
                    <li key={r.user_id} className="flex justify-between gap-2">
                      <span>{names[r.user_id] ?? '…'}</span>
                      <span className="text-xs text-muted-foreground">{relativeTime(r.read_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
          <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 hover:text-foreground">
            <MessageCircle className="h-3.5 w-3.5" /> 댓글 {comments.length}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {post.updated_at !== post.created_at && <span>수정됨</span>}
        </div>

        {expanded && (
          <div className="space-y-2 border-t pt-3">
            {comments.length > 0 && (
              <ul className="space-y-2">
                {comments.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{names[c.created_by] ?? '…'}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{relativeTime(c.created_at)}</span>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                    </div>
                    {(c.created_by === me || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => onDeleteComment(c.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                        aria-label="댓글 지우기"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={onCommentKey}
                placeholder="댓글 (예: 받았어요 / 3쪽 오타 있어요)"
                maxLength={2000}
                className="h-9"
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={() => { void sendComment(); }} disabled={sending || !commentInput.trim()} aria-label="댓글 보내기">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
