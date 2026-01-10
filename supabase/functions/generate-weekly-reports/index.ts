import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[generate-weekly-reports] Starting scheduled weekly report generation');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Use service role key to bypass RLS and call admin function
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate week dates (Monday to Saturday of current week)
    // Saturday 10:00 KST = Saturday 01:00 UTC
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
    
    const weekStart = mondayDate.toISOString().split('T')[0];
    const weekEnd = saturdayDate.toISOString().split('T')[0];

    console.log(`[generate-weekly-reports] Generating for week: ${weekStart} to ${weekEnd}`);

    // Generate reports using the scheduled function (no auth check)
    const { error: rpcError } = await supabase.rpc('generate_weekly_reports_scheduled', {
      _week_start: weekStart,
      _week_end: weekEnd,
    });

    if (rpcError) {
      console.error('[generate-weekly-reports] RPC error:', rpcError);
      
      // Log failure
      await supabase.from('weekly_jobs_log').insert({
        job_name: 'generate_weekly_reports',
        week_start: weekStart,
        week_end: weekEnd,
        status: 'failed',
        message: rpcError.message,
      });
      
      throw rpcError;
    }

    console.log('[generate-weekly-reports] Reports generated successfully');

    // Log success
    await supabase.from('weekly_jobs_log').insert({
      job_name: 'generate_weekly_reports',
      week_start: weekStart,
      week_end: weekEnd,
      status: 'completed',
      message: `Completed at ${new Date().toISOString()}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        weekStart,
        weekEnd,
        message: 'Weekly reports generated successfully',
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
