// ═══════════════════════════════════════════════════════════════
// CHECK-ESCALATION — Supabase Edge Function
// Runs on a schedule (via pg_cron or Vercel Cron)
// Flags submissions with no response after 72 hours
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  try {
    // Use service role key for full access (never exposed to frontend)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the database function that handles escalation logic
    const { data, error } = await supabase.rpc("flag_escalated_submissions");

    if (error) {
      console.error("Escalation check error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const flaggedCount = data || 0;

    console.log(`Escalation check complete. Flagged: ${flaggedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        flagged_count: flaggedCount,
        checked_at: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
