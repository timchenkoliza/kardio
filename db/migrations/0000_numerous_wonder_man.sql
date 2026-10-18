CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anonymous_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text NOT NULL,
	"specialty" text NOT NULL,
	"content_id" text NOT NULL,
	"url" text,
	"source_url" text,
	"credit" text,
	"caption" text,
	"status" text NOT NULL,
	"rights" text NOT NULL,
	"semantic_match" text NOT NULL,
	"width" integer,
	"height" integer,
	"raw" jsonb NOT NULL,
	CONSTRAINT "assets_specialty_id_pk" PRIMARY KEY("specialty","id")
);
--> statement-breakpoint
CREATE TABLE "content_objects" (
	"id" text NOT NULL,
	"specialty" text NOT NULL,
	"dataset_id" text NOT NULL,
	"kind" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"source_id" text NOT NULL,
	"canonical_url" text,
	"publication_date" text,
	"publication_year" integer,
	"updated_at" text,
	"last_checked_at" text,
	"language" text NOT NULL,
	"topics" jsonb NOT NULL,
	"tags" jsonb NOT NULL,
	"currentness" text NOT NULL,
	"requires_review" boolean NOT NULL,
	"freshness" text NOT NULL,
	"version" text,
	"parent_id" text,
	"supersedes_id" text,
	"superseded_by_id" text,
	"trust_layer" text NOT NULL,
	"editorial_status" text NOT NULL,
	"rights_status" text NOT NULL,
	"priority" integer NOT NULL,
	"author" text,
	"provenance" jsonb NOT NULL,
	"raw" jsonb NOT NULL,
	CONSTRAINT "content_objects_specialty_id_pk" PRIMARY KEY("specialty","id")
);
--> statement-breakpoint
CREATE TABLE "content_relationships" (
	"specialty" text NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "content_relationships_specialty_from_id_to_id_type_pk" PRIMARY KEY("specialty","from_id","to_id","type")
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"specialty" text NOT NULL,
	"checksum" text NOT NULL,
	"raw" jsonb NOT NULL,
	"manifest" jsonb NOT NULL,
	"enrichment" jsonb NOT NULL,
	"evaluation_manifest" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_items" (
	"dataset_id" text NOT NULL,
	"specialty" text NOT NULL,
	"content_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "evaluation_items_dataset_id_content_id_pk" PRIMARY KEY("dataset_id","content_id")
);
--> statement-breakpoint
CREATE TABLE "source_observations" (
	"id" text NOT NULL,
	"specialty" text NOT NULL,
	"raw" jsonb NOT NULL,
	CONSTRAINT "source_observations_specialty_id_pk" PRIMARY KEY("specialty","id")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text NOT NULL,
	"specialty" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"publisher" text,
	"url" text,
	"trust_status" text NOT NULL,
	"commercial_status" text NOT NULL,
	"metadata_completeness" integer NOT NULL,
	"notes" text,
	"last_checked_at" text,
	"raw" jsonb NOT NULL,
	CONSTRAINT "sources_specialty_id_pk" PRIMARY KEY("specialty","id")
);
--> statement-breakpoint
CREATE TABLE "evidence_records" (
	"id" text PRIMARY KEY NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"target_property" text,
	"type" text NOT NULL,
	"source_node_id" text,
	"external_url" text,
	"artifact_ref" text,
	"captured_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"extraction_method" text NOT NULL,
	"confidence" double precision,
	"verification" text NOT NULL,
	"reviewer" text,
	"rights_state" text,
	"valid_from" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "node_state_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"node_id" text NOT NULL,
	"dimension" text NOT NULL,
	"value" text NOT NULL,
	"evidence_id" text,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ontology_domain_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"subject_node_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"evidence_id" text,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ontology_edge_evidence" (
	"edge_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	CONSTRAINT "ontology_edge_evidence_edge_id_evidence_id_pk" PRIMARY KEY("edge_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "ontology_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"review_state" text NOT NULL,
	"confidence" double precision,
	"attributes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ontology_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"specialty" text,
	"label" text NOT NULL,
	"original_id" text,
	"namespace" text NOT NULL,
	"attributes" jsonb NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_archive_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_item_id" text NOT NULL,
	"parent_provider_item_id" text,
	"source_registry_id" text,
	"specialty" text,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" double precision,
	"provider_modified_at" timestamp with time zone,
	"checksum" text,
	"materialized_locator" text,
	"sync_state" text NOT NULL,
	"promoted_node_id" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_specialty_content_id_content_objects_specialty_id_fk" FOREIGN KEY ("specialty","content_id") REFERENCES "public"."content_objects"("specialty","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_objects" ADD CONSTRAINT "content_objects_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_objects" ADD CONSTRAINT "content_objects_specialty_source_id_sources_specialty_id_fk" FOREIGN KEY ("specialty","source_id") REFERENCES "public"."sources"("specialty","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_relationships" ADD CONSTRAINT "content_relationships_specialty_from_id_content_objects_specialty_id_fk" FOREIGN KEY ("specialty","from_id") REFERENCES "public"."content_objects"("specialty","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_relationships" ADD CONSTRAINT "content_relationships_specialty_to_id_content_objects_specialty_id_fk" FOREIGN KEY ("specialty","to_id") REFERENCES "public"."content_objects"("specialty","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_items" ADD CONSTRAINT "evaluation_items_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_items" ADD CONSTRAINT "evaluation_items_specialty_content_id_content_objects_specialty_id_fk" FOREIGN KEY ("specialty","content_id") REFERENCES "public"."content_objects"("specialty","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_source_node_id_ontology_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."ontology_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_state_facts" ADD CONSTRAINT "node_state_facts_node_id_ontology_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."ontology_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_state_facts" ADD CONSTRAINT "node_state_facts_evidence_id_evidence_records_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ontology_domain_events" ADD CONSTRAINT "ontology_domain_events_subject_node_id_ontology_nodes_id_fk" FOREIGN KEY ("subject_node_id") REFERENCES "public"."ontology_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ontology_domain_events" ADD CONSTRAINT "ontology_domain_events_evidence_id_evidence_records_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ontology_edge_evidence" ADD CONSTRAINT "ontology_edge_evidence_edge_id_ontology_edges_id_fk" FOREIGN KEY ("edge_id") REFERENCES "public"."ontology_edges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ontology_edge_evidence" ADD CONSTRAINT "ontology_edge_evidence_evidence_id_evidence_records_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ontology_edges" ADD CONSTRAINT "ontology_edges_from_id_ontology_nodes_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."ontology_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ontology_edges" ADD CONSTRAINT "ontology_edges_to_id_ontology_nodes_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."ontology_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_archive_artifacts" ADD CONSTRAINT "raw_archive_artifacts_promoted_node_id_ontology_nodes_id_fk" FOREIGN KEY ("promoted_node_id") REFERENCES "public"."ontology_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_event_created_idx" ON "analytics_events" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "assets_content_idx" ON "assets" USING btree ("specialty","content_id");--> statement-breakpoint
CREATE INDEX "content_specialty_kind_idx" ON "content_objects" USING btree ("specialty","kind");--> statement-breakpoint
CREATE INDEX "content_source_idx" ON "content_objects" USING btree ("specialty","source_id");--> statement-breakpoint
CREATE INDEX "sources_specialty_idx" ON "sources" USING btree ("specialty");--> statement-breakpoint
CREATE INDEX "evidence_target_idx" ON "evidence_records" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "evidence_source_idx" ON "evidence_records" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "evidence_expiry_idx" ON "evidence_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "node_state_history_idx" ON "node_state_facts" USING btree ("node_id","dimension","recorded_at");--> statement-breakpoint
CREATE INDEX "ontology_events_subject_idx" ON "ontology_domain_events" USING btree ("subject_node_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ontology_events_type_idx" ON "ontology_domain_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "ontology_edges_from_type_idx" ON "ontology_edges" USING btree ("from_id","type");--> statement-breakpoint
CREATE INDEX "ontology_edges_to_type_idx" ON "ontology_edges" USING btree ("to_id","type");--> statement-breakpoint
CREATE INDEX "ontology_nodes_type_idx" ON "ontology_nodes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ontology_nodes_specialty_type_idx" ON "ontology_nodes" USING btree ("specialty","type");--> statement-breakpoint
CREATE INDEX "ontology_nodes_original_idx" ON "ontology_nodes" USING btree ("namespace","original_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_archive_provider_item_uniq" ON "raw_archive_artifacts" USING btree ("provider","provider_item_id");--> statement-breakpoint
CREATE INDEX "raw_archive_specialty_idx" ON "raw_archive_artifacts" USING btree ("specialty","source_registry_id");--> statement-breakpoint
CREATE INDEX "raw_archive_promoted_node_idx" ON "raw_archive_artifacts" USING btree ("promoted_node_id");