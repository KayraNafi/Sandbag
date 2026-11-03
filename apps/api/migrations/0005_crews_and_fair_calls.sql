CREATE TABLE "crew_members" (
	"crew_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer DEFAULT 1000 NOT NULL,
	"trend" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "crew_members_crew_id_user_id_pk" PRIMARY KEY("crew_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crew_weeks" (
	"crew_id" uuid NOT NULL,
	"week" date NOT NULL,
	"season" integer NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_weeks_crew_id_week_pk" PRIMARY KEY("crew_id","week")
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"admin_id" uuid,
	"season" integer DEFAULT 1 NOT NULL,
	"season_start" date NOT NULL,
	"last_champion_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streak_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"crew_id" uuid NOT NULL,
	"weeks" integer NOT NULL,
	"from_week" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logged_workouts" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Best evidence of when each was written, so history stays usable as a baseline.
UPDATE "logged_workouts" SET "recorded_at" = to_timestamp("updated_at" / 1000.0);--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD COLUMN "target_reps" integer;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD COLUMN "target_max" double precision;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD COLUMN "target_setup" text;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
-- Older calls only kept the weight, so the reps come from the post they were made on, if it still exists.
UPDATE "sandbag_calls" c SET "target_reps" = (SELECT (e->>'reps')::int FROM "posts" p, jsonb_array_elements(p."entries") e WHERE p."id" = c."post_id" AND lower(e->>'name') = c."exercise_key" LIMIT 1);--> statement-breakpoint
-- The same sum as estimatedMax in packages/shared/src/scoring.ts.
UPDATE "sandbag_calls" SET "target_max" = "target_weight" * (1 + (LEAST(COALESCE(NULLIF("target_reps", 0), 1), 12) - 1) / 30.0);--> statement-breakpoint
-- Open calls get a fresh two weeks rather than failing the moment this runs.
UPDATE "sandbag_calls" SET "deadline_at" = COALESCE("resolved_at", now() + interval '14 days');--> statement-breakpoint
ALTER TABLE "sandbag_calls" ALTER COLUMN "target_max" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ALTER COLUMN "deadline_at" SET NOT NULL;--> statement-breakpoint
-- Goals now run from 2 to 7 days. Above that was never reachable once a day only counts once.
UPDATE "users" SET "weekly_target" = LEAST(GREATEST("weekly_target", 2), 7);--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD COLUMN "settled_by" text;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_weeks" ADD CONSTRAINT "crew_weeks_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_last_champion_id_users_id_fk" FOREIGN KEY ("last_champion_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_pauses" ADD CONSTRAINT "streak_pauses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_pauses" ADD CONSTRAINT "streak_pauses_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_pauses" ADD CONSTRAINT "streak_pauses_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crew_members_one_active" ON "crew_members" USING btree ("user_id") WHERE "crew_members"."left_at" is null;--> statement-breakpoint
CREATE INDEX "streak_pauses_user" ON "streak_pauses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "streak_pauses_crew" ON "streak_pauses" USING btree ("crew_id");--> statement-breakpoint
CREATE INDEX "sandbag_calls_post" ON "sandbag_calls" USING btree ("post_id");