import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type UploadExamFileBody = {
  secret?: string;
  bucket?: string;
  path?: string;
  content?: string;
  mime_type?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeBase64(content: string): Uint8Array {
  const base64 = content.includes(",") ? content.split(",").pop() ?? "" : content;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const uploadSecret = Deno.env.get("UPLOAD_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!uploadSecret || !supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration is missing" }, 500);
    }

    const body = (await req.json()) as UploadExamFileBody;
    const { secret, bucket, path, content, mime_type } = body;

    if (secret !== uploadSecret) {
      return jsonResponse({ error: "Invalid secret" }, 401);
    }

    if (!bucket || !path || !content || !mime_type) {
      return jsonResponse(
        { error: "bucket, path, content, and mime_type are required" },
        400,
      );
    }

    const decodedContent = decodeBase64(content);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, decodedContent, {
        contentType: mime_type,
        upsert: true,
      });

    if (uploadError) {
      return jsonResponse({ error: uploadError.message }, 400);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);

    return jsonResponse({ publicUrl: data.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
