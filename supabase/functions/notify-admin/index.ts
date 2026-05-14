// ═══════════════════════════════════════════════════════════════
// NOTIFY-ADMIN — Supabase Edge Function
// Triggered on new user reply to ensure admin is notified
// Can also be used as a webhook target for additional
// notification channels (email, Slack, etc.)
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: {
    id: string;
    submission_id: string;
    sender_role: string;
    message_body: string;
    is_read: boolean;
    sent_at: string;
  };
  schema: string;
  old_record: null | Record<string, unknown>;
}

serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the webhook payload
    const payload: WebhookPayload = await req.json();

    // Only process new messages from users
    if (
      payload.type !== "INSERT" ||
      payload.table !== "messages" ||
      payload.record.sender_role !== "user"
    ) {
      return new Response(
        JSON.stringify({ message: "Skipped — not a user message insert" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const submissionId = payload.record.submission_id;

    // Check if this is the first message (new submission) or a reply
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("id")
      .eq("submission_id", submissionId)
      .eq("sender_role", "user");

    if (msgError) {
      console.error("Error checking messages:", msgError);
    }

    // If there's more than one user message, this is a reply
    // (the first user message is created alongside the submission)
    const isReply = messages && messages.length > 1;

    if (isReply) {
      // Insert a user_reply notification
      const { error: notifError } = await supabase
        .from("admin_notifications")
        .insert({
          submission_id: submissionId,
          notification_type: "user_reply",
          is_read: false,
        });

      if (notifError) {
        console.error("Error inserting notification:", notifError);
        return new Response(
          JSON.stringify({ error: notifError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log(`User reply notification created for submission: ${submissionId}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        notification_created: isReply,
        submission_id: submissionId,
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
