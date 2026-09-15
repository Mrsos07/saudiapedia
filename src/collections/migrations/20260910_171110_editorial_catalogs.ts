import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "kingdom_cms"."enum_categories_section" AS ENUM('history', 'regions', 'people', 'heritage');
  CREATE TABLE "kingdom_cms"."articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer
  );
  
  CREATE TABLE "kingdom_cms"."_articles_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer
  );
  
  CREATE TABLE "kingdom_cms"."categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name_ar" varchar NOT NULL,
  	"name_en" varchar NOT NULL,
  	"section" "kingdom_cms"."enum_categories_section" NOT NULL,
  	"description_ar" varchar,
  	"description_en" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "kingdom_cms"."authors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name_ar" varchar NOT NULL,
  	"name_en" varchar NOT NULL,
  	"bio_ar" varchar,
  	"bio_en" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "category_ref_id" integer;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_category_ref_id" integer;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD COLUMN "authors_id" integer;
  ALTER TABLE "kingdom_cms"."articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "kingdom_cms"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."articles_rels" ADD CONSTRAINT "articles_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "kingdom_cms"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "kingdom_cms"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "kingdom_cms"."authors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_rels_order_idx" ON "kingdom_cms"."articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "kingdom_cms"."articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "kingdom_cms"."articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_authors_id_idx" ON "kingdom_cms"."articles_rels" USING btree ("authors_id");
  CREATE INDEX "_articles_v_rels_order_idx" ON "kingdom_cms"."_articles_v_rels" USING btree ("order");
  CREATE INDEX "_articles_v_rels_parent_idx" ON "kingdom_cms"."_articles_v_rels" USING btree ("parent_id");
  CREATE INDEX "_articles_v_rels_path_idx" ON "kingdom_cms"."_articles_v_rels" USING btree ("path");
  CREATE INDEX "_articles_v_rels_authors_id_idx" ON "kingdom_cms"."_articles_v_rels" USING btree ("authors_id");
  CREATE INDEX "categories_section_idx" ON "kingdom_cms"."categories" USING btree ("section");
  CREATE INDEX "categories_updated_at_idx" ON "kingdom_cms"."categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "kingdom_cms"."categories" USING btree ("created_at");
  CREATE INDEX "authors_updated_at_idx" ON "kingdom_cms"."authors" USING btree ("updated_at");
  CREATE INDEX "authors_created_at_idx" ON "kingdom_cms"."authors" USING btree ("created_at");
  ALTER TABLE "kingdom_cms"."articles" ADD CONSTRAINT "articles_category_ref_id_categories_id_fk" FOREIGN KEY ("category_ref_id") REFERENCES "kingdom_cms"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD CONSTRAINT "_articles_v_version_category_ref_id_categories_id_fk" FOREIGN KEY ("version_category_ref_id") REFERENCES "kingdom_cms"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "kingdom_cms"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "kingdom_cms"."authors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_category_ref_idx" ON "kingdom_cms"."articles" USING btree ("category_ref_id");
  CREATE INDEX "_articles_v_version_version_category_ref_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_category_ref_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_authors_id_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("authors_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "kingdom_cms"."articles_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "kingdom_cms"."_articles_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "kingdom_cms"."categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "kingdom_cms"."authors" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "kingdom_cms"."articles_rels" CASCADE;
  DROP TABLE "kingdom_cms"."_articles_v_rels" CASCADE;
  DROP TABLE "kingdom_cms"."categories" CASCADE;
  DROP TABLE "kingdom_cms"."authors" CASCADE;
  ALTER TABLE "kingdom_cms"."articles" DROP CONSTRAINT "articles_category_ref_id_categories_id_fk";
  
  ALTER TABLE "kingdom_cms"."_articles_v" DROP CONSTRAINT "_articles_v_version_category_ref_id_categories_id_fk";
  
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_categories_fk";
  
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_authors_fk";
  
  DROP INDEX "kingdom_cms"."articles_category_ref_idx";
  DROP INDEX "kingdom_cms"."_articles_v_version_version_category_ref_idx";
  DROP INDEX "kingdom_cms"."payload_locked_documents_rels_categories_id_idx";
  DROP INDEX "kingdom_cms"."payload_locked_documents_rels_authors_id_idx";
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "category_ref_id";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_category_ref_id";
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" DROP COLUMN "categories_id";
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" DROP COLUMN "authors_id";
  DROP TYPE "kingdom_cms"."enum_categories_section";`)
}
