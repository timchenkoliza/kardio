CREATE TABLE "event_reference_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"normalized_url" text NOT NULL,
	"host" text NOT NULL,
	"resolution_basis" text NOT NULL,
	"review_state" text DEFAULT 'observed' NOT NULL,
	"promoted_node_id" text,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reference_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_candidate_id" text NOT NULL,
	"distribution_candidate_id" text NOT NULL,
	"source_registry_id" text NOT NULL,
	"link_ordinal" integer NOT NULL,
	"observed_href" text NOT NULL,
	"source_presence" text DEFAULT 'present' NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_reference_candidates" ADD CONSTRAINT "event_reference_candidates_promoted_node_id_ontology_nodes_id_fk" FOREIGN KEY ("promoted_node_id") REFERENCES "public"."ontology_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reference_mentions" ADD CONSTRAINT "event_reference_mentions_event_candidate_id_event_reference_candidates_id_fk" FOREIGN KEY ("event_candidate_id") REFERENCES "public"."event_reference_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reference_mentions" ADD CONSTRAINT "event_reference_mentions_distribution_candidate_id_distribution_post_candidates_id_fk" FOREIGN KEY ("distribution_candidate_id") REFERENCES "public"."distribution_post_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_reference_normalized_url_uniq" ON "event_reference_candidates" USING btree ("normalized_url");--> statement-breakpoint
CREATE INDEX "event_reference_review_idx" ON "event_reference_candidates" USING btree ("review_state");--> statement-breakpoint
CREATE INDEX "event_reference_promoted_idx" ON "event_reference_candidates" USING btree ("promoted_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_reference_mention_identity_uniq" ON "event_reference_mentions" USING btree ("distribution_candidate_id","link_ordinal","event_candidate_id");--> statement-breakpoint
CREATE INDEX "event_reference_mention_event_idx" ON "event_reference_mentions" USING btree ("event_candidate_id");--> statement-breakpoint
CREATE INDEX "event_reference_mention_source_idx" ON "event_reference_mentions" USING btree ("source_registry_id","source_presence");