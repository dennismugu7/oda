ALTER TABLE "reviews" ADD COLUMN "report_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_token_hash_unique" UNIQUE("token_hash");