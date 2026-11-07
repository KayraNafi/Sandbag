ALTER TABLE "posts" ADD COLUMN "logged_workout_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_logged_workout_id_logged_workouts_owner_id_id_fk" FOREIGN KEY ("author_id","logged_workout_id") REFERENCES "public"."logged_workouts"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_run_id_runs_owner_id_id_fk" FOREIGN KEY ("author_id","run_id") REFERENCES "public"."runs"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_logged_workout" ON "posts" USING btree ("author_id","logged_workout_id");--> statement-breakpoint
CREATE INDEX "posts_run_id" ON "posts" USING btree ("author_id","run_id");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_source" CHECK ("posts"."logged_workout_id" is null or "posts"."kind" = 'workout');--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_run_source" CHECK ("posts"."run_id" is null or "posts"."kind" = 'run');--> statement-breakpoint
-- Posts made before this point at what they show where that's certain, never guessed. A session post copied its
-- session's entries, ids and all, and every session draws new ids, so the one session of yours sharing an entry id
-- is the one it showed. A run post froze its run, so the one run of yours with that day, activity, distance and time
-- is it. Where nothing or more than one thing matches, the post stays unlinked.
UPDATE "posts" SET "logged_workout_id" = "match"."id"
FROM (
  SELECT "p"."id" AS "post_id", min("w"."id") AS "id"
  FROM "posts" "p"
  JOIN "logged_workouts" "w" ON "w"."owner_id" = "p"."author_id" AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("p"."entries") "shown", jsonb_array_elements("w"."entries") "kept"
    WHERE "shown"->>'id' = "kept"->>'id'
  )
  WHERE "p"."kind" = 'workout'
  GROUP BY "p"."id"
  HAVING count(*) = 1
) "match"
WHERE "posts"."id" = "match"."post_id";--> statement-breakpoint
UPDATE "posts" SET "run_id" = "match"."id"
FROM (
  SELECT "p"."id" AS "post_id", min("r"."id") AS "id"
  FROM "posts" "p"
  JOIN "runs" "r" ON "r"."owner_id" = "p"."author_id"
    AND "r"."date" = ("p"."run"->>'date')::date
    AND "r"."activity" = "p"."run"->>'activity'
    AND "r"."distance_km" = ("p"."run"->>'distanceKm')::double precision
    AND "r"."seconds" = ("p"."run"->>'seconds')::integer
  WHERE "p"."kind" = 'run'
  GROUP BY "p"."id"
  HAVING count(*) = 1
) "match"
WHERE "posts"."id" = "match"."post_id";
