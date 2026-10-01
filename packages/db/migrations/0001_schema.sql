CREATE TYPE "public"."account_ref_mode" AS ENUM('fixed', 'order_number');--> statement-breakpoint
CREATE TYPE "public"."business_type" AS ENUM('fashion', 'shoes_bags', 'beauty_hair', 'food_drinks', 'phones_electronics', 'home_decor', 'baby_kids', 'other');--> statement-breakpoint
CREATE TYPE "public"."cancel_reason" AS ENUM('out_of_stock', 'buyer_asked', 'payment_not_received', 'cant_deliver', 'other', 'expired', 'buyer_cancelled');--> statement-breakpoint
CREATE TYPE "public"."cancelled_by" AS ENUM('buyer', 'seller', 'system');--> statement-breakpoint
CREATE TYPE "public"."claim_outcome" AS ENUM('pending', 'confirmed', 'not_found');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('rider', 'parcel');--> statement-breakpoint
CREATE TYPE "public"."event_actor" AS ENUM('buyer', 'seller', 'system', 'admin');--> statement-breakpoint
CREATE TYPE "public"."feedback_kind" AS ENUM('idea', 'broken', 'confusing', 'love', 'problem');--> statement-breakpoint
CREATE TYPE "public"."fulfilment" AS ENUM('delivery', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('new_order', 'payment_claimed', 'switched_to_pod', 'buyer_cancelled', 'order_expired', 'new_review');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('wa', 'status', 'tt', 'ig', 'fb', 'qr', 'other', 'direct', 'manual');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('awaiting_payment', 'awaiting_acceptance', 'payment_claimed', 'confirmed', 'sent', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_account_type" AS ENUM('till', 'pochi', 'paybill');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pay_before', 'pay_on_delivery');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'claimed', 'paid', 'refund_due', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('available', 'sold_out', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."sent_method" AS ENUM('rider', 'parcel', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('new', 'in_progress', 'closed');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"fee" integer NOT NULL,
	"method" "delivery_method" NOT NULL,
	"eta_label" text,
	"free_delivery_eligible" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_areas_fee" CHECK ("delivery_areas"."fee" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"type" "payment_account_type" NOT NULL,
	"number" text NOT NULL,
	"account_name" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"account_ref_mode" "account_ref_mode",
	"account_ref" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"verification_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_accounts_paybill_ref" CHECK (("payment_accounts"."type" = 'paybill') = ("payment_accounts"."account_ref_mode" is not null)
        and ("payment_accounts"."account_ref_mode" is distinct from 'fixed' or "payment_accounts"."account_ref" is not null)
        and ("payment_accounts"."type" = 'paybill' or "payment_accounts"."account_ref" is null))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"recovery_phone" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"expo_push_tokens" text[] DEFAULT '{}'::text[] NOT NULL,
	"onboarding_draft" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_slug_history" (
	"old_slug" text PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_path" text,
	"about" text,
	"location_label" text,
	"business_type" "business_type" DEFAULT 'other' NOT NULL,
	"channels" text[] DEFAULT '{}'::text[] NOT NULL,
	"whatsapp_phone" text NOT NULL,
	"calls_enabled" boolean DEFAULT false NOT NULL,
	"tiktok_handle" text,
	"instagram_handle" text,
	"accepts_pay_before" boolean DEFAULT true NOT NULL,
	"accepts_pay_on_delivery" boolean DEFAULT false NOT NULL,
	"pickup_enabled" boolean DEFAULT false NOT NULL,
	"pickup_location" text,
	"pickup_hours" text,
	"free_delivery_threshold" integer,
	"is_paused" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"onboarding_step" integer DEFAULT 3 NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"order_counter" integer DEFAULT 1000 NOT NULL,
	"rating_avg" numeric(3, 2),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shops_owner_id_unique" UNIQUE("owner_id"),
	CONSTRAINT "shops_slug_unique" UNIQUE("slug"),
	CONSTRAINT "shops_payment_option" CHECK ("shops"."accepts_pay_before" or "shops"."accepts_pay_on_delivery"),
	CONSTRAINT "shops_free_delivery_threshold" CHECK ("shops"."free_delivery_threshold" is null or "shops"."free_delivery_threshold" > 0),
	CONSTRAINT "shops_onboarding_step" CHECK ("shops"."onboarding_step" between 3 and 6),
	CONSTRAINT "shops_counts" CHECK ("shops"."rating_count" >= 0 and "shops"."delivered_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"compare_at_price" integer,
	"status" "product_status" DEFAULT 'available' NOT NULL,
	"sizes" text[] DEFAULT '{}'::text[] NOT NULL,
	"colours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"units_sold" integer DEFAULT 0 NOT NULL,
	"rating_avg" numeric(3, 2),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price" CHECK ("products"."price" >= 0),
	CONSTRAINT "products_compare_at_price" CHECK ("products"."compare_at_price" is null or "products"."compare_at_price" > "products"."price"),
	CONSTRAINT "products_counts" CHECK ("products"."units_sold" >= 0 and "products"."rating_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor" "event_actor" NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"name_snapshot" text NOT NULL,
	"size" text,
	"colour" text,
	"unit_price" integer NOT NULL,
	"qty" integer NOT NULL,
	"cover_path_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_qty" CHECK ("order_items"."qty" between 1 and 99),
	CONSTRAINT "order_items_unit_price" CHECK ("order_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"public_token" text NOT NULL,
	"idempotency_key" text,
	"status" "order_status" NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_phone" text NOT NULL,
	"buyer_whatsapp" boolean DEFAULT true NOT NULL,
	"buyer_email" text,
	"fulfilment" "fulfilment" NOT NULL,
	"delivery_area_id" uuid,
	"delivery_area_name" text,
	"address_text" text,
	"sent_method" "sent_method",
	"rider_phone" text,
	"subtotal" integer NOT NULL,
	"delivery_fee" integer NOT NULL,
	"total" integer NOT NULL,
	"payment_account_snapshot" jsonb,
	"mpesa_code" text,
	"source" "order_source" DEFAULT 'direct' NOT NULL,
	"cancel_reason" "cancel_reason",
	"cancel_note" text,
	"cancelled_by" "cancelled_by",
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"awaiting_payment_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_shop_number" UNIQUE("shop_id","number"),
	CONSTRAINT "orders_money" CHECK ("orders"."subtotal" >= 0 and "orders"."delivery_fee" >= 0 and "orders"."total" = "orders"."subtotal" + "orders"."delivery_fee"),
	CONSTRAINT "orders_number" CHECK ("orders"."number" > 0),
	CONSTRAINT "orders_pickup_has_no_area" CHECK ("orders"."fulfilment" = 'delivery' or "orders"."delivery_area_id" is null)
);
--> statement-breakpoint
CREATE TABLE "payment_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"mpesa_code" text NOT NULL,
	"raw_message" text,
	"outcome" "claim_outcome" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"review_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_id" uuid,
	"rating" smallint,
	"text" text,
	"photo_path" text,
	CONSTRAINT "review_items_review_id_order_item_id_pk" PRIMARY KEY("review_id","order_item_id"),
	CONSTRAINT "review_items_rating" CHECK ("review_items"."rating" is null or "review_items"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"buyer_display_name" text NOT NULL,
	"rating" smallint NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"seller_reply" text,
	"replied_at" timestamp with time zone,
	"editable_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "reviews_rating" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"shop_slug" text,
	"reason" text,
	"status" "ticket_status" DEFAULT 'new' NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" "feedback_kind" NOT NULL,
	"message" text NOT NULL,
	"screenshot_path" text,
	"reply_on_whatsapp" boolean DEFAULT false NOT NULL,
	"status" "ticket_status" DEFAULT 'new' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"order_id" uuid,
	"review_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"message" text NOT NULL,
	"contact_phone" text,
	"status" "ticket_status" DEFAULT 'new' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_visits_daily" (
	"shop_id" uuid NOT NULL,
	"day" date NOT NULL,
	"source" "order_source" NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shop_visits_daily_shop_id_day_source_pk" PRIMARY KEY("shop_id","day","source"),
	CONSTRAINT "shop_visits_daily_visits" CHECK ("shop_visits_daily"."visits" >= 0)
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_areas" ADD CONSTRAINT "delivery_areas_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_auth_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_slug_history" ADD CONSTRAINT "shop_slug_history_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_visits_daily" ADD CONSTRAINT "shop_visits_daily_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_user_id_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_user_id_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "delivery_areas_shop_id_idx" ON "delivery_areas" USING btree ("shop_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_areas_id_shop_id" ON "delivery_areas" USING btree ("id","shop_id");--> statement-breakpoint
CREATE INDEX "payment_accounts_shop_id_idx" ON "payment_accounts" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_one_active" ON "payment_accounts" USING btree ("shop_id") WHERE "payment_accounts"."is_active";--> statement-breakpoint
CREATE INDEX "shop_slug_history_shop_id_idx" ON "shop_slug_history" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "categories_shop_id_idx" ON "categories" USING btree ("shop_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_id_shop_id" ON "categories" USING btree ("id","shop_id");--> statement-breakpoint
CREATE INDEX "product_photos_product_id_idx" ON "product_photos" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "products_shop_listing_idx" ON "products" USING btree ("shop_id","status","position") WHERE "products"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_search_idx" ON "products" USING gin (to_tsvector('simple', "name" || ' ' || coalesce("description", '')));--> statement-breakpoint
CREATE INDEX "order_events_order_id_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_id_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_id_shop_id" ON "orders" USING btree ("id","shop_id");--> statement-breakpoint
CREATE INDEX "orders_shop_status_idx" ON "orders" USING btree ("shop_id","status","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_shop_confirmed_idx" ON "orders" USING btree ("shop_id","confirmed_at");--> statement-breakpoint
CREATE INDEX "orders_shop_buyer_phone_idx" ON "orders" USING btree ("shop_id","buyer_phone");--> statement-breakpoint
CREATE INDEX "orders_expiry_idx" ON "orders" USING btree ("awaiting_payment_since") WHERE "orders"."status" = 'awaiting_payment' and "orders"."source" <> 'manual';--> statement-breakpoint
CREATE INDEX "payment_claims_shop_code_idx" ON "payment_claims" USING btree ("shop_id","mpesa_code");--> statement-breakpoint
CREATE INDEX "payment_claims_order_id_idx" ON "payment_claims" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "review_items_product_id_idx" ON "review_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "reviews_shop_id_idx" ON "reviews" USING btree ("shop_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_id_shop_id" ON "reviews" USING btree ("id","shop_id");--> statement-breakpoint
CREATE INDEX "deletion_requests_status_idx" ON "deletion_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notifications_shop_idx" ON "notifications" USING btree ("shop_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("shop_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");