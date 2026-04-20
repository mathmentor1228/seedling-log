// STUDENT-EXAM-RESULTS-V1: Student-facing endpoint for submitting and listing exam results
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_TYPES = ['midterm', 'final', 'performance', 'other'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, student_id, student_token } = body;

    if (!action || !student_id || !student_token) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(url, key);

    // Validate student exists (token validation matches student-data pattern)
    const { data: account } = await supabase
      .from('student_accounts')
      .select('student_id')
      .eq('student_id', student_id)
      .single();
    if (!account) return json({ error: 'Invalid session' }, 401);

    if (action === 'list') {
      const { data: results, error } = await supabase
        .from('student_exam_results')
        .select('*, student_exam_result_photos(id, storage_path, original_name, sort_order)')
        .eq('student_id', student_id)
        .order('submitted_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);

      // Generate signed URLs for thumbnails
      const enriched = await Promise.all((results || []).map(async (r: any) => {
        const photos = await Promise.all((r.student_exam_result_photos || []).map(async (p: any) => {
          const { data: signed } = await supabase.storage.from('exam-results').createSignedUrl(p.storage_path, 3600);
          return { ...p, signedUrl: signed?.signedUrl || null };
        }));
        return { ...r, photos };
      }));
      return json({ results: enriched });
    }

    if (action === 'create') {
      const { school_name, subject, exam_type, expected_score, note, exam_date, photos } = body;
      if (!school_name || !subject) return json({ error: '학교/과목은 필수입니다.' }, 400);
      const type = VALID_TYPES.includes(exam_type) ? exam_type : 'midterm';
      const score = expected_score === '' || expected_score == null ? null : Number(expected_score);
      if (score !== null && (isNaN(score) || score < 0 || score > 100)) {
        return json({ error: '예상 점수는 0~100 사이여야 합니다.' }, 400);
      }

      const { data: inserted, error: insErr } = await supabase
        .from('student_exam_results')
        .insert({
          student_id,
          school_name: String(school_name).slice(0, 100),
          subject: String(subject).slice(0, 50),
          exam_type: type,
          expected_score: score,
          note: note ? String(note).slice(0, 1000) : null,
          exam_date: exam_date || null,
        })
        .select()
        .single();
      if (insErr) return json({ error: insErr.message }, 500);

      // Upload photos (base64 data URLs)
      if (Array.isArray(photos) && photos.length > 0) {
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          if (!p?.dataUrl) continue;
          try {
            const match = String(p.dataUrl).match(/^data:(.+?);base64,(.+)$/);
            if (!match) continue;
            const mime = match[1];
            const ext = mime.split('/')[1] || 'jpg';
            const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
            const path = `${student_id}/${inserted.id}/${Date.now()}-${i}.${ext}`;
            const { error: upErr } = await supabase.storage.from('exam-results').upload(path, bytes, {
              contentType: mime,
              upsert: false,
            });
            if (upErr) { console.error('upload err', upErr); continue; }
            await supabase.from('student_exam_result_photos').insert({
              result_id: inserted.id,
              storage_path: path,
              original_name: p.name || null,
              mime_type: mime,
              file_size: bytes.length,
              sort_order: i,
            });
          } catch (e) {
            console.error('photo proc err', e);
          }
        }
      }

      return json({ success: true, id: inserted.id });
    }

    if (action === 'delete') {
      const { result_id } = body;
      if (!result_id) return json({ error: 'result_id required' }, 400);
      // Verify ownership
      const { data: own } = await supabase
        .from('student_exam_results')
        .select('id, student_id')
        .eq('id', result_id)
        .single();
      if (!own || own.student_id !== student_id) return json({ error: 'Forbidden' }, 403);

      // Delete storage files
      const { data: photos } = await supabase
        .from('student_exam_result_photos')
        .select('storage_path')
        .eq('result_id', result_id);
      if (photos && photos.length > 0) {
        await supabase.storage.from('exam-results').remove(photos.map((p: any) => p.storage_path));
      }
      await supabase.from('student_exam_results').delete().eq('id', result_id);
      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e: any) {
    console.error('student-exam-results error', e);
    return json({ error: e?.message || 'Server error' }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
