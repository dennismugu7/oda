# Data model (Postgres on Neon)

This is a starting design. Claude Code may refine it (indexes, constraints, naming), but must record any structural change in `decisions.md`.
Conventions: `id uuid pk default gen_random_uuid()`, `created_at`/`updated_at timestamptz`, money is `integer` KES, phones are `text` in E.164, soft delete via `deleted_at` where noted. Schema and migrations are defined with **Drizzle ORM** in `packages/db`. Auth tables (`auth_user`, `auth_session`, `auth_account`, `auth_verification`, uuid ids) belong to **Better Auth**; `profiles.id` references `auth_user.id`. Schema refinements made while building (keys, guards, same-shop foreign keys, aggregates) are listed in decision #34.

## Accounts & shops

**signup_attempts**: sign-ups in progress (decision #49). Nothing exists in `auth_user` until the code is entered.
- `id` (the attempt id: returned only to the phone that started it, never emailed), `email` (lowercase), `password_hash` (Better Auth's hash of the password chosen in this attempt), `code_hash` (HMAC-SHA256 of `{id}:{code}`, keyed from the server secret; null until a code is sent), `code_expires_at` (10 min), `code_attempts` (max 3 wrong), `last_sent_at` (60 s cooldown per email), `created_at`
- Verify locks the attempt (`SELECT … FOR UPDATE`, plus a per-email advisory lock) and, in one transaction, creates `auth_user` (verified), the credential `auth_account` with this attempt's `password_hash`, and `profiles`, then deletes this attempt. Any other attempt for the email is refused ("already has a shop") and deleted when it is used. Attempts older than 7 days are deleted lazily on each sign-up start (batches of 100) and by `/api/cron/purge` (M8). Indexes: `email`, `created_at`.

**profiles**: one per auth user
- `id` (= Better Auth `user.id`), `first_name`, `last_name`, `recovery_phone`, `is_admin bool default false`, `expo_push_tokens text[]`, `onboarding_draft jsonb` (answers to onboarding steps 1–2 before the shop row exists: `{ step: 1–3 (next step to show), businessType?, channels? }`, decision #51), `deleted_at`

**shops**: one per seller in v1
- `id`, `owner_id → profiles`, `name`, `slug unique`, `logo_path`, `about`, `location_label` (for example "Kilimani, Nairobi"), `business_type` (enum: fashion, shoes_bags, beauty_hair, food_drinks, phones_electronics, home_decor, baby_kids, other), `channels text[]`, `whatsapp_phone`, `calls_enabled bool`, `tiktok_handle`, `instagram_handle`
- `accepts_pay_before bool default true`, `accepts_pay_on_delivery bool default false` (check: at least one true)
- `pickup_enabled bool`, `pickup_location`, `pickup_hours`, `free_delivery_threshold int null`
- `is_paused bool`, `suspended_at`, `deleted_at` (public page 404s immediately; purged after 30 days), `onboarding_step int` (steps 4–6; the row is created at step 3; steps 1–3 are tracked in `profiles.onboarding_draft`, decision #41), `onboarding_completed_at`, `checklist jsonb` (ticked items without their own data, e.g. `{shared_link: ts, tested_whatsapp: ts}`)
- `order_counter int default 1000`: the next order number is taken with `UPDATE shops SET order_counter = order_counter + 1 … RETURNING` inside the order-insert transaction
- `rating_avg numeric`, `rating_count int`, `delivered_count int` (maintained by triggers)

**shop_slug_history**: `shop_id`, `old_slug unique`, `changed_at` → used for 301 redirects. A slug in this table can never be taken by another shop (the owner can reclaim their own).

**payment_accounts**
- `id`, `shop_id`, `type` (enum: till, pochi, paybill), `number`, `account_name` (the name M-Pesa shows the buyer before they enter their PIN), `is_active bool` (at most one active per shop: partial unique index)
- Paybill only: `account_ref_mode` (enum: fixed, order_number), `account_ref text null` (required when `fixed`, e.g. the seller's bank account number for a bank paybill)
- `verification_status` (enum: unverified, pending, verified, rejected), `verified_by`, `verified_at`, `verification_note`. Changing `type`, `number`, `account_ref` or `account_name` resets it to `pending` (trigger). **Unused since decision #72** (no verification, no badge); kept to avoid a migration.

**delivery_areas**: `id`, `shop_id`, `name`, `fee int`, `method` (rider, parcel), `eta_label`, `free_delivery_eligible bool`, `position int`, `deleted_at`

## Catalogue

**categories**: `id`, `shop_id`, `name`, `is_visible bool`, `position int`

**products**
- `id`, `shop_id`, `category_id null`, `name`, `description`, `price int`, `compare_at_price int null` (> price), `status` (enum: available, sold_out, hidden), `sizes text[]`, `colours jsonb` (`[{name, hex}]`), `units_sold int` (trigger; counts qty on orders currently in `confirmed`/`sent`/`delivered`, so a cancellation removes it), `rating_avg`, `rating_count`, `position int`, `deleted_at`
- Full-text search index on name + description.

**product_photos**: `id`, `product_id`, `object_key` (full ~1600px), `thumb_key` (~400px), keys in Cloudflare R2, `position int` (0 = cover), `width`, `height`. Both sizes are generated **on the device before upload** (no paid image-transformation service).

## Orders

**orders**
- `id`, `shop_id`, `number int` (unique per shop), `public_token text unique`, `idempotency_key text unique`
- `status` (see order-lifecycle.md), `payment_method` (enum: pay_before, pay_on_delivery), `payment_status` (enum: unpaid, claimed, paid, refund_due, refunded)
- Buyer snapshot: `buyer_name`, `buyer_phone`, `buyer_whatsapp bool`, `buyer_email null`
- Fulfilment: `fulfilment` (enum: delivery, pickup), `delivery_area_id null`, `delivery_area_name`, `address_text`, `sent_method` (rider, parcel, pickup), `rider_phone`
- Money: `subtotal`, `delivery_fee`, `total`
- Payment: `payment_account_snapshot jsonb` (type/number/name at order time), `mpesa_code null`, `paid_at`
- `source` (enum: wa, status, tt, ig, fb, qr, other, direct, manual)
- `cancel_reason` (enum: out_of_stock, buyer_asked, payment_not_received, cant_deliver, other, expired, buyer_cancelled), `cancel_note`, `cancelled_by` (buyer, seller, system)
- Timestamps per step: `placed_at`, `claimed_at`, `confirmed_at`, `sent_at`, `delivered_at`, `cancelled_at`, `refunded_at`; `awaiting_payment_since` (when it last entered `awaiting_payment`; the 48h auto-expire counts from it)

**order_items**: `id`, `order_id`, `product_id null`, `name_snapshot`, `size`, `colour`, `unit_price`, `qty`, `cover_path_snapshot`

**payment_claims**: history of submitted codes: `id`, `order_id`, `shop_id`, `mpesa_code`, `raw_message null`, `outcome` (pending, confirmed, not_found), `created_at`. Index `(shop_id, mpesa_code)` for the duplicate check.

**order_events**: audit log: `order_id`, `from_status`, `to_status`, `actor` (buyer, seller, system, admin), `meta jsonb`, `created_at`

## Reviews
**reviews**: `id`, `order_id unique`, `shop_id`, `buyer_display_name` ("Wanjiku K."), `rating 1-5`, `tags text[]`, `seller_reply`, `replied_at`, `created_at`, `editable_until`
**review_items**: `review_id`, `order_item_id` (together the primary key), `product_id`, `rating` (null = item not rated), `text`, `photo_path`

## Engagement & ops
**shop_visits_daily**: `shop_id`, `day date`, `source`, `visits int` (upsert; one visitor counted once per day via cookie)
**notifications**: `id`, `shop_id`, `type` (enum: new_order, payment_claimed, switched_to_pod, buyer_cancelled, order_expired, new_review), `order_id null`, `review_id null`, `title`, `body`, `read_at`, `created_at`
**feedback**: from sellers (emailed in the daily support digest; M8 adds a nullable `notified_at`, decision #72 b): `shop_id`, `kind` (idea, broken, confusing, love, problem), `message`, `screenshot_path`, `reply_on_whatsapp bool`, `status` (enum ticket_status: new, in_progress, closed), `admin_note`
**reports**: from buyers (daily support digest; M8 adds `notified_at`, decision #72 b): `order_id`, `message`, `contact_phone`, `status` (ticket_status), `admin_note`
**deletion_requests**: `email`, `shop_slug null`, `reason`, `status` (ticket_status), `processed_at`; self-serve from M8 (decision #72 c): adds `token_hash`, `expires_at`, `confirmed_at` (the emailed confirm link)
**ops_events** (planned, M10, decision #72 d): `id`, `action` (suspend, unsuspend), `shop_id`, `reason`, `actor` (the GitHub user who ran the workflow), `created_at`
**rate_limits** (Postgres table, fixed-window counter via an upsert function): `key`, `window_start`, `count`
**storage_deletions**: `object_key` (pk), `created_at`: stored files to delete (replaced or rejected photos/logos), queued in the same transaction that drops the reference; retried by `/api/cron/purge` (decision #52)

## File storage (Cloudflare R2)
R2 public access applies to a whole bucket, so public and private files live in separate buckets (decision #42). Per environment:
- **Public images bucket** (staging `oda-staging`): `products/{shop_id}/…`, `logos/{shop_id}/…`, `reviews/{order_id}/…`, read via the bucket's public URL / custom domain
- **Private feedback bucket** (M8): `feedback/{shop_id}/…`, read only through a short-lived signed URL in the support digest (decision #72 b)
- **Private backups bucket** (staging `oda-backups-staging`): the nightly encrypted `pg_dump` files
Each bucket has its own API token, scoped to that bucket.

Uploads: the client asks the API for a **presigned PUT URL** (`POST /api/uploads`; storage interface local / S3-compatible / disabled, byte checks incl. location data, `storage_deletions` queue for replaced files: decision #52). The API checks that the caller owns the shop (or holds the order token, for review photos), and enforces content type (JPEG/PNG/WebP) and max size (5 MB). The client uploads straight to R2, then saves the key through the API. Deleting a product/shop deletes its objects (directly, or via the purge job).

## Authorization (replaces database RLS)
- The database is reachable **only from the server** (`apps/web` API routes and server components). The seller app and the browser never get database credentials.
- **Every** data access goes through one authorization layer in `apps/web/server/authz.ts`:
  - `requireSeller(req)` → session → `shopId`; every seller query is scoped with `WHERE shop_id = ctx.shopId` via helper repositories (no raw unscoped queries in route handlers).
  - `requireOrderToken(token)` for buyer order actions.
  - `requireAdmin(req)` for `/admin` and `/api/admin/*`: **no longer used** (no back office, decision #72), removed in M10. Job and ops endpoints instead require a Bearer secret (`CRON_SECRET`, `OPS_SECRET`; constant-time; 404 otherwise; decisions #69, #72).
- Public buyer pages read through server-side query functions that return **only public fields** (never buyer data of other orders, never the seller's email or recovery phone).
- **Server-owned columns are never writable from seller input**: `profiles.is_admin`, `shops.suspended_at`, `shops.order_counter`, all rating/count aggregates, `payment_accounts.verification_*`. Enforce this with explicit zod schemas per endpoint (whitelist fields), never by spreading request bodies into updates.
- **As built (M1):** contexts `requireUser` / `requireSeller` / `requireAdmin` / `requireOrderToken` in `apps/web/server/authz.ts`; repositories in `apps/web/server/repos/` (`sellerRepo`, `userRepo`, `publicRepo`, `orderTokenRepo`, `adminRepo`); write whitelists and the full server-owned list (`SERVER_OWNED_FIELDS`, which also covers `payment_accounts.is_active`, `profiles.expo_push_tokens` and ids/ownership) in `packages/shared/src/schemas/`; an ESLint rule keeps `@oda/db`, `drizzle-orm` and `pg` out of everything but `apps/web/server/**`. Decisions #34, #36.
- **Automated authorization tests** (Vitest against a real Postgres): seller A cannot read or modify seller B's shop, products, orders, customers or uploads; anon cannot read orders without the token; job and ops endpoints are 404 without their secret; server-owned columns can't be changed through any seller endpoint.

## Where logic runs
- **Everything server-side lives in `apps/web`** (Next.js route handlers under `app/api/…`, plus server components for buyer pages). Handlers import `packages/shared` (zod, pricing, state machine) and `packages/db` (Drizzle).
- Order transitions run in one DB transaction: `UPDATE orders SET … WHERE id = $1 AND status = $expected RETURNING *` (0 rows → 409 Conflict "this order changed, refresh"), then insert into `order_events`. Implemented once as `transitionOrder()` in `apps/web/server/orders.ts`, next to `insertOrder()` (every order is created there, with prices, fees and the payment-account snapshot read from the DB) and `nextOrderNumber()`.
- **The seller app** calls the API with its Better Auth session (session cookie stored in SecureStore and sent as a `Cookie` header, via Better Auth's Expo integration; decision #43) for all reads and writes.
- **Scheduled jobs** are protected routes (`/api/cron/expire-orders` hourly, `/api/cron/purge` daily, `/api/cron/digest` daily from M8, `/api/cron/backup-check` optional), called by **GitHub Actions** schedules with `Authorization: Bearer <CRON_SECRET>` (decision #69). Ops actions (suspend/unsuspend, M10) are a manual workflow with `OPS_SECRET` (decision #72 d). Auto-expire reuses `transitionOrder()`.
- **Backups:** a daily GitHub Actions job runs `pg_dump` and stores it encrypted in a private R2 bucket (keep 14 days): staging from M2, production from M11 (decision #31). Don't rely only on Neon's built-in restore on the free plan.
- Neon's free plan scales to zero after 5 minutes idle. Use `pg` (node-postgres) with Neon's pooled connection string (decision #17) and expect a short cold start on the first request.
