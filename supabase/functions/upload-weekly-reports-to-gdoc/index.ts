import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_docs/v1";

interface ReportRow {
  student_id: string;
  parent_message: string | null;
  parent_sent_at: string | null;
  students: { name: string | null; grade: string | null } | null;
}

function buildBody(weekStart: string, weekEnd: string, reports: ReportRow[]) {
  const lines: string[] = [];
  lines.push(`주간 학부모 코멘트 — ${weekStart} ~ ${weekEnd}`);
  lines.push(`총 ${reports.length}명 · 최종 갱신 ${new Date().toLocaleString("ko-KR")}`);
  lines.push("");
  lines.push("");

  for (const r of reports) {
    const name = r.students?.name ?? "(이름 없음)";
    const grade = r.students?.grade ? `[${r.students.grade}] ` : "";
    lines.push(`${grade}${name}`);
    lines.push("─────────────────────────────");
    lines.push((r.parent_message ?? "(코멘트 없음)").trim());
    lines.push("");
    lines.push("");
  }
  return lines.join("\n");
}

async function gdocs(path: string, init: RequestInit = {}) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const apiKey = Deno.env.get("GOOGLE_DOCS_API_KEY");
  if (!lovableKey || !apiKey) throw new Error("Missing connector credentials");

  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Docs API ${res.status}: ${body}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { week_start, week_end } = await req.json();
    if (!week_start || !week_end) {
      return new Response(JSON.stringify({ error: "week_start and week_end required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch reports that have been published to parents this week
    const { data: reports, error } = await supabase
      .from("weekly_reports")
      .select("student_id, parent_message, parent_sent_at, students:student_id(name, grade)")
      .eq("week_start", week_start)
      .eq("week_end", week_end)
      .eq("parent_visible", true)
      .not("parent_message", "is", null);

    if (error) throw error;
    const rows = (reports ?? []) as unknown as ReportRow[];

    // Sort by grade then name
    rows.sort((a, b) => {
      const ga = a.students?.grade ?? "";
      const gb = b.students?.grade ?? "";
      if (ga !== gb) return ga.localeCompare(gb, "ko");
      return (a.students?.name ?? "").localeCompare(b.students?.name ?? "", "ko");
    });

    const docTitle = `주간 학부모 코멘트 ${week_start} ~ ${week_end}`;
    const bodyText = buildBody(week_start, week_end, rows);

    // Lookup or create the doc
    const { data: existing } = await supabase
      .from("weekly_report_gdocs")
      .select("document_id, document_url")
      .eq("week_start", week_start)
      .maybeSingle();

    let documentId = existing?.document_id;
    let documentUrl = existing?.document_url;

    if (!documentId) {
      const created = await gdocs("/documents", {
        method: "POST",
        body: JSON.stringify({ title: docTitle }),
      });
      documentId = created.documentId;
      documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
    }

    // Get current length to wipe existing content
    const doc = await gdocs(`/documents/${documentId}`);
    const contentArr = doc.body?.content ?? [];
    const endIndex = contentArr.length > 0
      ? contentArr[contentArr.length - 1].endIndex ?? 1
      : 1;

    const requests: unknown[] = [];
    if (endIndex > 2) {
      requests.push({
        deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } },
      });
    }
    requests.push({ insertText: { location: { index: 1 }, text: bodyText } });

    await gdocs(`/documents/${documentId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });

    await supabase
      .from("weekly_report_gdocs")
      .upsert({
        week_start,
        document_id: documentId,
        document_url: documentUrl,
        last_uploaded_at: new Date().toISOString(),
        last_student_count: rows.length,
      });

    return new Response(
      JSON.stringify({ ok: true, documentId, documentUrl, count: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("upload-weekly-reports-to-gdoc error", err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
