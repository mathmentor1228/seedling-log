import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, FolderPlus, Upload, Trash2, ChevronRight, Home,
  FileText, FileImage, File as FileIcon, Download, FolderOpen, Folder,
  Link as LinkIcon, ExternalLink, Plus, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';

const SUBJECT_CONFIG: Record<string, { label: string }> = {
  math: { label: '수학' },
  english: { label: '영어' },
  korean: { label: '국어' },
  science: { label: '과학' },
};

interface MaterialFolder {
  id: string;
  subject: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

interface MaterialFile {
  id: string;
  subject: string;
  folder_id: string | null;
  original_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface MaterialLink {
  id: string;
  subject: string;
  folder_id: string | null;
  title: string;
  url: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

interface DragFileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface DragFileEntry extends DragFileSystemEntry {
  file: (success: (file: File) => void, error?: (err: DOMException) => void) => void;
}

interface DragDirectoryReader {
  readEntries: (success: (entries: DragFileSystemEntry[]) => void, error?: (err: DOMException) => void) => void;
}

interface DragDirectoryEntry extends DragFileSystemEntry {
  createReader: () => DragDirectoryReader;
}

interface DragDataTransferItem {
  webkitGetAsEntry?: () => DragFileSystemEntry | null;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <FileIcon className="w-5 h-5 text-muted-foreground" />;
  if (mimeType.startsWith('image/')) return <FileImage className="w-5 h-5 text-primary" />;
  if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-destructive" />;
  return <FileIcon className="w-5 h-5 text-muted-foreground" />;
}

function getLinkIcon(url: string) {
  if (url.includes('onedrive') || url.includes('sharepoint') || url.includes('1drv'))
    return <span className="text-sm">📁</span>;
  if (url.includes('drive.google'))
    return <span className="text-sm">📂</span>;
  return <LinkIcon className="w-4 h-4 text-primary" />;
}

export default function SubjectMaterialPage() {
  const { subject } = useParams<{ subject: string }>();
  const config = subject ? SUBJECT_CONFIG[subject] : null;
  const { toast } = useToast();

  const [folders, setFolders] = useState<MaterialFolder[]>([]);
  const [files, setFiles] = useState<MaterialFile[]>([]);
  const [links, setLinks] = useState<MaterialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string | null; name: string }[]>([]);

  // Dialog states
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'file' | 'folder' | 'link'; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Link dialog
  const [showNewLink, setShowNewLink] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkDesc, setNewLinkDesc] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadContents = useCallback(async () => {
    if (!subject) return;
    setLoading(true);

    const folderQuery = supabase
      .from('material_folders')
      .select('*')
      .eq('subject', subject)
      .order('sort_order')
      .order('name');

    const fileQuery = supabase
      .from('material_files')
      .select('*')
      .eq('subject', subject)
      .order('created_at', { ascending: false });

    const linkQuery = supabase
      .from('material_links')
      .select('*')
      .eq('subject', subject)
      .order('sort_order')
      .order('title');

    if (currentFolderId) {
      folderQuery.eq('parent_id', currentFolderId);
      fileQuery.eq('folder_id', currentFolderId);
      linkQuery.eq('folder_id', currentFolderId);
    } else {
      folderQuery.is('parent_id', null);
      fileQuery.is('folder_id', null);
      linkQuery.is('folder_id', null);
    }

    const [foldersRes, filesRes, linksRes] = await Promise.all([folderQuery, fileQuery, linkQuery]);

    setFolders((foldersRes.data as MaterialFolder[]) || []);
    setFiles((filesRes.data as MaterialFile[]) || []);
    setLinks((linksRes.data as MaterialLink[]) || []);
    setLoading(false);
  }, [subject, currentFolderId]);

  useEffect(() => {
    loadContents();
  }, [loadContents]);

  const navigateToFolder = async (folderId: string | null) => {
    if (folderId === null) {
      setCurrentFolderId(null);
      setBreadcrumb([]);
      return;
    }

    const path: { id: string | null; name: string }[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const { data } = await supabase
        .from('material_folders')
        .select('id, name, parent_id')
        .eq('id', currentId)
        .single();

      if (data) {
        path.unshift({ id: data.id, name: data.name });
        currentId = data.parent_id;
      } else {
        break;
      }
    }

    setBreadcrumb(path);
    setCurrentFolderId(folderId);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !subject) return;
    setCreatingFolder(true);

    const { error } = await supabase.from('material_folders').insert({
      subject,
      name: newFolderName.trim(),
      parent_id: currentFolderId,
    });

