// TEACHER-REQUEST-DETAILS-ATTACH-V1
// Reusable component for displaying task attachment list
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Paperclip, Download, ExternalLink, ChevronDown, ChevronUp, Image as ImageIcon, File as FileIcon } from 'lucide-react';
import { AttachmentWithUrl, isImageMimeType, formatFileSize } from '@/hooks/useTaskAttachments';
import { cn } from '@/lib/utils';

interface TaskAttachmentBadgeProps {
  count: number;
  expanded: boolean;
  loading: boolean;
  onToggle: () => void;
}

export function TaskAttachmentBadge({ count, expanded, loading, onToggle }: TaskAttachmentBadgeProps) {
  if (count === 0) return null;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs cursor-pointer hover:bg-accent transition-colors gap-1",
        expanded && "bg-accent"
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <>
          <Paperclip className="w-3 h-3" />
          첨부 {count}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </>
      )}
    </Badge>
  );
}

interface TaskAttachmentListProps {
  attachments: AttachmentWithUrl[];
  className?: string;
}

export function TaskAttachmentList({ attachments, className }: TaskAttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className={cn("space-y-2 pl-2 border-l-2 border-muted", className)}>
      {attachments.map((att) => (
        <div 
          key={att.id} 
          className="flex items-start gap-2 p-2 bg-muted/30 rounded-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Thumbnail or file icon */}
          <div className="shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
            {isImageMimeType(att.mime_type) && att.signedUrl ? (
              <img 
                src={att.signedUrl} 
                alt={att.original_name}
                className="w-full h-full object-cover"
              />
            ) : isImageMimeType(att.mime_type) ? (
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            ) : (
              <FileIcon className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          
          {/* File info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{att.original_name}</p>
            {att.file_size && (
              <p className="text-xs text-muted-foreground">{formatFileSize(att.file_size)}</p>
            )}
          </div>
          
          {/* Download/Open button */}
          {att.signedUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              asChild
            >
              <a 
                href={att.signedUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                download={att.original_name}
              >
                {isImageMimeType(att.mime_type) ? (
                  <ExternalLink className="w-4 h-4" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </a>
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

interface TaskNotesPreviewProps {
  notes: string | null;
  expanded: boolean;
  onToggle: () => void;
}

export function TaskNotesPreview({ notes, expanded, onToggle }: TaskNotesPreviewProps) {
  if (!notes) return null;

  const isLongNote = notes.length > 80;

  return (
    <div className="space-y-1">
      <p 
        className={cn(
          "text-xs text-muted-foreground",
          !expanded && "line-clamp-2"
        )}
      >
        {notes}
      </p>
      {isLongNote && (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto py-0 px-1 text-xs text-primary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          }}
        >
          {expanded ? '접기' : '자세히'}
        </Button>
      )}
    </div>
  );
}
