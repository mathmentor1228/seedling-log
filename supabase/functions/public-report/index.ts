import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const action = url.searchParams.get("action"); // 'generate' to create token

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Action: generate a share token for a report
    if (action === "generate" && req.method === "POST") {
      const { report_id } = await req.json();
      if (!report_id) {
        return new Response(JSON.stringify({ error: "report_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if token already exists
      const { data: existing } = await supabase
        .from("weekly_reports")
        .select("share_token")
        .eq("id", report_id)
        .single();

      if (existing?.share_token) {
        return new Response(
          JSON.stringify({ token: existing.share_token }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate new token
      const { data: tokenData } = await supabase.rpc("generate_share_token");
      const newToken = tokenData as string;

      const { error: updateError } = await supabase
        .from("weekly_reports")
        .update({ share_token: newToken })
        .eq("id", report_id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ token: newToken }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: view report by token (GET)
    if (!token) {
      return new Response(JSON.stringify({ error: "token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: report, error } = await supabase
      .from("weekly_reports")
      .select(`
        id, week_start, week_end, total_lessons,
        avg_understanding, homework_completion_rate,
        common_issues, summary, risk_level,
        parent_message, student_message,
        generated_at,
        students:student_id (name, school, grade, school_level, grade_year)
      `)
      .eq("share_token", token)
      .single();

    if (error || !report) {
      return new Response(
        JSON.stringify({ error: "리포트를 찾을 수 없습니다." }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
