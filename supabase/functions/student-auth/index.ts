 // STUDENT-APP-V1: Student authentication via student_code + PIN
 import { createClient } from 'npm:@supabase/supabase-js@2';
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
 // Simple hash function for PIN (in production, use proper bcrypt)
 async function hashPin(pin: string): Promise<string> {
   const encoder = new TextEncoder();
   const data = encoder.encode(pin + 'student-salt-v1');
   const hashBuffer = await crypto.subtle.digest('SHA-256', data);
   const hashArray = Array.from(new Uint8Array(hashBuffer));
   return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
 }
 
 Deno.serve(async (req) => {
   // Handle CORS preflight
   if (req.method === 'OPTIONS') {
     return new Response('ok', { headers: corsHeaders });
   }
 
   try {
     const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
     const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
     
     const supabase = createClient(supabaseUrl, supabaseServiceKey);
     
     const { action, student_code, pin, student_id } = await req.json();
     
     if (action === 'login') {
       // Login: Verify student_code and PIN
       if (!student_code || !pin) {
         return new Response(
           JSON.stringify({ error: '학생 코드와 PIN을 입력해주세요.' }),
           { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       // Find student by code
       const { data: student, error: studentError } = await supabase
         .from('students')
         .select('id, name, student_code, grade, school')
         .eq('student_code', student_code.toUpperCase())
         .single();
       
       if (studentError || !student) {
         return new Response(
           JSON.stringify({ error: '학생 코드를 찾을 수 없습니다.' }),
           { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       // Check if student has an account
       const { data: account, error: accountError } = await supabase
         .from('student_accounts')
         .select('id, pin_hash')
         .eq('student_id', student.id)
         .single();
       
       if (accountError || !account) {
         return new Response(
           JSON.stringify({ error: '학생 계정이 없습니다. 관리자에게 문의하세요.' }),
           { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       // Verify PIN
       const pinHash = await hashPin(pin);
       if (account.pin_hash !== pinHash) {
         return new Response(
           JSON.stringify({ error: 'PIN이 올바르지 않습니다.' }),
           { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       // Update last login
       await supabase
         .from('student_accounts')
         .update({ last_login_at: new Date().toISOString() })
         .eq('id', account.id);
       
       // Generate session token (simple JWT-like token)
       const sessionToken = crypto.randomUUID();
       const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
       
       return new Response(
         JSON.stringify({
           success: true,
           student: {
             id: student.id,
             name: student.name,
             student_code: student.student_code,
             grade: student.grade,
             school: student.school,
           },
           session: {
             token: sessionToken,
             expires_at: expiresAt,
           },
         }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
       
     } else if (action === 'register') {
       // Register: Create new student account with PIN
       if (!student_id || !pin) {
         return new Response(
           JSON.stringify({ error: '학생 ID와 PIN이 필요합니다.' }),
           { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       // Validate PIN format (4-6 digits)
       if (!/^\d{4,6}$/.test(pin)) {
         return new Response(
           JSON.stringify({ error: 'PIN은 4-6자리 숫자여야 합니다.' }),
           { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       // Check if account already exists
       const { data: existing } = await supabase
         .from('student_accounts')
         .select('id')
         .eq('student_id', student_id)
         .single();
       
       if (existing) {
         return new Response(
           JSON.stringify({ error: '이미 계정이 존재합니다.' }),
           { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       // Create account
       const pinHash = await hashPin(pin);
       const { error: createError } = await supabase
         .from('student_accounts')
         .insert({
           student_id,
           pin_hash: pinHash,
         });
       
       if (createError) {
         console.error('Create account error:', createError);
         return new Response(
           JSON.stringify({ error: '계정 생성에 실패했습니다.' }),
           { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       return new Response(
         JSON.stringify({ success: true, message: '계정이 생성되었습니다.' }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
       
     } else if (action === 'reset_pin') {
       // Reset PIN (admin only - requires valid auth header)
       const authHeader = req.headers.get('Authorization');
       if (!authHeader) {
         return new Response(
           JSON.stringify({ error: '인증이 필요합니다.' }),
           { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       // Verify admin/assistant role
       const token = authHeader.replace('Bearer ', '');
       const { data: { user }, error: authError } = await supabase.auth.getUser(token);
       
       if (authError || !user) {
         return new Response(
           JSON.stringify({ error: '인증에 실패했습니다.' }),
           { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       // Check if user is admin or assistant
       const { data: roles } = await supabase
         .from('user_roles')
         .select('role')
         .eq('user_id', user.id);
       
       const isAdminOrAssistant = roles?.some(r => r.role === 'admin' || r.role === 'assistant');
       if (!isAdminOrAssistant) {
         return new Response(
           JSON.stringify({ error: '권한이 없습니다.' }),
           { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       if (!student_id || !pin) {
         return new Response(
           JSON.stringify({ error: '학생 ID와 새 PIN이 필요합니다.' }),
           { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       // Validate PIN format
       if (!/^\d{4,6}$/.test(pin)) {
         return new Response(
           JSON.stringify({ error: 'PIN은 4-6자리 숫자여야 합니다.' }),
           { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       const pinHash = await hashPin(pin);
       
       // Upsert account with new PIN
       const { error: upsertError } = await supabase
         .from('student_accounts')
         .upsert({
           student_id,
           pin_hash: pinHash,
           updated_at: new Date().toISOString(),
         }, {
           onConflict: 'student_id',
         });
       
       if (upsertError) {
         console.error('Reset PIN error:', upsertError);
         return new Response(
           JSON.stringify({ error: 'PIN 재설정에 실패했습니다.' }),
           { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
       
       return new Response(
         JSON.stringify({ success: true, message: 'PIN이 재설정되었습니다.' }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
     
     return new Response(
       JSON.stringify({ error: '알 수 없는 액션입니다.' }),
       { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
     
   } catch (error) {
     console.error('Student auth error:', error);
     return new Response(
       JSON.stringify({ error: '서버 오류가 발생했습니다.' }),
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
   }
 });