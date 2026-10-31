CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_a" uuid NOT NULL,
	"user_b" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_a_user_b_pk" PRIMARY KEY("user_a","user_b"),
	CONSTRAINT "friendships_ordered" CHECK ("friendships"."user_a" < "friendships"."user_b")
);
--> statement-breakpoint
CREATE TABLE "logged_workouts" (
	"owner_id" uuid NOT NULL,
	"id" text NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"saved_workout_id" text,
	"entries" jsonb NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"seq" bigint NOT NULL,
	CONSTRAINT "logged_workouts_owner_id_id_pk" PRIMARY KEY("owner_id","id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"route" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_respects" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "post_respects_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "post_saves" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "post_saves_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"caption" text NOT NULL,
	"show_weights" boolean NOT NULL,
	"entries" jsonb NOT NULL,
	"recipient_ids" uuid[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbag_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caller_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"post_id" uuid,
	"exercise" text NOT NULL,
	"exercise_key" text NOT NULL,
	"target_weight" real NOT NULL,
	"weights_hidden" boolean NOT NULL,
	"line" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saved_workouts" (
	"owner_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"exercises" jsonb NOT NULL,
	"saved_from" text,
	"updated_at" bigint NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"seq" bigint NOT NULL,
	CONSTRAINT "saved_workouts_owner_id_id_pk" PRIMARY KEY("owner_id","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"weekly_target" integer DEFAULT 3 NOT NULL,
	"invite_code" text NOT NULL,
	"invited_by" uuid,
	"sandbag_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_a_users_id_fk" FOREIGN KEY ("user_a") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_b_users_id_fk" FOREIGN KEY ("user_b") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_workouts" ADD CONSTRAINT "logged_workouts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_replies" ADD CONSTRAINT "post_replies_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_replies" ADD CONSTRAINT "post_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_respects" ADD CONSTRAINT "post_respects_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_respects" ADD CONSTRAINT "post_respects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD CONSTRAINT "sandbag_calls_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD CONSTRAINT "sandbag_calls_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD CONSTRAINT "sandbag_calls_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_workouts" ADD CONSTRAINT "saved_workouts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "friendships_user_b" ON "friendships" USING btree ("user_b");--> statement-breakpoint
CREATE INDEX "logged_workouts_seq" ON "logged_workouts" USING btree ("owner_id","seq");--> statement-breakpoint
CREATE INDEX "logged_workouts_date" ON "logged_workouts" USING btree ("owner_id","date");--> statement-breakpoint
CREATE INDEX "notifications_user_created" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "post_replies_post" ON "post_replies" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_author_created" ON "posts" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sandbag_calls_one_open" ON "sandbag_calls" USING btree ("target_id","exercise_key") WHERE "sandbag_calls"."status" = 'open';--> statement-breakpoint
CREATE INDEX "sandbag_calls_caller" ON "sandbag_calls" USING btree ("caller_id");--> statement-breakpoint
CREATE INDEX "saved_workouts_seq" ON "saved_workouts" USING btree ("owner_id","seq");--> statement-breakpoint
CREATE INDEX "users_invited_by" ON "users" USING btree ("invited_by");