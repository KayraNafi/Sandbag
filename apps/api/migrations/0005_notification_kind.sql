-- Existing rows get their kind from the title, which every notification so far was written
-- with verbatim. Anything unmatched leaves the column null and the migration fails, by design.
ALTER TABLE "notifications" ADD COLUMN "kind" text;--> statement-breakpoint
UPDATE "notifications" SET "kind" = CASE
  WHEN "title" = 'New recruit' THEN 'recruit'
  WHEN "title" = 'Workout saved' THEN 'saved'
  WHEN "title" = 'Overtaken' THEN 'overtaken'
  WHEN "title" = 'Trophy unlocked' THEN 'trophy'
  WHEN "title" = 'Call answered' THEN 'answered'
  WHEN "title" = 'Sandbag confirmed' THEN 'confirmed'
  WHEN "title" LIKE '% called sandbag' THEN 'call'
  WHEN "title" LIKE '% replied' THEN 'reply'
END;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "kind" SET NOT NULL;