    if (error) {
      toast({ title: '폴더 생성 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '폴더가 생성되었습니다' });
      setNewFolderName('');
      setShowNewFolder(false);
      loadContents();
    }
    setCreatingFolder(false);
  };

  const handleCreateLink = async () => {
    if (!newLinkTitle.trim() || !newLinkUrl.trim() || !subject) return;
    setCreatingLink(true);

    let url = newLinkUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const { error } = await supabase.from('material_links').insert({
      subject,
      folder_id: currentFolderId,
      title: newLinkTitle.trim(),
      url,
      description: newLinkDesc.trim() || null,
    });

    if (error) {
      toast({ title: '링크 추가 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '링크가 추가되었습니다' });
      setNewLinkTitle('');
      setNewLinkUrl('');
      setNewLinkDesc('');
      setShowNewLink(false);
      loadContents();
    }
    setCreatingLink(false);
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const getSignedFileUrl = useCallback(async (file: MaterialFile) => {
    const signedUrl = await getCachedSignedUrl('materials', file.storage_path, 300);

    if (!signedUrl) {
      toast({ title: '파일 링크 생성 실패', variant: 'destructive' });
      return null;
    }

    return signedUrl;
  }, [toast]);

  const uploadFiles = useCallback(async (selectedFiles: File[]) => {
    if (!selectedFiles.length || !subject) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const oversized = selectedFiles.filter(f => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      toast({
        title: '파일 크기 초과',
        description: `${oversized.map(f => f.name).join(', ')}은(는) 10MB를 초과합니다. 큰 파일은 OneDrive 등 외부 링크로 등록해주세요.`,
        variant: 'destructive',
      });
    }

    const validFiles = selectedFiles.filter(f => f.size <= MAX_FILE_SIZE);
    if (!validFiles.length) return;

    setUploading(true);
    let successCount = 0;

    for (const file of validFiles) {
      const ext = file.name.split('.').pop() || '';
      const storagePath = `${subject}/${currentFolderId || 'root'}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('materials')
        .upload(storagePath, file);

      if (uploadErr) {
        toast({ title: `업로드 실패: ${file.name}`, description: uploadErr.message, variant: 'destructive' });
        continue;
      }

      const { error: dbErr } = await supabase.from('material_files').insert({
        subject,
        folder_id: currentFolderId,
        original_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        file_size: file.size,
      });

      if (dbErr) {
        toast({ title: `DB 저장 실패: ${file.name}`, description: dbErr.message, variant: 'destructive' });
      } else {
        successCount++;
      }
    }

    if (successCount > 0) {
      toast({ title: `${successCount}개 파일이 업로드되었습니다` });
      loadContents();
    }

    setUploading(false);
  }, [currentFolderId, loadContents, subject, toast]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await uploadFiles(Array.from(e.target.files || []));
  };

  const readDirectoryEntries = useCallback(async (reader: DragDirectoryReader): Promise<DragFileSystemEntry[]> => {
    const entries: DragFileSystemEntry[] = [];

    while (true) {
      const batch = await new Promise<DragFileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });

      if (!batch.length) break;
      entries.push(...batch);
    }

    return entries;
  }, []);

  const collectDroppedFiles = useCallback(async (entry: DragFileSystemEntry): Promise<File[]> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as DragFileEntry).file(resolve, reject);
      });

      return [file];
    }

    if (entry.isDirectory) {
      const nestedEntries = await readDirectoryEntries((entry as DragDirectoryEntry).createReader());
      const nestedFiles = await Promise.all(nestedEntries.map(collectDroppedFiles));
      return nestedFiles.flat();
    }

    return [];
  }, [readDirectoryEntries]);

  const extractDroppedFiles = useCallback(async (dataTransfer: DataTransfer) => {
    const items = Array.from(dataTransfer.items || []);
    const entries = items
      .map((item) => (item as DragDataTransferItem).webkitGetAsEntry?.() || null)
      .filter((entry): entry is DragFileSystemEntry => Boolean(entry));

    if (entries.length > 0) {
      const nestedFiles = await Promise.all(entries.map(collectDroppedFiles));
      return nestedFiles.flat();
    }

    return Array.from(dataTransfer.files || []);
  }, [collectDroppedFiles]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);

    const droppedFiles = await extractDroppedFiles(e.dataTransfer);
    if (!droppedFiles.length) {
      toast({ title: '업로드할 파일을 찾지 못했습니다', variant: 'destructive' });
      return;
    }

    await uploadFiles(droppedFiles);
  }, [extractDroppedFiles, toast, uploadFiles]);

  const handleOpenFile = useCallback(async (file: MaterialFile) => {
    const signedUrl = await getSignedFileUrl(file);
    if (!signedUrl) return;
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }, [getSignedFileUrl]);

  const handleDownload = async (file: MaterialFile) => {
    const signedUrl = await getSignedFileUrl(file);
    if (!signedUrl) return;

    const a = document.createElement('a');
    a.href = signedUrl;
    a.download = file.original_name;
    a.target = '_blank';
    a.click();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    if (deleteTarget.type === 'file') {
      const file = files.find(f => f.id === deleteTarget.id);
      if (file) {
        await supabase.storage.from('materials').remove([file.storage_path]);
      }
      await supabase.from('material_files').delete().eq('id', deleteTarget.id);
    } else if (deleteTarget.type === 'link') {
      await supabase.from('material_links').delete().eq('id', deleteTarget.id);
    } else {
      await supabase.from('material_folders').delete().eq('id', deleteTarget.id);
    }

    toast({ title: `삭제되었습니다` });
    setDeleteTarget(null);
    setDeleting(false);
    loadContents();
  };

  if (!config) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-muted-foreground">존재하지 않는 과목입니다.</p>
          </div>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  const hasContent = folders.length > 0 || files.length > 0 || links.length > 0;

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-2xl font-bold text-foreground">{config.label} 자료실</h1>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)} className="gap-1.5">
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">새 폴더</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowNewLink(true)} className="gap-1.5">
                <LinkIcon className="w-4 h-4" />
                <span className="hidden sm:inline">링크 추가</span>
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-1.5"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="hidden sm:inline">파일 업로드</span>
              </Button>
            </div>
          </div>

          {/* Upload size notice */}
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>직접 업로드는 <strong className="text-foreground">10MB 이하</strong>만 가능합니다. 그 이상의 파일은 <strong className="text-foreground">OneDrive / Google Drive 링크</strong>로 등록해주세요.</span>
          </div>

          <div
            className={cn(
              'rounded-lg border border-dashed px-4 py-4 transition-colors',
              isDragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setIsDragActive(false);
            }}
            onDrop={handleDrop}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">PDF 여러 개나 폴더째 드래그해서 바로 업로드할 수 있어요.</p>
                <p className="text-xs text-muted-foreground">현재 폴더 기준으로 업로드되고, PDF 클릭 시 현재 화면은 유지한 채 새 탭에서 열립니다.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-1.5">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                파일 선택
              </Button>
            </div>
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-sm flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={() => navigateToFolder(null)}
            >
              <Home className="w-3.5 h-3.5" />
              {config.label}
            </Button>
            {breadcrumb.map((crumb) => (
              <div key={crumb.id} className="flex items-center gap-1">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => navigateToFolder(crumb.id)}
                >
                  {crumb.name}
                </Button>
              </div>
            ))}
          </nav>

          {/* Content */}
          <div className="rounded-lg border border-border bg-card min-h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : !hasContent ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <FolderOpen className="w-12 h-12 opacity-40" />
                <p>이 폴더는 비어있습니다</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)} className="gap-1">
                    <FolderPlus className="w-3.5 h-3.5" /> 폴더 만들기
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowNewLink(true)} className="gap-1">
                    <LinkIcon className="w-3.5 h-3.5" /> 링크 추가
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Folders */}
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors group"
                    onClick={() => navigateToFolder(folder.id)}
                  >
                    <Folder className="w-5 h-5 text-amber-500 shrink-0" />
                    <span className="flex-1 font-medium text-sm truncate">{folder.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name });
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}

                {/* Links (OneDrive etc.) */}
                {links.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors group"
                  >
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      {getLinkIcon(link.url)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{link.title}</p>
                      {link.description && (
                        <p className="text-xs text-muted-foreground truncate">{link.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 sm:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        asChild
                      >
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteTarget({ type: 'link', id: link.id, name: link.title })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Files */}
                {files.map((file) => {
                  const isPdf = file.mime_type?.includes('pdf') || file.original_name.toLowerCase().endsWith('.pdf');

                  return (
                  <div
                    key={file.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 transition-colors group',
                      isPdf ? 'hover:bg-accent/50 cursor-pointer' : 'hover:bg-accent/30'
                    )}
                    onClick={() => {
                      if (isPdf) {
                        void handleOpenFile(file);
                      }
                    }}
                  >
                    {getFileIcon(file.mime_type)}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', isPdf && 'hover:underline')}>
                        {file.original_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.file_size)}
                        {' · '}
                        {new Date(file.created_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 sm:opacity-100">
                      {isPdf && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleOpenFile(file);
                          }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownload(file);
                        }}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ type: 'file', id: file.id, name: file.original_name });
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* New Folder Dialog */}
          <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>새 폴더 만들기</DialogTitle>
              </DialogHeader>
              <Input
                placeholder="폴더 이름"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                autoFocus
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewFolder(false)}>취소</Button>
                <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || creatingFolder}>
                  {creatingFolder && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  만들기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* New Link Dialog */}
          <Dialog open={showNewLink} onOpenChange={setShowNewLink}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>외부 링크 추가</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="링크 제목 (예: 중3 수학 문제집)"
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  autoFocus
                />
                <Input
                  placeholder="URL (OneDrive, Google Drive 등)"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                />
                <Textarea
                  placeholder="설명 (선택)"
                  value={newLinkDesc}
                  onChange={(e) => setNewLinkDesc(e.target.value)}
                  rows={2}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewLink(false)}>취소</Button>
                <Button
                  onClick={handleCreateLink}
                  disabled={!newLinkTitle.trim() || !newLinkUrl.trim() || creatingLink}
                >
                  {creatingLink && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  추가
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirm */}
          <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>삭제 확인</AlertDialogTitle>
                <AlertDialogDescription>
                  "{deleteTarget?.name}"을(를) 삭제하시겠습니까?
                  {deleteTarget?.type === 'folder' && ' 하위 파일과 폴더도 함께 삭제됩니다.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground">
                  {deleting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
