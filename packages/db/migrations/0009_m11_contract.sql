-- M11 CP1 contract (decision #93; expand -> deploy -> contract). Both were unused by the code
-- already running on staging (release 1, PR #77):
-- - the global unique on orders.idempotency_key: keys are unique per shop since 0007 (#84 a);
-- - profiles.is_admin: no back office since #72; nothing has read it since #82 f.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "is_admin";
