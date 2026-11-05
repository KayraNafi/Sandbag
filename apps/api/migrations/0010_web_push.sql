CREATE TABLE "web_push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"session_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_session_hash_auth_sessions_token_hash_fk" FOREIGN KEY ("session_hash") REFERENCES "public"."auth_sessions"("token_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_push_subscriptions_user" ON "web_push_subscriptions" USING btree ("user_id");--> statement-breakpoint
-- Like push_tokens: the push worker reads where to send, and forgets ones that are gone.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'sandbag_push') THEN
    GRANT SELECT, DELETE ON web_push_subscriptions TO sandbag_push;
  END IF;
END $$;
