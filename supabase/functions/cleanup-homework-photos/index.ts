import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'homework-submissions';
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const BATCH_SIZE = 100;

type CleanupResult = {
  cutoff: string;
  scannedReferences: number;
  storageRemoved: number;
  assignmentRowsCleared: number;
  submissionRowsCleared: number;
  errors: string[];
};

function toPositiveDays(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS;
  return Math.min(Math.floor(parsed), MAX_DAYS);
}

function extractHomeworkStoragePaths(value: string | null | undefined): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((urlOrPath) => {
      const publicMatch = urlOrPath.match(/\/object\/public\/homework-submissions\/([^?#]+)/);
      const signedMatch = urlOrPath.match(/\/object\/sign\/homework-submissions\/([^?#]+)/);
      const path = publicMatch?.[1] ?? signedMatch?.[1] ?? urlOrPath;
      try {
        return decodeURIComponent(path);
      } catch {
        return path;
      }
    })
    .filter((path) => path && !path.startsWith('http'));
}

async function removeStoragePaths(supabase: ReturnType<typeof createClient>, paths: string[], errors: string[]) {
  let removed = 0;
  const uniquePaths = [...new Set(paths)];

  for (let i = 0; i < uniquePaths.length; i += BATCH_SIZE) {
    const batch = uniquePaths.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      errors.push(`storage remove failed: ${error.message}`);
    } else {
      removed += batch.length;
    }
  }

  return removed;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) throw new Error('Backend cleanup credentials are not configured');

    const body = await req.json().catch(() => ({}));
    const days = toPositiveDays(body?.days);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const supabase = createClient(supabaseUrl, serviceKey);
    const errors: string[] = [];
    const result: CleanupResult = {
      cutoff,
      scannedReferences: 0,
      storageRemoved: 0,
      assignmentRowsCleared: 0,
      submissionRowsCleared: 0,
      errors,
    };

    const { data: oldSubmissions, error: submissionsError } = await supabase
      .from('homework_submissions')
      .select('id, image_url')
      .not('image_url', 'is', null)
      .lt('submitted_at', cutoff);

    if (submissionsError) throw submissionsError;

    const submissionIds = (oldSubmissions ?? []).map((row) => row.id).filter(Boolean);
    const submissionPaths = (oldSubmissions ?? []).flatMap((row) => extractHomeworkStoragePaths(row.image_url));
    result.scannedReferences += submissionPaths.length;
    result.storageRemoved += await removeStoragePaths(supabase, submissionPaths, errors);

    if (submissionIds.length > 0) {
      const { error } = await supabase
        .from('homework_submissions')
        .update({ image_url: null })
        .in('id', submissionIds);
      if (error) errors.push(`homework_submissions cleanup failed: ${error.message}`);
      else result.submissionRowsCleared = submissionIds.length;
    }

    const { data: oldAssignments, error: assignmentsError } = await supabase
      .from('homework_assignments')
      .select('id, submission_image_url')
      .not('submission_image_url', 'is', null)
      .lt('submitted_at', cutoff);

    if (assignmentsError) throw assignmentsError;

    const assignmentIds = (oldAssignments ?? []).map((row) => row.id).filter(Boolean);
    const assignmentPaths = (oldAssignments ?? []).flatMap((row) => extractHomeworkStoragePaths(row.submission_image_url));
    result.scannedReferences += assignmentPaths.length;
    result.storageRemoved += await removeStoragePaths(supabase, assignmentPaths, errors);

    if (assignmentIds.length > 0) {
      const { error } = await supabase
        .from('homework_assignments')
        .update({ submission_image_url: null })
        .in('id', assignmentIds);
      if (error) errors.push(`homework_assignments cleanup failed: ${error.message}`);
      else result.assignmentRowsCleared = assignmentIds.length;
    }

    return new Response(JSON.stringify({ success: errors.length === 0, ...result }), {
      status: errors.length ? 207 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('cleanup-homework-photos error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
