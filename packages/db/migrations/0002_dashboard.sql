CREATE TYPE "public"."dashboard_period" AS ENUM('today', 'week', 'all');--> statement-breakpoint
CREATE TYPE "public"."widget_access" AS ENUM('private', 'workspace');--> statement-breakpoint
CREATE TYPE "public"."widget_refresh" AS ENUM('on_load', 'interval_5m');--> statement-breakpoint
CREATE TYPE "public"."widget_size" AS ENUM('sm', 'md', 'lg', 'full');--> statement-breakpoint
CREATE TYPE "public"."widget_type" AS ENUM('tasks', 'schedule', 'projects', 'inbox', 'automations', 'kpi', 'recent_notes', 'shortcuts');--> statement-breakpoint
CREATE TABLE "dashboard_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"type" "widget_type" NOT NULL,
	"title" text,
	"data_source" text,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer NOT NULL,
	"size" "widget_size" DEFAULT 'md' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"refresh_policy" "widget_refresh" DEFAULT 'on_load' NOT NULL,
	"access_scope" "widget_access" DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text DEFAULT '개인 대시보드' NOT NULL,
	"period" "dashboard_period" DEFAULT 'today' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_widgets_dashboard_idx" ON "dashboard_widgets" USING btree ("dashboard_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboards_user_workspace_uq" ON "dashboards" USING btree ("user_id","workspace_id");