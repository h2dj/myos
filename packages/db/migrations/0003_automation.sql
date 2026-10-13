CREATE TYPE "public"."automation_template" AS ENUM('morning_briefing', 'deadline_alert', 'recurring_tasks', 'weekly_review', 'note_to_task', 'shared_change_alert');--> statement-breakpoint
CREATE TYPE "public"."automation_run_status" AS ENUM('running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."automation_run_trigger" AS ENUM('schedule', 'manual', 'event');--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"trigger" "automation_run_trigger" NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "automation_run_status" DEFAULT 'running' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"input_summary" jsonb,
	"result" jsonb,
	"error" text,
	"next_retry_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"template" "automation_template" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timezone" text DEFAULT 'Asia/Seoul' NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"retry_policy" jsonb DEFAULT '{"maxAttempts":3,"backoffSeconds":300}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'none' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rule" jsonb NOT NULL,
	"timezone" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"next_occurrence" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_series" ADD CONSTRAINT "task_series_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_idempotency_uq" ON "automation_runs" USING btree ("automation_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "automation_runs_automation_idx" ON "automation_runs" USING btree ("automation_id","started_at");--> statement-breakpoint
CREATE INDEX "automation_runs_retry_idx" ON "automation_runs" USING btree ("next_retry_at") WHERE "automation_runs"."status" = 'failed';--> statement-breakpoint
CREATE UNIQUE INDEX "automations_owner_template_uq" ON "automations" USING btree ("workspace_id","owner_id","template");--> statement-breakpoint
CREATE INDEX "automations_due_idx" ON "automations" USING btree ("next_run_at") WHERE "automations"."enabled";--> statement-breakpoint
CREATE INDEX "task_series_workspace_idx" ON "task_series" USING btree ("workspace_id","active");