import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "kingdom_cms"."enum_users_role" AS ENUM('administrator', 'editor', 'translator', 'reviewer');
  CREATE TYPE "kingdom_cms"."enum_articles_locale" AS ENUM('ar', 'en');
  CREATE TYPE "kingdom_cms"."enum_articles_section" AS ENUM('history', 'regions', 'people', 'heritage');
  CREATE TYPE "kingdom_cms"."enum_articles_kind" AS ENUM('ruler', 'notable');
  CREATE TYPE "kingdom_cms"."enum_articles_review_status" AS ENUM('draft', 'factual-review', 'translation-review', 'approved');
  CREATE TYPE "kingdom_cms"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "kingdom_cms"."enum__articles_v_version_locale" AS ENUM('ar', 'en');
  CREATE TYPE "kingdom_cms"."enum__articles_v_version_section" AS ENUM('history', 'regions', 'people', 'heritage');
  CREATE TYPE "kingdom_cms"."enum__articles_v_version_kind" AS ENUM('ruler', 'notable');
  CREATE TYPE "kingdom_cms"."enum__articles_v_version_review_status" AS ENUM('draft', 'factual-review', 'translation-review', 'approved');
  CREATE TYPE "kingdom_cms"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "kingdom_cms"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "kingdom_cms"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "kingdom_cms"."enum_users_role" DEFAULT 'editor' NOT NULL,
  	"bootstrap_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "kingdom_cms"."articles_facts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar
  );
  
  CREATE TABLE "kingdom_cms"."articles_body" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "kingdom_cms"."articles_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"url" varchar
  );
  
  CREATE TABLE "kingdom_cms"."articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"locale" "kingdom_cms"."enum_articles_locale" DEFAULT 'ar',
  	"translation_key" varchar,
  	"section" "kingdom_cms"."enum_articles_section" DEFAULT 'history',
  	"slug" varchar,
  	"summary" varchar,
  	"category" varchar,
  	"period" varchar,
  	"kind" "kingdom_cms"."enum_articles_kind",
  	"featured" boolean DEFAULT false,
  	"image_id" integer,
  	"image_alt" varchar,
  	"review_status" "kingdom_cms"."enum_articles_review_status" DEFAULT 'draft',
  	"reviewed_by_id" integer,
  	"reviewed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "kingdom_cms"."enum_articles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "kingdom_cms"."_articles_v_version_facts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "kingdom_cms"."_articles_v_version_body" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "kingdom_cms"."_articles_v_version_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "kingdom_cms"."_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_locale" "kingdom_cms"."enum__articles_v_version_locale" DEFAULT 'ar',
  	"version_translation_key" varchar,
  	"version_section" "kingdom_cms"."enum__articles_v_version_section" DEFAULT 'history',
  	"version_slug" varchar,
  	"version_summary" varchar,
  	"version_category" varchar,
  	"version_period" varchar,
  	"version_kind" "kingdom_cms"."enum__articles_v_version_kind",
  	"version_featured" boolean DEFAULT false,
  	"version_image_id" integer,
  	"version_image_alt" varchar,
  	"version_review_status" "kingdom_cms"."enum__articles_v_version_review_status" DEFAULT 'draft',
  	"version_reviewed_by_id" integer,
  	"version_reviewed_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "kingdom_cms"."enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "kingdom_cms"."sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"publisher" varchar,
  	"accessed_at" timestamp(3) with time zone,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "kingdom_cms"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"attribution" varchar NOT NULL,
  	"license" varchar NOT NULL,
  	"published" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "kingdom_cms"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "kingdom_cms"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "kingdom_cms"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"articles_id" integer,
  	"sources_id" integer,
  	"media_id" integer
  );
  
  CREATE TABLE "kingdom_cms"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "kingdom_cms"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "kingdom_cms"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "kingdom_cms"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "kingdom_cms"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."articles_facts" ADD CONSTRAINT "articles_facts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "kingdom_cms"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."articles_body" ADD CONSTRAINT "articles_body_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "kingdom_cms"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."articles_sources" ADD CONSTRAINT "articles_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "kingdom_cms"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."articles" ADD CONSTRAINT "articles_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "kingdom_cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."articles" ADD CONSTRAINT "articles_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "kingdom_cms"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v_version_facts" ADD CONSTRAINT "_articles_v_version_facts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "kingdom_cms"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v_version_body" ADD CONSTRAINT "_articles_v_version_body_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "kingdom_cms"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v_version_sources" ADD CONSTRAINT "_articles_v_version_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "kingdom_cms"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "kingdom_cms"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD CONSTRAINT "_articles_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "kingdom_cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD CONSTRAINT "_articles_v_version_reviewed_by_id_users_id_fk" FOREIGN KEY ("version_reviewed_by_id") REFERENCES "kingdom_cms"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "kingdom_cms"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "kingdom_cms"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "kingdom_cms"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "kingdom_cms"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "kingdom_cms"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "kingdom_cms"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "kingdom_cms"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "kingdom_cms"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "kingdom_cms"."users_sessions" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "users_bootstrap_key_idx" ON "kingdom_cms"."users" USING btree ("bootstrap_key");
  CREATE INDEX "users_updated_at_idx" ON "kingdom_cms"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "kingdom_cms"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "kingdom_cms"."users" USING btree ("email");
  CREATE INDEX "articles_facts_order_idx" ON "kingdom_cms"."articles_facts" USING btree ("_order");
  CREATE INDEX "articles_facts_parent_id_idx" ON "kingdom_cms"."articles_facts" USING btree ("_parent_id");
  CREATE INDEX "articles_body_order_idx" ON "kingdom_cms"."articles_body" USING btree ("_order");
  CREATE INDEX "articles_body_parent_id_idx" ON "kingdom_cms"."articles_body" USING btree ("_parent_id");
  CREATE INDEX "articles_sources_order_idx" ON "kingdom_cms"."articles_sources" USING btree ("_order");
  CREATE INDEX "articles_sources_parent_id_idx" ON "kingdom_cms"."articles_sources" USING btree ("_parent_id");
  CREATE INDEX "articles_locale_idx" ON "kingdom_cms"."articles" USING btree ("locale");
  CREATE INDEX "articles_section_idx" ON "kingdom_cms"."articles" USING btree ("section");
  CREATE INDEX "articles_image_idx" ON "kingdom_cms"."articles" USING btree ("image_id");
  CREATE INDEX "articles_review_status_idx" ON "kingdom_cms"."articles" USING btree ("review_status");
  CREATE INDEX "articles_reviewed_by_idx" ON "kingdom_cms"."articles" USING btree ("reviewed_by_id");
  CREATE INDEX "articles_updated_at_idx" ON "kingdom_cms"."articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "kingdom_cms"."articles" USING btree ("created_at");
  CREATE INDEX "articles__status_idx" ON "kingdom_cms"."articles" USING btree ("_status");
  CREATE UNIQUE INDEX "slug_locale_section_idx" ON "kingdom_cms"."articles" USING btree ("slug","locale","section");
  CREATE UNIQUE INDEX "translationKey_locale_idx" ON "kingdom_cms"."articles" USING btree ("translation_key","locale");
  CREATE INDEX "_articles_v_version_facts_order_idx" ON "kingdom_cms"."_articles_v_version_facts" USING btree ("_order");
  CREATE INDEX "_articles_v_version_facts_parent_id_idx" ON "kingdom_cms"."_articles_v_version_facts" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_body_order_idx" ON "kingdom_cms"."_articles_v_version_body" USING btree ("_order");
  CREATE INDEX "_articles_v_version_body_parent_id_idx" ON "kingdom_cms"."_articles_v_version_body" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_sources_order_idx" ON "kingdom_cms"."_articles_v_version_sources" USING btree ("_order");
  CREATE INDEX "_articles_v_version_sources_parent_id_idx" ON "kingdom_cms"."_articles_v_version_sources" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_parent_idx" ON "kingdom_cms"."_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_locale_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_locale");
  CREATE INDEX "_articles_v_version_version_section_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_section");
  CREATE INDEX "_articles_v_version_version_image_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_image_id");
  CREATE INDEX "_articles_v_version_version_review_status_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_review_status");
  CREATE INDEX "_articles_v_version_version_reviewed_by_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_reviewed_by_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "kingdom_cms"."_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "kingdom_cms"."_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "kingdom_cms"."_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_latest_idx" ON "kingdom_cms"."_articles_v" USING btree ("latest");
  CREATE INDEX "version_slug_version_locale_version_section_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_slug","version_locale","version_section");
  CREATE INDEX "version_translationKey_version_locale_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_translation_key","version_locale");
  CREATE INDEX "sources_updated_at_idx" ON "kingdom_cms"."sources" USING btree ("updated_at");
  CREATE INDEX "sources_created_at_idx" ON "kingdom_cms"."sources" USING btree ("created_at");
  CREATE INDEX "media_published_idx" ON "kingdom_cms"."media" USING btree ("published");
  CREATE INDEX "media_updated_at_idx" ON "kingdom_cms"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "kingdom_cms"."media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "kingdom_cms"."media" USING btree ("filename");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "kingdom_cms"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "kingdom_cms"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "kingdom_cms"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "kingdom_cms"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_sources_id_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("sources_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_preferences_key_idx" ON "kingdom_cms"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "kingdom_cms"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "kingdom_cms"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "kingdom_cms"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "kingdom_cms"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "kingdom_cms"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "kingdom_cms"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "kingdom_cms"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "kingdom_cms"."payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "kingdom_cms"."users_sessions" CASCADE;
  DROP TABLE "kingdom_cms"."users" CASCADE;
  DROP TABLE "kingdom_cms"."articles_facts" CASCADE;
  DROP TABLE "kingdom_cms"."articles_body" CASCADE;
  DROP TABLE "kingdom_cms"."articles_sources" CASCADE;
  DROP TABLE "kingdom_cms"."articles" CASCADE;
  DROP TABLE "kingdom_cms"."_articles_v_version_facts" CASCADE;
  DROP TABLE "kingdom_cms"."_articles_v_version_body" CASCADE;
  DROP TABLE "kingdom_cms"."_articles_v_version_sources" CASCADE;
  DROP TABLE "kingdom_cms"."_articles_v" CASCADE;
  DROP TABLE "kingdom_cms"."sources" CASCADE;
  DROP TABLE "kingdom_cms"."media" CASCADE;
  DROP TABLE "kingdom_cms"."payload_kv" CASCADE;
  DROP TABLE "kingdom_cms"."payload_locked_documents" CASCADE;
  DROP TABLE "kingdom_cms"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "kingdom_cms"."payload_preferences" CASCADE;
  DROP TABLE "kingdom_cms"."payload_preferences_rels" CASCADE;
  DROP TABLE "kingdom_cms"."payload_migrations" CASCADE;
  DROP TYPE "kingdom_cms"."enum_users_role";
  DROP TYPE "kingdom_cms"."enum_articles_locale";
  DROP TYPE "kingdom_cms"."enum_articles_section";
  DROP TYPE "kingdom_cms"."enum_articles_kind";
  DROP TYPE "kingdom_cms"."enum_articles_review_status";
  DROP TYPE "kingdom_cms"."enum_articles_status";
  DROP TYPE "kingdom_cms"."enum__articles_v_version_locale";
  DROP TYPE "kingdom_cms"."enum__articles_v_version_section";
  DROP TYPE "kingdom_cms"."enum__articles_v_version_kind";
  DROP TYPE "kingdom_cms"."enum__articles_v_version_review_status";
  DROP TYPE "kingdom_cms"."enum__articles_v_version_status";`)
}
