CREATE TYPE "public"."finance_plan_frequency" AS ENUM('once', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TABLE "finance_plan_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"occurrence_on" date NOT NULL,
	"status" text NOT NULL,
	"entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_plan_outcomes_status" CHECK ("finance_plan_outcomes"."status" in ('posted', 'skipped') and ("finance_plan_outcomes"."status" = 'skipped' or "finance_plan_outcomes"."entry_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "finance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"account_id" uuid NOT NULL,
	"target_account_id" uuid,
	"kind" "finance_entry_kind" NOT NULL,
	"amount" numeric(18, 0) NOT NULL,
	"frequency" "finance_plan_frequency" NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date,
	"category" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_plans_amount_positive" CHECK ("finance_plans"."amount" > 0),
	CONSTRAINT "finance_plans_valid_range" CHECK ("finance_plans"."end_on" is null or "finance_plans"."end_on" >= "finance_plans"."start_on"),
	CONSTRAINT "finance_plans_valid_transfer" CHECK (("finance_plans"."kind" = 'transfer' and "finance_plans"."target_account_id" is not null and "finance_plans"."account_id" <> "finance_plans"."target_account_id") or ("finance_plans"."kind" <> 'transfer' and "finance_plans"."target_account_id" is null))
);
--> statement-breakpoint
ALTER TABLE "finance_plan_outcomes" ADD CONSTRAINT "finance_plan_outcomes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_plan_outcomes" ADD CONSTRAINT "finance_plan_outcomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_plan_outcomes" ADD CONSTRAINT "finance_plan_outcomes_plan_id_finance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."finance_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_plan_outcomes" ADD CONSTRAINT "finance_plan_outcomes_entry_id_finance_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."finance_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_plans" ADD CONSTRAINT "finance_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_plans" ADD CONSTRAINT "finance_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_plans" ADD CONSTRAINT "finance_plans_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_plans" ADD CONSTRAINT "finance_plans_target_account_id_finance_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_plan_outcomes_occurrence_uq" ON "finance_plan_outcomes" USING btree ("plan_id","occurrence_on");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_plan_outcomes_entry_uq" ON "finance_plan_outcomes" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "finance_plan_outcomes_owner_idx" ON "finance_plan_outcomes" USING btree ("user_id","workspace_id","occurrence_on");--> statement-breakpoint
CREATE INDEX "finance_plans_owner_idx" ON "finance_plans" USING btree ("user_id","workspace_id");--> statement-breakpoint
ALTER TABLE "finance_plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance_plan_outcomes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE public.finance_plans, public.finance_plan_outcomes FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE public.finance_plans, public.finance_plan_outcomes FROM authenticated; END IF;
END $$;
