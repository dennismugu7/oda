CREATE TABLE "push_tickets" (
	"ticket_id" text PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_tickets" ADD CONSTRAINT "push_tickets_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_tickets_created_idx" ON "push_tickets" USING btree ("created_at");