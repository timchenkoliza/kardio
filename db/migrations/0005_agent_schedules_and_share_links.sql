CREATE TABLE "agent_schedule_slots" (
	"session_id" text NOT NULL,
	"specialty" text NOT NULL,
	"agent_id" text NOT NULL,
	"slot" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "agent_schedule_slots_session_id_specialty_agent_id_slot_pk" PRIMARY KEY("session_id","specialty","agent_id","slot")
);
--> statement-breakpoint
CREATE TABLE "agent_schedules" (
	"session_id" text NOT NULL,
	"specialty" text NOT NULL,
	"next_check_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"paused" boolean DEFAULT false NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_schedules_session_id_specialty_pk" PRIMARY KEY("session_id","specialty")
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"token" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"specialty" text NOT NULL,
	"kind" text NOT NULL,
	"source_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"last_opened_at" timestamp with time zone,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_schedule_slots" ADD CONSTRAINT "agent_schedule_slots_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_schedules" ADD CONSTRAINT "agent_schedules_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_session_id_anonymous_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anonymous_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_schedule_slots_session_idx" ON "agent_schedule_slots" USING btree ("session_id","specialty","started_at");--> statement-breakpoint
CREATE INDEX "agent_schedules_due_idx" ON "agent_schedules" USING btree ("paused","next_check_at");--> statement-breakpoint
CREATE INDEX "share_links_session_idx" ON "share_links" USING btree ("session_id","specialty","created_at");