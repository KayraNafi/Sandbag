-- Every lift logged so far, under the catalog's name for it (packages/shared/src/exercises.ts), with two typos
-- fixed and one superset that was logged as a single lift split into its two lifts. The names are the ones on
-- production on 2026-11-07, matched exactly, so anywhere else nothing matches and nothing changes.
-- Workouts get a new seq so phones pull them. updatedAt and recorded_at stay: an edit made offline before
-- this still wins, and no session becomes newer than it is.
CREATE TEMPORARY TABLE lift_renames (old text PRIMARY KEY, new text NOT NULL);
--> statement-breakpoint
INSERT INTO lift_renames (old, new) VALUES
  ('Adductor Machine', 'Hip adduction'),
  ('Back Extensions', 'Back extension'),
  ('Behind Back Finger Curls', 'Finger curl'),
  ('Cable  Triceps Extension', 'Overhead triceps extension'),
  ('Cable Bar Pulldown', 'Lat pulldown'),
  ('cable chest pulldowns', 'High-to-low cable fly'),
  ('cable chest pullups', 'Low-to-high cable fly'),
  ('Cable curls', 'Cable curl'),
  ('Cable Flyes', 'Cable fly'),
  ('Cable Lateral Raise', 'Cable lateral raise'),
  ('Cable Lateral Raises', 'Cable lateral raise'),
  ('Cable One Arm Lateral Raise', 'Cable lateral raise'),
  ('Cable Press Down', 'Triceps pushdown'),
  ('Cable pull (high)', 'High-to-low cable fly'),
  ('Cable pull (low)', 'Low-to-high cable fly'),
  ('Cable Pushdown Triceps', 'Triceps pushdown'),
  ('Cable Seated Row with V bar', 'V-bar cable row'),
  ('Calf Raises', 'Standing calf raise'),
  ('chest fly', 'Pec deck'),
  ('Chest Flyes', 'Pec deck'),
  ('chest press', 'Chest press'),
  ('coverging chest press', 'Converging chest press'),
  ('Cross Body Hammer Curls', 'Cross-body hammer curl'),
  ('Crunches', 'Crunch'),
  ('Deck Flyes', 'Pec deck'),
  ('decline chest press', 'Decline chest press'),
  ('Dumbbell Cross Body Hammer Curl', 'Cross-body hammer curl'),
  ('Dumbbell Incline Bench Press', 'Incline dumbbell press'),
  ('Dumbbell Incline Biceps Curl', 'Incline dumbbell curl'),
  ('Dumbbell Lateral Raises', 'Lateral raise'),
  ('Free Weight Machine Press', 'Plate-loaded chest press'),
  ('Free Weight Machine Shoulder Press', 'Plate-loaded shoulder press'),
  ('Hip Abduction', 'Hip abduction'),
  ('Hip Adduction', 'Hip adduction'),
  ('Hummer Curls', 'Hammer curl'),
  ('incline chest press', 'Incline chest press'),
  ('Incline Dumbbells Bench', 'Incline dumbbell press'),
  ('Inclined Free Weight Machine Press', 'Plate-loaded incline press'),
  ('Lat Pulldown', 'Lat pulldown'),
  ('Leg Extension', 'Leg extension'),
  ('Leg Extensions', 'Leg extension'),
  ('Leg Press', 'Leg press'),
  ('Lever Machine Narrow Row', 'Narrow machine row'),
  ('Lever Seated Abdominal Crunches', 'Ab crunch machine'),
  ('Low Seated Row', 'Seated cable row'),
  ('Lying Leg Curls', 'Lying leg curl'),
  ('Lying Machine Chest Press', 'Lying chest press'),
  ('Machine Preacher Curls', 'Machine preacher curl'),
  ('Machine Seated Wide Row', 'Wide machine row'),
  ('Machine Shoulder Press', 'Shoulder press machine'),
  ('Machine Single Hands Row', 'Single-arm machine row'),
  ('Narrow Grip Cable Row', 'V-bar cable row'),
  ('Neutral-Grip Lat Pulldown', 'Neutral-grip lat pulldown'),
  ('Pec fly', 'Pec deck'),
  ('Preacher Curls', 'Preacher curl'),
  ('Rear Delt Fly Cable', 'Cable rear delt fly'),
  ('Rear Delt Flyes', 'Rear delt fly'),
  ('Reverse Flyes', 'Rear delt fly'),
  ('Reverse Wrist Curls', 'Reverse wrist curl'),
  ('Seated Calf Raises', 'Seated calf raise'),
  ('Seated Fly', 'Pec deck'),
  ('Seated Leg Curls', 'Seated leg curl'),
  ('Seated Machine Row', 'Machine row'),
  ('T-bar Row', 'T-bar row'),
  ('T-Bar Row', 'T-bar row'),
  ('Triceps Machine Press Down', 'Machine triceps pushdown'),
  ('Triceps Overhead Extension', 'Overhead triceps extension'),
  ('Triceps Pushdown', 'Triceps pushdown'),
  ('Triceps Pushdown (Ropes)', 'Rope pushdown'),
  ('Wrist Curls', 'Wrist curl');
--> statement-breakpoint
CREATE FUNCTION pg_temp.renamed_lifts(lifts jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(part.lift ORDER BY l.place, part.half), '[]'::jsonb)
  FROM jsonb_array_elements(lifts) WITH ORDINALITY AS l(lift, place)
  LEFT JOIN lift_renames r ON r.old = l.lift->>'name'
  CROSS JOIN LATERAL (
    SELECT 1 AS half, CASE
      WHEN l.lift->>'name' = 'Overhead Cable Triceps Extension + Cable Pull Down'
        THEN l.lift || '{"name": "Overhead triceps extension", "supersetWithNext": true}'::jsonb
      WHEN r.new IS NOT NULL THEN jsonb_set(l.lift, '{name}', to_jsonb(r.new))
      ELSE l.lift
    END AS lift
    UNION ALL
    -- Both halves keep the numbers that were logged for the pair. A logged one needs an id of its own.
    SELECT 2, l.lift || '{"name": "Triceps pushdown"}'::jsonb
      || CASE WHEN l.lift ? 'id' THEN jsonb_build_object('id', gen_random_uuid()::text) ELSE '{}'::jsonb END
    WHERE l.lift->>'name' = 'Overhead Cable Triceps Extension + Cable Pull Down'
  ) AS part
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
