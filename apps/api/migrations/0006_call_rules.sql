-- Calls are judged on estimated max (weight and reps), run out after 14 days, and can be watched
-- as an honest miss. Existing calls get their reps from the post they were made on, and open
-- ones get a fresh 14 days rather than failing the moment this runs.
ALTER TABLE "sandbag_calls" ADD COLUMN "target_reps" integer;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD COLUMN "target_max" double precision;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD COLUMN "settled_by" text;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ADD COLUMN "corrected_at" timestamp with time zone;--> statement-breakpoint
-- The best reps of the called entry, as entryMax() reads them: the usual reps or the best varied set.
UPDATE "sandbag_calls" AS c SET "target_reps" = (
  SELECT nullif(max(greatest(
    coalesce((e->>'reps')::int, 0),
    CASE WHEN jsonb_typeof(e->'setReps') = 'array'
      THEN coalesce((SELECT max((r #>> '{}')::int) FROM jsonb_array_elements(e->'setReps') AS r WHERE jsonb_typeof(r) = 'number'), 0)
      ELSE 0 END
  )), 0)
  FROM "posts" AS p, jsonb_array_elements(p."entries") AS e
  WHERE p."id" = c."post_id"
    AND regexp_replace(lower(trim(e->>'name')), '\s+', ' ', 'g') = c."exercise_key"
    AND (e->>'weight')::real = c."target_weight"
);--> statement-breakpoint
-- estimatedMax(): reps between 1 and 12, each one past the first worth a thirtieth.
UPDATE "sandbag_calls" SET "target_max" = "target_weight" * (1 + (least(greatest(coalesce("target_reps", 1), 1), 12) - 1) / 30.0);--> statement-breakpoint
UPDATE "sandbag_calls" SET "deadline_at" = CASE WHEN "status" = 'open' THEN now() + interval '14 days' ELSE coalesce("resolved_at", "created_at") END;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ALTER COLUMN "target_max" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbag_calls" ALTER COLUMN "deadline_at" SET NOT NULL;--> statement-breakpoint
DROP INDEX "sandbag_calls_one_open";--> statement-breakpoint
CREATE INDEX "sandbag_calls_target_lift" ON "sandbag_calls" USING btree ("target_id","exercise_key");--> statement-breakpoint
CREATE INDEX "sandbag_calls_post" ON "sandbag_calls" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "sandbag_calls_due" ON "sandbag_calls" USING btree ("deadline_at") WHERE "sandbag_calls"."status" in ('open', 'watching');
