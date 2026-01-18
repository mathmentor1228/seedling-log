import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v2.1-narrative-render: Direct edge function saver bypassing legacy DB RPC formatter
// REPORT-ENGINE-DEBUG-V1
const SCHEDULE_CONFIG = {
  schedule_text: 'Sat 22:00 KST',
  cron_utc: '0 13 * * 6',
};

const TEMPLATE_VERSION = 'v2.1-narrative-render';

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
  let useDirectSave = false; // New flag: bypass DB RPC, save directly
  
  try {
    const body = await req.json().catch(() => ({}));
    isManual = body.manual === true;
    includeDebug = body.include_debug === true;
    studentIds = body.student_ids || null;
    customWeekStart = body.week_start || null;
    customWeekEnd = body.week_end || null;
    useDirectSave = body.direct_save === true; // Frontend can request direct save
  } catch {
    // Ignore JSON parse errors
  }

  const scope = studentIds && studentIds.length > 0 ? 'selected' : 'all';
  const schedulerSource = isManual ? 'manual' : 'pg_cron';
  console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: Starting ${schedulerSource} weekly report generation`);
  console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: source=edge_function, scope=${scope}, count=${studentIds?.length || 'all'}, direct_save=${useDirectSave}`);
  console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: file=supabase/functions/generate-weekly-reports/index.ts templateVersion=${TEMPLATE_VERSION}`);

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
    console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: Generating for week: ${weekStart} to ${weekEnd}, scope=${scope}, count=${studentCount}, direct_save=${useDirectSave}`);

    // Load template version for debug info
    let templateVersion = TEMPLATE_VERSION;
    try {
      const { data: templates } = await supabase
        .from('report_templates')
        .select('version')
        .eq('template_name', 'parent')
        .eq('is_active', true)
        .limit(1);
      if (templates?.[0]?.version) {
        templateVersion = templates[0].version;
      }
      console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: DB templateVersion=${templateVersion}`);
    } catch (e) {
      console.error(`[generate-weekly-reports] REPORT_GEN_DEBUG: Failed to load template version`, e);
    }

    // ============================================================
    // DIRECT SAVE MODE: Bypass legacy DB RPC, generate & save here
    // ============================================================
    if (useDirectSave) {
      console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: Using DIRECT SAVE mode (bypassing DB RPC)`);
      
      // Fetch students to generate for
      let studentsToGenerate: { id: string; name: string }[] = [];
      
      if (studentIds && studentIds.length > 0) {
        const { data: students } = await supabase
          .from('students')
          .select('id, name')
          .in('id', studentIds);
        studentsToGenerate = students || [];
      } else {
        // Get all active students
        const { data: students } = await supabase
          .from('students')
          .select('id, name')
          .or('status.is.null,status.neq.inactive');
        studentsToGenerate = students || [];
      }

      console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: Processing ${studentsToGenerate.length} students in direct save mode`);

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const student of studentsToGenerate) {
        try {
          console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: Generating for ${student.name} (${student.id})`);
          
          // Call generate-ai-report edge function
          const { data: aiReportData, error: aiError } = await supabase.functions.invoke('generate-ai-report', {
            body: {
              student_id: student.id,
              student_name: student.name,
              week_start: weekStart,
              week_end: weekEnd,
            },
          });

          if (aiError) {
            console.error(`[generate-weekly-reports] AI report error for ${student.name}:`, aiError);
            errorCount++;
            errors.push(`${student.name}: ${aiError.message}`);
            continue;
          }

          // Get lesson count for this student
          const { data: lessons } = await supabase
            .from('lesson_records')
            .select('id, subject, understanding_score, homework_status')
            .eq('student_id', student.id)
            .gte('lesson_date', weekStart)
            .lte('lesson_date', weekEnd)
            .eq('submitted', true);

          const lessonCount = lessons?.length || 0;
          
          // Calculate stats
          let avgUnderstanding: number | null = null;
          let homeworkCompletionRate: number | null = null;
          const commonIssues: string[] = [];
          
          if (lessons && lessons.length > 0) {
            const scores = lessons.map(l => l.understanding_score).filter(s => s !== null);
            if (scores.length > 0) {
              avgUnderstanding = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            }
            
            const homeworkDone = lessons.filter(l => l.homework_status === 'done' || l.homework_status === 'done_all').length;
            homeworkCompletionRate = Math.round((homeworkDone / lessons.length) * 100);
          }

          // Determine risk level
          let riskLevel = aiReportData?.risk_level || 'low';
          if (lessonCount === 0) {
            riskLevel = null;
          }

          // Build debug_info string
          const debugInfoStr = aiReportData?.debug_info || 
            `[REPORT_ENGINE_DEBUG] source=edge_function templateVersion=${TEMPLATE_VERSION} formatter=direct_save validator=unknown retries=0`;

          // Upsert report directly to DB
          const { error: upsertError } = await supabase
            .from('weekly_reports')
            .upsert({
              student_id: student.id,
              week_start: weekStart,
              week_end: weekEnd,
              total_lessons: lessonCount,
              avg_understanding: avgUnderstanding,
              homework_completion_rate: homeworkCompletionRate,
              common_issues: commonIssues,
              risk_level: riskLevel,
              summary: aiReportData?.draft_status || 'generated',
              parent_message: aiReportData?.parent_message || null,
              student_message: aiReportData?.student_message || null,
              generated_at: new Date().toISOString(),
              debug_info: debugInfoStr,
            }, {
              onConflict: 'student_id,week_start,week_end',
            });

          if (upsertError) {
            console.error(`[generate-weekly-reports] Upsert error for ${student.name}:`, upsertError);
            errorCount++;
            errors.push(`${student.name}: ${upsertError.message}`);
            continue;
          }

          successCount++;
          console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: Successfully saved report for ${student.name}`);
          
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : 'Unknown error';
          console.error(`[generate-weekly-reports] Error processing ${student.name}:`, errMsg);
          errorCount++;
          errors.push(`${student.name}: ${errMsg}`);
        }
      }

      // Log job result
      await supabase.from('weekly_jobs_log').insert({
        job_name: 'generate_weekly_reports',
        week_start: weekStart,
        week_end: weekEnd,
        status: errorCount === 0 ? 'completed' : 'partial',
        message: `Direct save: ${successCount} success, ${errorCount} errors`,
        scheduler_source: schedulerSource,
        schedule_text: SCHEDULE_CONFIG.schedule_text,
      });

      const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

      return new Response(
        JSON.stringify({
          success: errorCount === 0,
          weekStart,
          weekEnd,
          message: `Direct save: ${successCount} reports generated, ${errorCount} errors`,
          schedulerSource,
          scope,
          count: studentIds?.length || 'all',
          successCount,
          errorCount,
          errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
          _debug: {
            source: 'edge_function_direct_save',
            scope,
            count: studentIds?.length || 'all',
            templateVersion: TEMPLATE_VERSION,
            time: nowKST,
            handler: 'generate-weekly-reports/index.ts',
            mode: 'direct_save',
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: errorCount === 0 ? 200 : 207,
        }
      );
    }

    // ============================================================
    // LEGACY MODE: Use DB RPC (for scheduled runs)
    // ============================================================
    console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG: Using LEGACY DB RPC mode`);

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

    console.log('[generate-weekly-reports] REPORT_GEN_DEBUG: Reports generated successfully (legacy mode)');

    // Log success with schedule_text
    await supabase.from('weekly_jobs_log').insert({
      job_name: 'generate_weekly_reports',
      week_start: weekStart,
      week_end: weekEnd,
      status: 'completed',
      message: `Legacy mode completed at ${new Date().toISOString()}`,
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
        message: 'Weekly reports generated successfully (legacy mode)',
        schedulerSource,
        scope,
        count: studentIds?.length || 'all',
        // Debug info for admin
        _debug: {
          source: 'edge_function_legacy_rpc',
          scope,
          count: studentIds?.length || 'all',
          templateVersion,
          time: nowKST,
          handler: 'generate-weekly-reports/index.ts',
          mode: 'legacy_rpc',
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
