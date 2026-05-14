-- ═══════════════════════════════════════════════════════════════
-- SCHEMA.SQL — 24/7 Virtual Suggestion Box
-- Full PostgreSQL Schema + RLS Policies + Indexes + Functions
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ═══════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════
-- TABLE: submissions
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.submissions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_token         TEXT NOT NULL UNIQUE,
  display_token           TEXT NOT NULL UNIQUE,
  is_anonymous            BOOLEAN NOT NULL DEFAULT true,
  submitter_name          TEXT,
  submitter_identifier_hash TEXT,
  category                TEXT NOT NULL CHECK (category IN (
                            'suggestion', 'harassment', 'safety',
                            'policy', 'general', 'other'
                          )),
  subject                 TEXT NOT NULL,
  message                 TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending', 'in_progress', 'resolved', 'escalated'
                          )),
  is_escalated            BOOLEAN NOT NULL DEFAULT false,
  escalation_flagged_at   TIMESTAMPTZ,
  ip_hash                 TEXT,
  submitted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_deadline       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  resolved_at             TIMESTAMPTZ
);

-- ═══════════════════════════════════════
-- TABLE: messages
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  sender_role     TEXT NOT NULL CHECK (sender_role IN ('user', 'admin')),
  message_body    TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════
-- TABLE: admin_notifications
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id     UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
                      'new_submission', 'user_reply', 'escalation_flag'
                    )),
  is_read           BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════
-- TABLE: rate_limit_log
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash      TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('submit', 'track')),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_submissions_reference_token ON public.submissions(reference_token);
CREATE INDEX IF NOT EXISTS idx_submissions_display_token ON public.submissions(display_token);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON public.submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_escalation ON public.submissions(is_escalated, status, response_deadline);
CREATE INDEX IF NOT EXISTS idx_messages_submission_id ON public.messages(submission_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON public.messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_notifications_submission_id ON public.admin_notifications(submission_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_hash ON public.rate_limit_log(ip_hash, action, attempted_at);

-- ═══════════════════════════════════════
-- ENABLE ROW LEVEL SECURITY
-- ═══════════════════════════════════════
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════
-- RLS POLICIES: submissions
-- ═══════════════════════════════════════

-- Public (anon): Can INSERT new submissions
CREATE POLICY "anon_insert_submissions"
  ON public.submissions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Public (anon): Can SELECT their own submission via display_token
-- (used by the RPC function, but also allows direct filtered select)
CREATE POLICY "anon_select_own_submission"
  ON public.submissions
  FOR SELECT
  TO anon
  USING (false); -- Direct table access blocked; use RPC instead

-- Authenticated (admin): Full SELECT on submissions
CREATE POLICY "admin_select_submissions"
  ON public.submissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated (admin): UPDATE submissions (status, escalation, etc.)
CREATE POLICY "admin_update_submissions"
  ON public.submissions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════
-- RLS POLICIES: messages
-- ═══════════════════════════════════════

-- Public (anon): Can INSERT messages with sender_role = 'user'
CREATE POLICY "anon_insert_messages"
  ON public.messages
  FOR INSERT
  TO anon
  WITH CHECK (sender_role = 'user');

-- Public (anon): Can SELECT messages (controlled via RPC)
CREATE POLICY "anon_select_messages"
  ON public.messages
  FOR SELECT
  TO anon
  USING (true);

-- Authenticated (admin): Full SELECT on messages
CREATE POLICY "admin_select_messages"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated (admin): INSERT messages (admin replies)
CREATE POLICY "admin_insert_messages"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated (admin): UPDATE messages (mark as read)
CREATE POLICY "admin_update_messages"
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════
-- RLS POLICIES: admin_notifications
-- ═══════════════════════════════════════

-- Public (anon): Can INSERT notifications (for new_submission, user_reply)
CREATE POLICY "anon_insert_notifications"
  ON public.admin_notifications
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Authenticated (admin): Full SELECT
CREATE POLICY "admin_select_notifications"
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated (admin): UPDATE (mark as read)
CREATE POLICY "admin_update_notifications"
  ON public.admin_notifications
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════
-- RLS POLICIES: rate_limit_log
-- ═══════════════════════════════════════

-- Public (anon): Can INSERT rate limit entries
CREATE POLICY "anon_insert_rate_limit"
  ON public.rate_limit_log
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Public (anon): Can SELECT rate limit entries (for checking)
CREATE POLICY "anon_select_rate_limit"
  ON public.rate_limit_log
  FOR SELECT
  TO anon
  USING (true);

-- ═══════════════════════════════════════
-- FUNCTION: get_submission_by_token
-- Securely returns a submission + validates by hashed token
-- Called via Supabase RPC from the frontend
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_submission_by_token(token_hash TEXT)
RETURNS SETOF public.submissions
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT *
  FROM public.submissions
  WHERE reference_token = token_hash
  LIMIT 1;
$$;

-- ═══════════════════════════════════════
-- FUNCTION: check_rate_limit
-- Returns true if the action is ALLOWED (under limit)
-- Returns false if rate limited (at or over limit)
-- Max 3 submissions per IP hash per hour
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_ip_hash TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  attempt_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO attempt_count
  FROM public.rate_limit_log
  WHERE ip_hash = p_ip_hash
    AND action = p_action
    AND attempted_at > (now() - INTERVAL '1 hour');

  RETURN attempt_count < 3;
END;
$$;

-- ═══════════════════════════════════════
-- FUNCTION: flag_escalated_submissions
-- Called by the Edge Function on a schedule
-- Flags pending submissions past their 72h deadline
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.flag_escalated_submissions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  flagged_count INTEGER := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id
    FROM public.submissions
    WHERE status = 'pending'
      AND response_deadline < now()
      AND is_escalated = false
  LOOP
    -- Update the submission
    UPDATE public.submissions
    SET is_escalated = true,
        escalation_flagged_at = now(),
        status = 'escalated'
    WHERE id = rec.id;

    -- Insert admin notification
    INSERT INTO public.admin_notifications (submission_id, notification_type, is_read)
    VALUES (rec.id, 'escalation_flag', false);

    flagged_count := flagged_count + 1;
  END LOOP;

  RETURN flagged_count;
END;
$$;

-- ═══════════════════════════════════════
-- ENABLE REALTIME on admin_notifications
-- (So the admin dashboard receives live updates)
-- ═══════════════════════════════════════
-- Run this in Supabase Dashboard > Database > Replication
-- Or use the following:
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;

-- ═══════════════════════════════════════
-- OPTIONAL: pg_cron for automatic escalation checks
-- Note: pg_cron is available on Supabase Pro plan
-- If not available, use the Edge Function + Vercel Cron
-- ═══════════════════════════════════════
-- SELECT cron.schedule(
--   'check-escalations',
--   '*/30 * * * *',  -- Every 30 minutes
--   $$ SELECT public.flag_escalated_submissions(); $$
-- );
