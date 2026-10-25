ALTER TYPE "public"."entity_type" ADD VALUE 'activity';--> statement-breakpoint
ALTER TYPE "public"."entity_type" ADD VALUE 'place';--> statement-breakpoint
CREATE TABLE "finance_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"budget_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_comments_one_target" CHECK (("finance_comments"."account_id" is not null and "finance_comments"."budget_id" is null) or ("finance_comments"."account_id" is null and "finance_comments"."budget_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_budgets" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_comments" ADD CONSTRAINT "finance_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_comments" ADD CONSTRAINT "finance_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_comments" ADD CONSTRAINT "finance_comments_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_comments" ADD CONSTRAINT "finance_comments_budget_id_finance_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."finance_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_comments_account_idx" ON "finance_comments" USING btree ("user_id","account_id","created_at");--> statement-breakpoint
CREATE INDEX "finance_comments_budget_idx" ON "finance_comments" USING btree ("user_id","budget_id","created_at");--> statement-breakpoint
ALTER TABLE "finance_comments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE public.finance_comments FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE public.finance_comments FROM authenticated; END IF;
END $$;
