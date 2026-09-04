// CLASS-SIGNUP-V1: 공개 링크 기반 선착순 수강신청 (명단은 절대 공개하지 않음)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const action = clean(body?.action, 30);
    const token = clean(body?.token, 100);

    if (!token) return Response.json({ error: '잘못된 링크입니다.' }, { status: 400, headers: corsHeaders });

    const { data: event } = await supabase
      .from('signup_events')
      .select('id, title, description, is_open')
      .eq('share_token', token)
      .maybeSingle();

    if (!event) return Response.json({ error: '존재하지 않는 신청 링크입니다.' }, { status: 404, headers: corsHeaders });

    const loadSlots = async () => {
      const { data: slots } = await supabase
        .from('signup_slots')
        .select('id, slot_date, start_time, end_time, capacity, note, sort_order')
        .eq('event_id', event.id)
        .eq('is_active', true)
        .order('slot_date')
        .order('start_time');

      const ids = (slots || []).map((s) => s.id);
      const counts: Record<string, number> = {};
      if (ids.length) {
        const { data: entries } = await supabase
          .from('signup_entries')
          .select('slot_id')
          .in('slot_id', ids);
        for (const e of entries || []) counts[e.slot_id] = (counts[e.slot_id] || 0) + 1;
      }
      // 명단은 반환하지 않고 인원수만 반환
      return (slots || []).map((s) => ({ ...s, taken: counts[s.id] || 0 }));
    };

    if (action === 'get') {
      return Response.json(
        { event: { title: event.title, description: event.description, is_open: event.is_open }, slots: await loadSlots() },
        { headers: corsHeaders },
      );
    }

    if (action === 'apply') {
      if (!event.is_open) {
        return Response.json({ error: '신청이 마감되었습니다.' }, { status: 400, headers: corsHeaders });
      }
      const slotId = clean(body?.slot_id, 40);
      const name = clean(body?.student_name, 40);
      const grade = clean(body?.grade, 20);
      const phone = clean(body?.phone, 30).replace(/[^0-9]/g, '');
      const memo = clean(body?.memo, 300);

      if (name.length < 2 || phone.length < 10 || !slotId) {
        return Response.json({ error: '이름과 연락처를 정확히 입력해주세요.' }, { status: 400, headers: corsHeaders });
      }

      const { data: slot } = await supabase
        .from('signup_slots')
        .select('id, capacity, is_active, event_id')
        .eq('id', slotId)
        .maybeSingle();

      if (!slot || slot.event_id !== event.id || !slot.is_active) {
        return Response.json({ error: '선택한 시간대를 찾을 수 없습니다.' }, { status: 400, headers: corsHeaders });
      }

      const { count: before } = await supabase
        .from('signup_entries')
        .select('id', { count: 'exact', head: true })
        .eq('slot_id', slot.id);

      if ((before || 0) >= slot.capacity) {
        return Response.json({ error: '이미 정원이 마감된 시간대입니다.' }, { status: 409, headers: corsHeaders });
      }

      const { data: inserted, error: insErr } = await supabase
        .from('signup_entries')
        .insert({ slot_id: slot.id, student_name: name, grade: grade || null, phone, memo: memo || null })
        .select('id')
        .single();

      if (insErr) {
        if ((insErr as any).code === '23505') {
          return Response.json({ error: '이미 같은 시간대에 신청되어 있습니다.' }, { status: 409, headers: corsHeaders });
        }
        throw insErr;
      }

      // 동시 신청 방어: 정원 초과 시 방금 넣은 행 회수
      const { data: after } = await supabase
        .from('signup_entries')
        .select('id')
        .eq('slot_id', slot.id)
        .order('created_at')
        .limit(slot.capacity);

      const kept = (after || []).some((r) => r.id === inserted.id);
      if (!kept) {
        await supabase.from('signup_entries').delete().eq('id', inserted.id);
        return Response.json({ error: '거의 동시에 정원이 마감되었습니다. 다른 시간대를 선택해주세요.' }, { status: 409, headers: corsHeaders });
      }

      return Response.json({ ok: true, slots: await loadSlots() }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders });
  } catch (e) {
    console.error('class-signup error', e);
    return Response.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500, headers: corsHeaders });
  }
});
