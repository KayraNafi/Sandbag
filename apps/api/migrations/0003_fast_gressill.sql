CREATE TABLE "push_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"session_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_session_hash_auth_sessions_token_hash_fk" FOREIGN KEY ("session_hash") REFERENCES "public"."auth_sessions"("token_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_tokens_user" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_unpushed" ON "notifications" USING btree ("created_at") WHERE "notifications"."pushed_at" is null;--> statement-breakpoint
-- Everything already written is old news. Don't push it.
UPDATE "notifications" SET "pushed_at" = now();
