---
name: Coupon cost source
description: The live coupon schema does not currently expose an auditable applied discount amount.
---

The live `coupons` table contains the discount percentage, configured cap, and lifecycle timestamps, but no monetary amount actually applied. Its `applied_to_payment_id` column has no foreign-key relationship to an existing financial table, and the available order/subscription payment identifiers do not provide a valid join for this purpose.

**Why:** The incentives dashboard must not calculate real cost from the raw percentage or treat the configured cap as the actual savings, especially for uncapped coupon types.

**How to apply:** Before implementing monthly coupon-cost reporting, identify or add an authoritative applied-discount source and verify its relationship to the coupon without assuming a new table or an invalid join.