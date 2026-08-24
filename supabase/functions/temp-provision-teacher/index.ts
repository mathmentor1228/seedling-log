import { createClient } from 'jsr:@supabase/supabase-js@2';

const GUARD = 'q7Xz2Lp9Vt4Mh8Rn3Kw6Ba1Cd5Ye0Zf';

Deno.serve(async (req) => {
  if (req.headers.get('x-provision-guard') !== GUARD) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { email, password, full_name, role, assigned_subject } = await req.json();

  let userId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  });
  if (createErr) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users.find((u: any) => u.email === email);
    if (!existing) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400 });
    }
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
  } else {
    userId = created.user!.id;
  }

  await admin.from('profiles').upsert({
    id: userId, email, full_name, is_active: true, assigned_subject: assigned_subject ?? null,
  });
  await admin.from('user_roles').upsert({ user_id: userId, role }, { onConflict: 'user_id,role' });

  return new Response(JSON.stringify({ ok: true, user_id: userId }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
