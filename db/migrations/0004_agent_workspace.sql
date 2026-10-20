CREATE TABLE "agent_profiles" (
	"session_id" text NOT NULL,
	"specialty" text NOT NULL,
	"profile" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_profiles_session_id_specialty_pk" PRIMARY KEY("session_id","specialty")
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"specialty" text NOT NULL,
	"agent_id" text NOT NULL,
	"status" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_results" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"specialty" text NOT NULL,
	"agent_id" text NOT NULL,
	"result_key" text NOT NULL,
	"run_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"specialty" text NOT NULL,
	"kind" text NOT NULL,
	"ownership" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_collections" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"specialty" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"specialty" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_results" ADD CONSTRAINT "agent_results_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_materials" ADD CONSTRAINT "user_materials_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_collections" ADD CONSTRAINT "material_collections_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_requests" ADD CONSTRAINT "action_requests_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_session_agent_idx" ON "agent_runs" USING btree ("session_id","specialty","agent_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_results_session_key_uniq" ON "agent_results" USING btree ("session_id","specialty","result_key");--> statement-breakpoint
CREATE INDEX "agent_results_session_agent_idx" ON "agent_results" USING btree ("session_id","specialty","agent_id","created_at");--> statement-breakpoint
CREATE INDEX "user_materials_session_idx" ON "user_materials" USING btree ("session_id","specialty","created_at");--> statement-breakpoint
CREATE INDEX "material_collections_session_idx" ON "material_collections" USING btree ("session_id","specialty");--> statement-breakpoint
CREATE INDEX "action_requests_session_idx" ON "action_requests" USING btree ("session_id","specialty","created_at");
