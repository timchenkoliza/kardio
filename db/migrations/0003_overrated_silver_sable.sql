CREATE TABLE "event_reference_transport_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_reference_url" text NOT NULL,
	"normalization_basis" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reference_transport_members" (
	"event_candidate_id" text PRIMARY KEY NOT NULL,
	"transport_group_id" text NOT NULL,
	"mapped_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_reference_transport_members" ADD CONSTRAINT "event_reference_transport_members_event_candidate_id_event_reference_candidates_id_fk" FOREIGN KEY ("event_candidate_id") REFERENCES "public"."event_reference_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reference_transport_members" ADD CONSTRAINT "event_reference_transport_members_transport_group_id_event_reference_transport_groups_id_fk" FOREIGN KEY ("transport_group_id") REFERENCES "public"."event_reference_transport_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_reference_transport_url_uniq" ON "event_reference_transport_groups" USING btree ("canonical_reference_url");--> statement-breakpoint
CREATE INDEX "event_reference_transport_member_group_idx" ON "event_reference_transport_members" USING btree ("transport_group_id");