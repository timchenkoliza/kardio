CREATE TABLE "distribution_post_candidate_links" (
	"candidate_id" text NOT NULL,
	"source_registry_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"href" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "distribution_post_candidate_links_candidate_id_ordinal_pk" PRIMARY KEY("candidate_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "distribution_post_candidate_media" (
	"candidate_id" text NOT NULL,
	"source_registry_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"href" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "distribution_post_candidate_media_candidate_id_ordinal_pk" PRIMARY KEY("candidate_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "distribution_post_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"source_registry_id" text NOT NULL,
	"specialty" text NOT NULL,
	"message_id" text NOT NULL,
	"source_artifact_id" text NOT NULL,
	"published_at_instant" timestamp with time zone,
	"published_at_local" timestamp,
	"published_at_raw" text,
	"published_at_basis" text NOT NULL,
	"author_display_name" text,
	"body_text" text NOT NULL,
	"hashtags" jsonb NOT NULL,
	"raw_fragment_sha256" text NOT NULL,
	"source_presence" text DEFAULT 'present' NOT NULL,
	"review_state" text DEFAULT 'parsed' NOT NULL,
	"promoted_node_id" text,
	"parsed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "distribution_post_candidate_links" ADD CONSTRAINT "distribution_post_candidate_links_candidate_id_distribution_post_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."distribution_post_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_post_candidate_media" ADD CONSTRAINT "distribution_post_candidate_media_candidate_id_distribution_post_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."distribution_post_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_post_candidates" ADD CONSTRAINT "distribution_post_candidates_source_artifact_id_raw_archive_artifacts_id_fk" FOREIGN KEY ("source_artifact_id") REFERENCES "public"."raw_archive_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_post_candidates" ADD CONSTRAINT "distribution_post_candidates_promoted_node_id_ontology_nodes_id_fk" FOREIGN KEY ("promoted_node_id") REFERENCES "public"."ontology_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "distribution_post_links_source_idx" ON "distribution_post_candidate_links" USING btree ("source_registry_id");--> statement-breakpoint
CREATE INDEX "distribution_post_links_kind_idx" ON "distribution_post_candidate_links" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "distribution_post_media_source_idx" ON "distribution_post_candidate_media" USING btree ("source_registry_id");--> statement-breakpoint
CREATE INDEX "distribution_post_media_kind_idx" ON "distribution_post_candidate_media" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "distribution_post_source_message_uniq" ON "distribution_post_candidates" USING btree ("source_registry_id","message_id");--> statement-breakpoint
CREATE INDEX "distribution_post_specialty_idx" ON "distribution_post_candidates" USING btree ("specialty","source_registry_id");--> statement-breakpoint
CREATE INDEX "distribution_post_review_idx" ON "distribution_post_candidates" USING btree ("review_state","specialty");--> statement-breakpoint
CREATE INDEX "distribution_post_presence_idx" ON "distribution_post_candidates" USING btree ("source_presence","source_registry_id");--> statement-breakpoint
CREATE INDEX "distribution_post_promoted_idx" ON "distribution_post_candidates" USING btree ("promoted_node_id");