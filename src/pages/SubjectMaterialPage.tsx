import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, FolderPlus, Upload, Trash2, ChevronRight, Home,
  FileText, FileImage, File as FileIcon, Download, FolderOpen, Folder
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
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

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <FileIcon className="w-5 h-5 text-muted-foreground" />;
  if (mimeType.startsWith('image/')) return <FileImage className="w-5 h-5 text-blue-500" />;
  if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
  return <FileIcon className="w-5 h-5 text-muted-foreground" />;
}

export default function SubjectMaterialPage() {
  const { subject } = useParams<{ subject: string }>();
  const config = subject ? SUBJECT_CONFIG[subject] : null;
  const { toast } = useToast();

  const [folders, setFolders] = useState<MaterialFolder[]>([]);
  const [files, setFiles] = useState<MaterialFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string | null; name: string }[]>([]);

  // Dialog states
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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

    if (currentFolderId) {
      folderQuery.eq('parent_id', currentFolderId);
      fileQuery.eq('folder_id', currentFolderId);
    } else {
      folderQuery.is('parent_id', null);
      fileQuery.is('folder_id', null);
    }

    const [foldersRes, filesRes] = await Promise.all([folderQuery, fileQuery]);

    setFolders((foldersRes.data as MaterialFolder[]) || []);
    setFiles((filesRes.data as MaterialFile[]) || []);
    setLoading(false);
  }, [subject, currentFolderId]);

  useEffect(() => {
    loadContents();
  }, [loadContents]);

  // Build breadcrumb when navigating
  const navigateToFolder = async (folderId: string | null) => {
    if (folderId === null) {
      setCurrentFolderId(null);
      setBreadcrumb([]);
      return;
    }

    // Build breadcrumb path
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length || !subject) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setUploading(true);
    let successCount = 0;

    for (const file of selectedFiles) {
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
  };

  const handleDownload = async (file: MaterialFile) => {
    const { data, error } = await supabase.storage
      .from('materials')
      .createSignedUrl(file.storage_path, 300);

    if (error || !data?.signedUrl) {
      toast({ title: '다운로드 링크 생성 실패', variant: 'destructive' });
      return;
    }

    const a = document.createElement('a');
    a.href = data.signedUrl;
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
    } else {
      // Delete folder (cascade will handle children in DB, but we need to clean storage)
      await supabase.from('material_folders').delete().eq('id', deleteTarget.id);
    }

    toast({ title: `${deleteTarget.type === 'folder' ? '폴더' : '파일'}가 삭제되었습니다` });
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

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-2xl font-bold text-foreground">{config.label} 자료실</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)} className="gap-1.5">
                <FolderPlus className="w-4 h-4" />
                새 폴더
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-1.5"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                파일 업로드
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
            ) : folders.length === 0 && files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                <FolderOpen className="w-12 h-12 opacity-40" />
                <p>이 폴더는 비어있습니다</p>
                <p className="text-xs">폴더를 만들거나 파일을 업로드하세요</p>
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

                {/* Files */}
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors group"
                  >
                    {getFileIcon(file.mime_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.original_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.file_size)}
                        {' · '}
                        {new Date(file.created_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 sm:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDownload(file)}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteTarget({ type: 'file', id: file.id, name: file.original_name })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
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
                  {creatingFolder ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  만들기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirm */}
          <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {deleteTarget?.type === 'folder' ? '폴더 삭제' : '파일 삭제'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  "{deleteTarget?.name}"을(를) 삭제하시겠습니까?
                  {deleteTarget?.type === 'folder' && ' 하위 파일과 폴더도 함께 삭제됩니다.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
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
