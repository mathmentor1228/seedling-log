// EXAM-RESULTS-EDGE-V2: Student + staff endpoints for exam results
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_TYPES = ['midterm', 'final', 'performance', 'other'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    if (!action) return json({ error: 'Missing action' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(url, key);

    // ===== Staff actions: require authenticated staff JWT =====
    const STAFF_ACTIONS = ['staff_list', 'staff_create', 'staff_update', 'staff_delete', 'lock_score', 'unlock_score', 'register_pdf', 'delete_pdf', 'list_pdfs', 'staff_search_students'];
    if (STAFF_ACTIONS.includes(action)) {
      const auth = req.headers.get('Authorization');
      if (!auth) return json({ error: 'Unauthorized' }, 401);
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: auth } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
      const roleSet = new Set((roles || []).map((r: any) => r.role));
      if (!roleSet.has('admin') && !roleSet.has('teacher') && !roleSet.has('assistant')) {
        return json({ error: 'Forbidden' }, 403);
      }
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      const staffName = prof?.full_name || user.email || 'staff';

      if (action === 'staff_list') {
        const { student_id: filter_student_id, subject, review_status } = body;
        let query = supabase
          .from('student_exam_results')
          .select(`
            *,
            students(id, name, grade, school),
            student_exam_result_photos(id, storage_path, original_name, sort_order)
          `)
          .order('submitted_at', { ascending: false });

        if (filter_student_id) query = query.eq('student_id', filter_student_id);
        if (subject) query = query.eq('subject', subject);
        if (review_status) query = query.eq('review_status', review_status);

        const { data: results, error } = await query;
        if (error) return json({ error: error.message }, 500);

        const enriched = await Promise.all(
          (results || []).map(async (r: any) => {
            const photos = await Promise.all(
              (r.student_exam_result_photos || [])
                .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map(async (p: any) => {
                  const { data: signed } = await supabase.storage
                    .from('exam-results')
                    .createSignedUrl(p.storage_path, 3600);
                  return { ...p, signedUrl: signed?.signedUrl || null };
                })
            );
            return { ...r, photos };
          })
        );
        return json({ results: enriched });
      }

      if (action === 'staff_search_students') {
        const q = String(body.query || '').trim();
        if (!q) return json({ students: [] });
        const { data } = await supabase
          .from('students').select('id, name, school, school_level, grade')
          .or(`name.ilike.%${q}%,school.ilike.%${q}%`).limit(20);
        return json({ students: data || [] });
      }

      if (action === 'staff_create') {
        const { student_id, school_name, subject, exam_type, expected_score, exam_date, exam_year, exam_period, note, photos, pdf } = body;
        if (!student_id || !school_name || !subject) return json({ error: '학생/학교/과목 필수' }, 400);
        const type = VALID_TYPES.includes(exam_type) ? exam_type : 'midterm';
        const score = expected_score === '' || expected_score == null ? null : Number(expected_score);
        const { data: ins, error: insErr } = await supabase.from('student_exam_results').insert({
          student_id,
          school_name: String(school_name).slice(0, 100),
          subject: String(subject).slice(0, 50),
          exam_type: type,
          expected_score: score,
          exam_date: exam_date || null,
          exam_year: exam_year || null,
          exam_period: exam_period || null,
          note: note ? String(note).slice(0, 1000) : null,
          is_staff_upload: true,
          uploaded_by_staff: user.id,
          uploaded_by_staff_name: staffName,
        }).select().single();
        if (insErr) return json({ error: insErr.message }, 500);
        await uploadPhotos(supabase, photos || [], student_id, ins.id);
        if (pdf?.dataUrl) await uploadPdfFromDataUrl(supabase, pdf, ins.id, user.id, staffName);
        return json({ success: true, id: ins.id });
      }

      if (action === 'staff_update') {
        const { result_id, patch } = body;
        if (!result_id || !patch) return json({ error: 'result_id/patch required' }, 400);
        const allow = ['school_name', 'subject', 'exam_type', 'expected_score', 'actual_score', 'exam_date', 'exam_year', 'exam_period', 'note'];
        const upd: Record<string, any> = {};
        for (const k of allow) if (k in patch) upd[k] = patch[k];
        if (upd.exam_type && !VALID_TYPES.includes(upd.exam_type)) return json({ error: 'invalid exam_type' }, 400);
        const { error } = await supabase.from('student_exam_results').update(upd).eq('id', result_id);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      if (action === 'lock_score') {
        const { result_id, actual_score } = body;
        const upd: Record<string, any> = { score_locked: true, locked_at: new Date().toISOString(), locked_by: user.id };
        if (actual_score !== undefined && actual_score !== null && actual_score !== '') upd.actual_score = Number(actual_score);
        const { error } = await supabase.from('student_exam_results').update(upd).eq('id', result_id);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      if (action === 'unlock_score') {
        const { result_id } = body;
        const { error } = await supabase.from('student_exam_results').update({ score_locked: false, locked_at: null, locked_by: null }).eq('id', result_id);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      if (action === 'staff_delete') {
        const { result_id } = body;
        const { data: photos } = await supabase.from('student_exam_result_photos').select('storage_path').eq('result_id', result_id);
        if (photos?.length) await supabase.storage.from('exam-results').remove(photos.map((p: any) => p.storage_path));
        const { data: pdfs } = await supabase.from('student_exam_result_pdfs').select('storage_path').eq('result_id', result_id);
        if (pdfs?.length) await supabase.storage.from('exam-results').remove(pdfs.map((p: any) => p.storage_path));
        await supabase.from('student_exam_results').delete().eq('id', result_id);
        return json({ success: true });
      }

      if (action === 'register_pdf') {
        const { result_id, pdf } = body;
        if (!result_id || !pdf?.dataUrl) return json({ error: 'result_id and pdf required' }, 400);
        const r = await uploadPdfFromDataUrl(supabase, pdf, result_id, user.id, staffName);
        if (!r.ok) return json({ error: r.error }, 500);
        return json({ success: true, pdf_id: r.id, signedUrl: r.signedUrl });
      }

      if (action === 'list_pdfs') {
        const { result_id } = body;
        const { data } = await supabase.from('student_exam_result_pdfs').select('*').eq('result_id', result_id).order('generated_at', { ascending: false });
        const enriched = await Promise.all((data || []).map(async (p: any) => {
          const { data: signed } = await supabase.storage.from('exam-results').createSignedUrl(p.storage_path, 3600);
          return { ...p, signedUrl: signed?.signedUrl || null };
        }));
        return json({ pdfs: enriched });
      }

      if (action === 'delete_pdf') {
        const { pdf_id } = body;
        const { data: row } = await supabase.from('student_exam_result_pdfs').select('storage_path').eq('id', pdf_id).single();
        if (row) await supabase.storage.from('exam-results').remove([row.storage_path]);
        await supabase.from('student_exam_result_pdfs').delete().eq('id', pdf_id);
        return json({ success: true });
      }

      return json({ error: 'Unknown staff action' }, 400);
    }

    // ===== Student actions =====
    const { student_id, student_token } = body;
    if (!student_id || !student_token) return json({ error: 'Missing student auth' }, 400);
    const { data: account } = await supabase
      .from('student_accounts')
      .select('student_id, session_token, session_expires_at')
      .eq('student_id', student_id)
      .single();
    if (
      !account ||
      account.session_token !== student_token ||
      !account.session_expires_at ||
      new Date(account.session_expires_at).getTime() <= Date.now()
    ) return json({ error: 'Invalid session' }, 401);

    if (action === 'list') {
      const { data: results, error } = await supabase
        .from('student_exam_results')
        .select('*, student_exam_result_photos(id, storage_path, original_name, sort_order)')
        .eq('student_id', student_id)
        .order('submitted_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
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
      if (score !== null && (isNaN(score) || score < 0 || score > 100)) return json({ error: '예상 점수는 0~100 사이여야 합니다.' }, 400);
      const { data: inserted, error: insErr } = await supabase.from('student_exam_results').insert({
        student_id,
        school_name: String(school_name).slice(0, 100),
        subject: String(subject).slice(0, 50),
        exam_type: type,
        expected_score: score,
        note: note ? String(note).slice(0, 1000) : null,
        exam_date: exam_date || null,
      }).select().single();
      if (insErr) return json({ error: insErr.message }, 500);
      await uploadPhotos(supabase, photos || [], student_id, inserted.id);
      return json({ success: true, id: inserted.id });
    }

    if (action === 'delete') {
      const { result_id } = body;
      if (!result_id) return json({ error: 'result_id required' }, 400);
      const { data: own } = await supabase.from('student_exam_results').select('id, student_id, score_locked').eq('id', result_id).single();
      if (!own || own.student_id !== student_id) return json({ error: 'Forbidden' }, 403);
      if (own.score_locked) return json({ error: '확정된 결과는 삭제할 수 없습니다. 선생님께 문의하세요.' }, 403);
      const { data: photos } = await supabase.from('student_exam_result_photos').select('storage_path').eq('result_id', result_id);
      if (photos?.length) await supabase.storage.from('exam-results').remove(photos.map((p: any) => p.storage_path));
      const { data: pdfs } = await supabase.from('student_exam_result_pdfs').select('storage_path').eq('result_id', result_id);
      if (pdfs?.length) await supabase.storage.from('exam-results').remove(pdfs.map((p: any) => p.storage_path));
      await supabase.from('student_exam_results').delete().eq('id', result_id);
      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e: any) {
    console.error('student-exam-results error', e);
    return json({ error: e?.message || 'Server error' }, 500);
  }
});

// Robust dataURL parser: avoids regex truncation on large/multiline base64 strings
function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const s = String(dataUrl || '');
  if (!s.startsWith('data:')) return null;
  const commaIdx = s.indexOf(',');
  if (commaIdx < 0) return null;
  const header = s.slice(5, commaIdx); // e.g. "image/jpeg;base64"
  const isBase64 = header.includes(';base64');
  const mime = header.replace(';base64', '').trim() || 'application/octet-stream';
  // Strip whitespace/newlines that some clients (or copy-paste) include
  const payload = s.slice(commaIdx + 1).replace(/\s+/g, '');
  if (!isBase64) return null;
  // Chunked decode to avoid call-stack issues with huge strings on some runtimes
  try {
    const binary = atob(payload);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return { mime, bytes };
  } catch (e) {
    console.error('parseDataUrl atob failed', e, 'payloadLen=', payload.length);
    return null;
  }
}

async function uploadPhotos(supabase: any, photos: any[], student_id: string, result_id: string) {
  if (!Array.isArray(photos) || photos.length === 0) return;
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (!p?.dataUrl) continue;
    try {
      const parsed = parseDataUrl(p.dataUrl);
      if (!parsed) { console.error('photo parse failed', { name: p.name, len: String(p.dataUrl).length }); continue; }
      const { mime, bytes } = parsed;
      const ext = (mime.split('/')[1] || 'jpg').split('+')[0];
      const path = `${student_id}/${result_id}/${Date.now()}-${i}.${ext}`;
      console.log('[uploadPhotos] uploading', { path, mime, size: bytes.length });
      const { error: upErr } = await supabase.storage.from('exam-results').upload(path, bytes, { contentType: mime, upsert: false });
      if (upErr) { console.error('upload err', upErr); continue; }
      await supabase.from('student_exam_result_photos').insert({
        result_id, storage_path: path, original_name: p.name || null, mime_type: mime, file_size: bytes.length, sort_order: i,
      });
    } catch (e) { console.error('photo proc err', e); }
  }
}

async function uploadPdfFromDataUrl(supabase: any, pdf: { dataUrl: string; title: string; pageCount?: number }, result_id: string, user_id: string, staff_name: string) {
  try {
    const parsed = parseDataUrl(pdf.dataUrl);
    if (!parsed) return { ok: false, error: 'invalid pdf data' };
    const { bytes } = parsed;
    const path = `pdfs/${result_id}/${Date.now()}.pdf`;
    const { error } = await supabase.storage.from('exam-results').upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (error) return { ok: false, error: error.message };
    const { data: row, error: insErr } = await supabase.from('student_exam_result_pdfs').insert({
      result_id, storage_path: path, display_title: pdf.title, file_size: bytes.length,
      page_count: pdf.pageCount || null, generated_by: user_id, generated_by_name: staff_name,
    }).select().single();
    if (insErr) return { ok: false, error: insErr.message };
    const { data: signed } = await supabase.storage.from('exam-results').createSignedUrl(path, 3600);
    return { ok: true, id: row.id, signedUrl: signed?.signedUrl };
  } catch (e: any) { return { ok: false, error: e?.message }; }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
