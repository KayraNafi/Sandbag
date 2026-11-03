-- When the server last saw a session's numbers change. Everything logged before this existed is
-- trusted: it's dated the day it claims, so nothing already in someone's history counts as backdated.
ALTER TABLE "logged_workouts" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "logged_workouts" SET "recorded_at" = "date"::timestamptz;
