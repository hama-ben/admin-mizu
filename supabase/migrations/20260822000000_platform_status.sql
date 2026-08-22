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
CREATE POLICY "admin_anon_all_platform_status"
  ON public.platform_status FOR ALL TO anon
  USING (true) WITH CHECK (true);