import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NOTION_API_KEY = Deno.env.get("NOTION_API_KEY");
    if (!NOTION_API_KEY) {
      throw new Error("NOTION_API_KEY is not configured");
    }

    const { pageId } = await req.json();
    if (!pageId) {
      return new Response(JSON.stringify({ error: "pageId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all blocks from the page (handles pagination)
    const blocks: any[] = [];
    let cursor: string | undefined;
    do {
      const url = `${NOTION_API_URL}/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_VERSION,
        },
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error("Notion API error:", res.status, errBody);
        throw new Error(`Notion API error: ${res.status}`);
      }

      const data = await res.json();
      blocks.push(...data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    // Also fetch page metadata for title
    const pageRes = await fetch(`${NOTION_API_URL}/pages/${pageId}`, {
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": NOTION_VERSION,
      },
    });

    let pageTitle = "";
    if (pageRes.ok) {
      const pageData = await pageRes.json();
      const titleProp = pageData.properties?.title || pageData.properties?.["Name"];
      if (titleProp?.title) {
        pageTitle = titleProp.title.map((t: any) => t.plain_text).join("");
      }
    }

    return new Response(JSON.stringify({ blocks, pageTitle }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in notion-proxy:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
