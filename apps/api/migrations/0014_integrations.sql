CREATE TABLE "integration_imports" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"payload" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_at" timestamp with time zone,
	CONSTRAINT "integration_imports_user_id_provider_external_id_pk" PRIMARY KEY("user_id","provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"sealed_key" text NOT NULL,
	"settings" jsonb NOT NULL,
	"status" text DEFAULT 'connecting' NOT NULL,
	"synced_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "integration_imports" ADD CONSTRAINT "integration_imports_user_id_provider_integrations_user_id_provider_fk" FOREIGN KEY ("user_id","provider") REFERENCES "public"."integrations"("user_id","provider") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_imports_pending" ON "integration_imports" USING btree ("fetched_at") WHERE "integration_imports"."imported_at" is null;--> statement-breakpoint
-- The import worker reads which accounts to pull and their sealed keys, says how it went, and fills the inbox.
-- No sessions, passwords, posts or anyone's name. Only where the role exists: deploy/db-init.sh makes it.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'sandbag_imports') THEN
    GRANT SELECT (user_id, provider, sealed_key, synced_at, checked_at, status), UPDATE (status, synced_at, checked_at) ON integrations TO sandbag_imports;
    GRANT SELECT, INSERT, UPDATE ON integration_imports TO sandbag_imports;
  END IF;
END $$;
