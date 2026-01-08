// TEACHER-REQUEST-DETAILS-ATTACH-V1
// Hook for fetching task attachment counts and generating signed URLs
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TaskAttachment {
  id: string;
  task_id: string;
  original_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface AttachmentWithUrl extends TaskAttachment {
  signedUrl: string | null;
}

// Fetch attachment counts for multiple tasks in a single batch query
export async function fetchAttachmentCounts(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};

  try {
    const { data, error } = await supabase
      .from('task_attachments')
      .select('task_id')
      .in('task_id', taskIds);

    if (error) {
      console.error('[ATTACH_COUNT] Error fetching attachment counts:', error);
      return {};
    }

    // Count attachments per task
    const counts: Record<string, number> = {};
    (data || []).forEach((row) => {
      counts[row.task_id] = (counts[row.task_id] || 0) + 1;
    });

    return counts;
  } catch (error) {
    console.error('[ATTACH_COUNT] Error:', error);
    return {};
  }
}

// Fetch attachment details for a single task
export async function fetchTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  try {
    const { data, error } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[ATTACH_FETCH] Error fetching attachments:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[ATTACH_FETCH] Error:', error);
    return [];
  }
}

// Generate signed URL for a single attachment
export async function generateSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    if (error) {
      console.error('[SIGNED_URL] Error generating signed URL:', error);
      return null;
    }

    return data?.signedUrl || null;
  } catch (error) {
    console.error('[SIGNED_URL] Error:', error);
    return null;
  }
}

// Hook to manage attachment state for task list views
export function useTaskAttachments() {
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [expandedAttachments, setExpandedAttachments] = useState<Record<string, AttachmentWithUrl[]>>({});
  const [loadingAttachments, setLoadingAttachments] = useState<Record<string, boolean>>({});

  // Load attachment counts for a batch of tasks
  const loadAttachmentCounts = useCallback(async (taskIds: string[]) => {
    const counts = await fetchAttachmentCounts(taskIds);
    setAttachmentCounts(counts);
  }, []);

  // Load and expand attachments for a specific task
  const toggleTaskAttachments = useCallback(async (taskId: string) => {
    // If already expanded, collapse
    if (expandedAttachments[taskId]) {
      setExpandedAttachments(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      return;
    }

    // Start loading
    setLoadingAttachments(prev => ({ ...prev, [taskId]: true }));

    try {
      const attachments = await fetchTaskAttachments(taskId);
      
      // Generate signed URLs for all attachments
      const attachmentsWithUrls: AttachmentWithUrl[] = await Promise.all(
        attachments.map(async (att) => {
          const signedUrl = await generateSignedUrl(att.storage_path);
          return { ...att, signedUrl };
        })
      );

      setExpandedAttachments(prev => ({
        ...prev,
        [taskId]: attachmentsWithUrls
      }));
    } catch (error) {
      console.error('[TOGGLE_ATTACH] Error:', error);
    } finally {
      setLoadingAttachments(prev => ({ ...prev, [taskId]: false }));
    }
  }, [expandedAttachments]);

  return {
    attachmentCounts,
    expandedAttachments,
    loadingAttachments,
    loadAttachmentCounts,
    toggleTaskAttachments
  };
}

// Helper to check if a file is an image based on mime type
export function isImageMimeType(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith('image/');
}

// Format file size for display
export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
