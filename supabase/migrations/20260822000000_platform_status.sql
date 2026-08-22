-- Platform availability controls for consumer and driver interfaces.
CREATE TABLE IF NOT EXISTS public.platform_status (
  role           TEXT PRIMARY KEY CHECK (role IN ('consumer', 'driver')),
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  message        TEXT,
  disabled_since TIMESTAMPTZ
);

INSERT INTO public.platform_status (role, enabled)
VALUES ('consumer', TRUE), ('driver', TRUE)
ON CONFLICT (role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_platform_disabled_since()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.enabled = TRUE AND NEW.enabled = FALSE THEN
    NEW.disabled_since := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_status_disabled_since ON public.platform_status;
CREATE TRIGGER platform_status_disabled_since
  BEFORE UPDATE OF enabled ON public.platform_status
  FOR EACH ROW
  EXECUTE FUNCTION public.set_platform_disabled_since();

ALTER TABLE public.platform_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_anon_all_platform_status" ON public.platform_status;
DROP POLICY IF EXISTS "platform_status_public_read" ON public.platform_status;
DROP POLICY IF EXISTS "platform_status_admin_write" ON public.platform_status;

-- Both the public apps and the authenticated admin panel must be able to read
-- the current status. Only an authenticated Supabase user listed in the same
-- admin_users allowlist used by the admin panel may write.
CREATE POLICY "platform_status_public_read"
  ON public.platform_status FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "platform_status_admin_write"
  ON public.platform_status FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE public.admin_users.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE public.admin_users.user_id = (SELECT auth.uid())
    )
  );