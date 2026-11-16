-- When the server first saw a session or run. A session's first arrival is best known from when its
-- numbers were last recorded; runs have no server time yet, so the ones already in count as on time.
ALTER TABLE "logged_workouts" ADD COLUMN "logged_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "logged_workouts" SET "logged_at" = "recorded_at";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "logged_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "runs" SET "logged_at" = "date"::timestamptz;
