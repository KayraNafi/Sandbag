ALTER TABLE "users" ADD COLUMN "goal_history" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "time_zone" text;