-- Driver suspension requests are separate from driver_appeals:
-- driver_appeals handles rejected registration/document appeals.
CREATE TABLE IF NOT EXISTS public.driver_suspension_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('suspend', 'lift')),
  reason       TEXT NOT NULL CHECK (reason IN ('truck_issue', 'medical', 'personal_leave', 'other')),
  reason_text  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES public.admin_users(user_id) ON DELETE SET NULL,
  CONSTRAINT driver_suspension_reason_text_check CHECK (
    (reason = 'other' AND reason_text IS NOT NULL)
    OR (reason <> 'other' AND reason_text IS NULL)
  )
);

ALTER TABLE public.driver_details
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.driver_details
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

ALTER TABLE public.driver_suspension_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_details ENABLE ROW LEVEL SECURITY;

-- Remove only policies introduced by this migration if it is re-run.
DROP POLICY IF EXISTS "driver_suspension_requests_owner_or_admin_read" ON public.driver_suspension_requests;
DROP POLICY IF EXISTS "driver_suspension_requests_owner_create" ON public.driver_suspension_requests;
DROP POLICY IF EXISTS "driver_suspension_requests_admin_update" ON public.driver_suspension_requests;
DROP POLICY IF EXISTS "driver_suspension_requests_admin_delete" ON public.driver_suspension_requests;
DROP POLICY IF EXISTS "driver_details_owner_or_admin_read_suspension" ON public.driver_details;
DROP POLICY IF EXISTS "driver_details_admin_update_suspension" ON public.driver_details;

CREATE POLICY "driver_suspension_requests_owner_or_admin_read"
  ON public.driver_suspension_requests FOR SELECT TO authenticated
  USING (
    driver_id = (SELECT auth.uid())::TEXT
    OR EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "driver_suspension_requests_owner_create"
  ON public.driver_suspension_requests FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = (SELECT auth.uid())::TEXT
    AND status = 'pending'
  );

CREATE POLICY "driver_suspension_requests_admin_update"
  ON public.driver_suspension_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "driver_suspension_requests_admin_delete"
  ON public.driver_suspension_requests FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.user_id = (SELECT auth.uid())
    )
  );

-- A driver may read their own suspension state; only an admin may change it.
CREATE POLICY "driver_details_owner_or_admin_read_suspension"
  ON public.driver_details FOR SELECT TO authenticated
  USING (
    driver_id = (SELECT auth.uid())::TEXT
    OR EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "driver_details_admin_update_suspension"
  ON public.driver_details FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE public.admin_users.user_id = (SELECT auth.uid())
    )
  );