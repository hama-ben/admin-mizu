-- Keep the origin of each coupon explicit so admin-gifted coupons can be
-- revoked without making wheel prizes removable.
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Coupons that existed before this migration were created by the wheel flow.
UPDATE public.coupons
SET source = 'wheel'
WHERE source IS NULL;

ALTER TABLE public.coupons
  ALTER COLUMN source SET DEFAULT 'wheel',
  ALTER COLUMN source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coupons_source_check'
      AND conrelid = 'public.coupons'::regclass
  ) THEN
    ALTER TABLE public.coupons
      ADD CONSTRAINT coupons_source_check CHECK (source IN ('wheel', 'admin_gift'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS coupons_source_used_at_idx
  ON public.coupons (source, used_at);