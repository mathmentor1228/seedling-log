import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// WEEKLY-SCHED-VERIFY-V1: Schedule configuration
const SCHEDULE_CONFIG = {
  schedule_text: 'Sat 22:00 KST',
  cron_utc: '0 13 * * 6',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let isManual = false;
  let includeDebug = false;
  let studentIds: string[] | null = null;
  let customWeekStart: string | null = null;
  let customWeekEnd: string | null = null;
  
  try {
    const body = await req.json().catch(() => ({}));
    isManual = body.manual === true;
    includeDebug = body.include_debug === true;
    studentIds = body.student_ids || null;
    customWeekStart = body.week_start || null;
    customWeekEnd = body.week_end || null;
  } catch {
    // Ignore JSON parse errors
  }

  const scope = studentIds && studentIds.length > 0 ? 'selected' : 'all';
  const schedulerSource = isManual ? 'manual' : 'pg_cron';
  console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: Starting ${schedulerSource} weekly report generation`);
  console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: source=edge_function, scope=${scope}, count=${studentIds?.length || 'all'}`);
  console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: file=supabase/functions/generate-weekly-reports/index.ts`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Use service role key to bypass RLS and call admin function
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate week dates (Monday to Saturday of current week)
    // Or use custom dates if provided
    let weekStart: string;
    let weekEnd: string;
    
    if (customWeekStart && customWeekEnd) {
      weekStart = customWeekStart;
      weekEnd = customWeekEnd;
    } else {
      // Saturday 22:00 KST = Saturday 13:00 UTC
      const now = new Date();
      
      // Get KST time
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstNow = new Date(now.getTime() + kstOffset);
      
      // Find Monday of current week
      const dayOfWeek = kstNow.getUTCDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const mondayDate = new Date(kstNow);
      mondayDate.setUTCDate(mondayDate.getUTCDate() - daysFromMonday);
      mondayDate.setUTCHours(0, 0, 0, 0);
      
      // Saturday is Monday + 5
      const saturdayDate = new Date(mondayDate);
      saturdayDate.setUTCDate(saturdayDate.getUTCDate() + 5);
      
      weekStart = mondayDate.toISOString().split('T')[0];
      weekEnd = saturdayDate.toISOString().split('T')[0];
    }

    const studentCount = studentIds?.length || 'all';
    console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: Generating for week: ${weekStart} to ${weekEnd}, scope=${scope}, count=${studentCount}`);

    // Load template version for debug info
    let templateVersion = 'unknown';
    try {
      const { data: templates } = await supabase
        .from('report_templates')
        .select('version')
        .eq('template_name', 'parent')
        .eq('is_active', true)
        .limit(1);
      templateVersion = templates?.[0]?.version || 'no_active_template';
      console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: templateVersion=${templateVersion}`);
    } catch (e) {
      console.error(`[generate-weekly-reports] REPORT_GEN_DEBUG: Failed to load template version`, e);
    }

    // Generate reports using the scheduled function (no auth check)
    // Pass student_ids if provided for selective generation
    const rpcParams: Record<string, unknown> = {
      _week_start: weekStart,
      _week_end: weekEnd,
    };
    if (studentIds && studentIds.length > 0) {
      rpcParams._student_ids = studentIds;
    }
    
    const { error: rpcError } = await supabase.rpc('generate_weekly_reports_scheduled', rpcParams);

    if (rpcError) {
      console.error('[generate-weekly-reports] RPC error:', rpcError);
      
      // Log failure with schedule_text
      await supabase.from('weekly_jobs_log').insert({
        job_name: 'generate_weekly_reports',
        week_start: weekStart,
        week_end: weekEnd,
        status: 'failed',
        message: rpcError.message,
        scheduler_source: schedulerSource,
        schedule_text: SCHEDULE_CONFIG.schedule_text,
      });
      
      throw rpcError;
    }

    console.log('[generate-weekly-reports] REPORT_GEN_DEBUG: Reports generated successfully');

    // Log success with schedule_text
    await supabase.from('weekly_jobs_log').insert({
      job_name: 'generate_weekly_reports',
      week_start: weekStart,
      week_end: weekEnd,
      status: 'completed',
      message: `Completed at ${new Date().toISOString()}`,
      scheduler_source: schedulerSource,
      schedule_text: SCHEDULE_CONFIG.schedule_text,
    });

    // Generate KST timestamp for debug
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

    return new Response(
      JSON.stringify({
        success: true,
        weekStart,
        weekEnd,
        message: 'Weekly reports generated successfully',
        schedulerSource,
        scope,
        count: studentIds?.length || 'all',
        // Debug info for admin
        _debug: {
          source: 'edge_function',
          scope,
          count: studentIds?.length || 'all',
          templateVersion,
          time: nowKST,
          handler: 'generate-weekly-reports/index.ts',
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-weekly-reports] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});