-- =============================================================
-- AL-SHAIBIA ADMIN PANEL — SUPABASE SCHEMA (FIXED)
-- Supabase Dashboard → SQL Editor → New Query → paste → Run
--
-- IMPORTANT: public.users already exists in this project with
-- id typed as TEXT (not UUID). All foreign key columns that
-- reference users.id are declared as TEXT to match.
-- Each new table's own PRIMARY KEY stays UUID / gen_random_uuid().
-- =============================================================


-- =============================================================
-- SECTION 1: TABLES
-- public.users already exists — skipped via IF NOT EXISTS.
-- All other tables are created in FK-safe order.
-- =============================================================

-- 1g. Platform interface availability.
-- disabled_since is managed by the trigger below. It is deliberately
-- preserved when an interface is re-enabled so a later compensation
-- process can consume the outage duration before clearing it.
CREATE TABLE IF NOT EXISTS public.platform_status (
  role           TEXT        PRIMARY KEY CHECK (role IN ('consumer', 'driver')),
  enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
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

-- 1a. Users — already exists, this is a no-op.
-- Shown here for reference only; IF NOT EXISTS prevents re-creation.
CREATE TABLE IF NOT EXISTS public.users (
  id          TEXT        PRIMARY KEY,
  full_name   TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('consumer', 'driver')),
  wilaya      TEXT,
  is_verified BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1b. Drivers
-- user_id is TEXT to match the existing users.id (TEXT) column.
CREATE TABLE IF NOT EXISTS public.drivers (
  user_id           TEXT        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  truck_photo_url   TEXT,
  license_photo_url TEXT,
  ccp_receipt_url   TEXT,
  ccp_status        TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (ccp_status IN ('pending', 'approved', 'rejected')),
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
  is_online         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1c. Orders
-- customer_id and driver_id are TEXT to match users.id.
-- orders.id keeps its own UUID primary key.
CREATE TABLE IF NOT EXISTS public.orders (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT           REFERENCES public.users(id) ON DELETE SET NULL,
  driver_id   TEXT           REFERENCES public.users(id) ON DELETE SET NULL,
  details     TEXT           NOT NULL,
  price       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status      TEXT           NOT NULL DEFAULT 'Pending'
                             CHECK (status IN ('Pending', 'Completed', 'Cancelled', 'Rejected')),
  wilaya      TEXT,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- 1d. Payments
-- driver_id is TEXT to match users.id.
-- payments.id keeps its own UUID primary key.
CREATE TABLE IF NOT EXISTS public.payments (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   TEXT           REFERENCES public.users(id) ON DELETE SET NULL,
  amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  receipt_url TEXT,
  status      TEXT           NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- 1e. Announcements — no FK, no change needed.
CREATE TABLE IF NOT EXISTS public.announcements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  badge_type      TEXT        NOT NULL CHECK (badge_type IN ('Info', 'Warning', 'Success', 'Promo')),
  target_audience TEXT        NOT NULL CHECK (target_audience IN ('Everyone', 'Drivers', 'Consumers')),
  message         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1f. Ratings & Disputes
-- driver_id is TEXT to match users.id.
CREATE TABLE IF NOT EXISTS public.ratings_disputes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id  TEXT        REFERENCES public.users(id) ON DELETE SET NULL,
  rating     INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  wilaya     TEXT,
  status     TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================
-- SECTION 2: ROW LEVEL SECURITY (RLS)
-- Full access granted to the anon role (used by the dashboard
-- via VITE_SUPABASE_ANON_KEY). ALTER … ENABLE is idempotent.
-- =============================================================

ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_status   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_anon_all_platform_status" ON public.platform_status;
DROP POLICY IF EXISTS "platform_status_public_read" ON public.platform_status;
DROP POLICY IF EXISTS "platform_status_admin_write" ON public.platform_status;

-- users
CREATE POLICY "admin_anon_all_users"
  ON public.users FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- drivers
CREATE POLICY "admin_anon_all_drivers"
  ON public.drivers FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- orders
CREATE POLICY "admin_anon_all_orders"
  ON public.orders FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- payments
CREATE POLICY "admin_anon_all_payments"
  ON public.payments FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- announcements
CREATE POLICY "admin_anon_all_announcements"
  ON public.announcements FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- ratings_disputes
CREATE POLICY "admin_anon_all_disputes"
  ON public.ratings_disputes FOR ALL TO anon
  USING (true) WITH CHECK (true);

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

-- 1h. Driver suspension requests.
-- This is separate from driver_appeals, which handles rejected registration
-- and document appeals.
CREATE TABLE IF NOT EXISTS public.driver_suspension_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('suspend', 'lift')),
  reason       TEXT NOT NULL CHECK (reason IN ('truck_issue', 'medical', 'personal_leave', 'other')),
  reason_text  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  TEXT REFERENCES public.admin_users(user_id) ON DELETE SET NULL,
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
  WITH CHECK (driver_id = (SELECT auth.uid())::TEXT AND status = 'pending');

CREATE POLICY "driver_suspension_requests_admin_update"
  ON public.driver_suspension_requests FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE public.admin_users.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE public.admin_users.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "driver_suspension_requests_admin_delete"
  ON public.driver_suspension_requests FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE public.admin_users.user_id = (SELECT auth.uid())
  ));

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
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE public.admin_users.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE public.admin_users.user_id = (SELECT auth.uid())
  ));


-- =============================================================
-- SECTION 3: REALTIME PUBLICATION
-- Enables live subscriptions on Dashboard, Driver Queue,
-- Orders, and Payments pages.
-- If a table is already in the publication, Supabase will
-- return a harmless "already exists" notice — not an error.
-- =============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;


-- =============================================================
-- SECTION 4: STORAGE BUCKETS & POLICIES
-- driver-documents  — truck photos, license photos, CCP receipts
-- receipts          — standalone payment receipt uploads
-- Both public so the dashboard can display images without auth.
-- ON CONFLICT DO NOTHING makes bucket INSERTs safe to re-run.
-- =============================================================

INSERT INTO storage.buckets (id, name, public)
  VALUES ('driver-documents', 'driver-documents', true)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('receipts', 'receipts', true)
  ON CONFLICT (id) DO NOTHING;

-- driver-documents policies
CREATE POLICY "anon_upload_driver_documents"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'driver-documents');

CREATE POLICY "anon_read_driver_documents"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'driver-documents');

CREATE POLICY "anon_update_driver_documents"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'driver-documents');

-- receipts policies
CREATE POLICY "anon_upload_receipts"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "anon_read_receipts"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'receipts');

CREATE POLICY "anon_update_receipts"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'receipts');
