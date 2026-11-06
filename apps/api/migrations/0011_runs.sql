CREATE TABLE "runs" (
	"owner_id" uuid NOT NULL,
	"id" text NOT NULL,
	"date" date NOT NULL,
	"activity" text NOT NULL,
	"distance_km" double precision NOT NULL,
	"seconds" integer NOT NULL,
	"note" text NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"seq" bigint NOT NULL,
	CONSTRAINT "runs_owner_id_id_pk" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "runs_activity" CHECK ("runs"."activity" in ('run', 'walk'))
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "run" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_seq" ON "runs" USING btree ("owner_id","seq");--> statement-breakpoint
CREATE INDEX "runs_date" ON "runs" USING btree ("owner_id","date");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_run" CHECK (("posts"."kind" = 'run') = ("posts"."run" is not null));