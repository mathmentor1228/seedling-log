// SHARE-CHANNEL-V1: "파일" 탭 — 글에 흩어진 첨부를 한 표로. 드라이브 폴더 대신 여기서 찾는다.
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FILE_KIND_LABEL, fileKind, formatBytes, type SharePost, type SharePostFile } from '@/lib/share';
import { relativeTime } from './SharePostCard';

export interface ShareFileRow {
  file: SharePostFile;
  post: SharePost;
}

interface ShareFilesTableProps {
  rows: ShareFileRow[];
  names: Record<string, string>;
  onOpenFile: (file: SharePostFile, download: boolean) => void;
  onTagClick: (tag: string) => void;
}

export function ShareFilesTable({ rows, names, onOpenFile, onTagClick }: ShareFilesTableProps) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">조건에 맞는 파일이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">종류</TableHead>
            <TableHead>파일명</TableHead>
            <TableHead className="w-20">크기</TableHead>
            <TableHead>글 · 태그</TableHead>
            <TableHead className="w-24">올린 사람</TableHead>
            <TableHead className="w-32">올린 때</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ file, post }) => {
            const kind = fileKind(file.original_name, file.mime_type);
            return (
              <TableRow key={file.id}>
                <TableCell className="text-xs text-muted-foreground">{FILE_KIND_LABEL[kind]}</TableCell>
                <TableCell className="max-w-[16rem]">
                  <button
                    type="button"
                    onClick={() => onOpenFile(file, false)}
                    className="block w-full truncate text-left font-medium hover:underline"
                    title={file.original_name}
                  >
                    {file.original_name}
                  </button>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatBytes(file.file_size)}</TableCell>
                <TableCell className="max-w-[14rem]">
                  <div className="truncate text-sm" title={post.title}>{post.title}</div>
                  {post.tags.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {post.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => onTagClick(tag)}
                          className="rounded-full bg-secondary px-1.5 py-0 text-[11px] text-secondary-foreground hover:bg-secondary/70"
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm">{names[file.uploaded_by ?? post.created_by] ?? '…'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{relativeTime(file.created_at)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenFile(file, true)} aria-label={`${file.original_name} 내려받기`}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
