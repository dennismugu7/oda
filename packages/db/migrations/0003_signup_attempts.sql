CREATE TABLE "signup_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"code_attempts" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "signup_attempts_email_idx" ON "signup_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "signup_attempts_created_at_idx" ON "signup_attempts" USING btree ("created_at");--> statement-breakpoint

-- Decision #49: accounts now exist only once their email is proven. Unverified users from
-- the old sign-up flow never proved their email (and may carry someone else's password):
-- remove them. Staging has no real users; a user who owns a shop is never touched.
-- Their profiles go with them (profiles.id → auth_user ON DELETE CASCADE).
DELETE FROM "auth_user" u
WHERE u."email_verified" = false
  AND NOT EXISTS (SELECT 1 FROM "shops" s WHERE s."owner_id" = u."id");
