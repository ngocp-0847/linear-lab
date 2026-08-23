CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" text,
	"starts_at" date NOT NULL,
	"ends_at" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"identifier" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"state_id" uuid NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"estimate" smallint,
	"assignee_id" uuid,
	"project_id" uuid,
	"cycle_id" uuid,
	"sort_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "issue_identifier_unique" UNIQUE("identifier"),
	CONSTRAINT "issue_estimate_fib" CHECK ("issue"."estimate" IS NULL OR "issue"."estimate" IN (1,2,3,5,8)),
	CONSTRAINT "issue_priority_range" CHECK ("issue"."priority" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "issue_label" (
	"issue_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "issue_label_issue_id_label_id_pk" PRIMARY KEY("issue_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "label" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"target_date" date
);
--> statement-breakpoint
CREATE TABLE "state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"position" integer NOT NULL,
	"color" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"issue_counter" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar_color" text NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_state_id_state_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_cycle_id_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label" ADD CONSTRAINT "issue_label_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label" ADD CONSTRAINT "issue_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state" ADD CONSTRAINT "state_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_issue_idx" ON "comment" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_team_number_uniq" ON "cycle" USING btree ("team_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_team_number_uniq" ON "issue" USING btree ("team_id","number");--> statement-breakpoint
CREATE INDEX "issue_board_idx" ON "issue" USING btree ("team_id","state_id","sort_key");--> statement-breakpoint
CREATE INDEX "issue_assignee_idx" ON "issue" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "issue_project_idx" ON "issue" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "issue_cycle_idx" ON "issue" USING btree ("cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "label_team_name_uniq" ON "label" USING btree ("team_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "state_team_key_uniq" ON "state" USING btree ("team_id","key");