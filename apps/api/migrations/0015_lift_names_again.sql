-- 0012 again, for the old names that came back. Phones kept their own copy of anything the server changed under the
-- same stamp, so 0012's renames never reached them, and sessions logged from their stale saved workouts brought the
-- old names back. The app now takes the server's copy (src/data/merge.ts in the app). These are the old names on
-- production on 2026-11-09, matched exactly, so anywhere else nothing matches and nothing changes. Like 0012:
-- a new seq so phones pull them, and updatedAt and recorded_at stay.
CREATE TEMPORARY TABLE lift_renames (old text PRIMARY KEY, new text NOT NULL);
--> statement-breakpoint
INSERT INTO lift_renames (old, new) VALUES
  ('Cable One Arm Lateral Raise', 'Cable lateral raise'),
  ('Cable Press Down', 'Triceps pushdown'),
  ('Cable Pushdown Triceps', 'Triceps pushdown'),
  ('Cable Triceps Extension', 'Overhead triceps extension'),
  ('Deck Flyes', 'Pec deck'),
  ('Dumbbell Incline Bench Press', 'Incline dumbbell press'),
  ('Free Weight Machine Press', 'Plate-loaded chest press'),
  ('Hummer Curls', 'Hammer curl'),
  ('Neutral-Grip Lat Pulldown', 'Neutral-grip lat pulldown'),
  ('Rear Delt Flyes', 'Rear delt fly'),
  ('Seated Fly', 'Pec deck');
--> statement-breakpoint
CREATE FUNCTION pg_temp.renamed_lifts(lifts jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(CASE WHEN r.new IS NULL THEN l.lift ELSE jsonb_set(l.lift, '{name}', to_jsonb(r.new)) END ORDER BY l.place), '[]'::jsonb)
  FROM jsonb_array_elements(lifts) WITH ORDINALITY AS l(lift, place)
  LEFT JOIN lift_renames r ON r.old = l.lift->>'name'
$$;
--> statement-breakpoint
UPDATE logged_workouts SET entries = pg_temp.renamed_lifts(entries), seq = nextval('sync_seq') WHERE pg_temp.renamed_lifts(entries) <> entries;
--> statement-breakpoint
UPDATE saved_workouts SET exercises = pg_temp.renamed_lifts(exercises), seq = nextval('sync_seq') WHERE pg_temp.renamed_lifts(exercises) <> exercises;
--> statement-breakpoint
UPDATE posts SET entries = pg_temp.renamed_lifts(entries) WHERE pg_temp.renamed_lifts(entries) <> entries;
--> statement-breakpoint
-- The key the same way exerciseKey() makes it, so a call still finds the lift it was made on.
UPDATE sandbag_calls c SET exercise = r.new, exercise_key = lower(regexp_replace(btrim(r.new), '\s+', ' ', 'g'))
FROM lift_renames r WHERE c.exercise = r.old;
--> statement-breakpoint
DROP FUNCTION pg_temp.renamed_lifts(jsonb);
--> statement-breakpoint
DROP TABLE lift_renames;
