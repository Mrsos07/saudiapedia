import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "kingdom_cms"."page_views" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" varchar NOT NULL,
  	"views" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "meta_title" varchar;
  ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "meta_description" varchar;
  ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "canonical_u_r_l" varchar;
  ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "no_index" boolean DEFAULT false;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_meta_title" varchar;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_meta_description" varchar;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_canonical_u_r_l" varchar;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_no_index" boolean DEFAULT false;
  ALTER TABLE "kingdom_cms"."authors" ADD COLUMN "meta_description_ar" varchar;
  ALTER TABLE "kingdom_cms"."authors" ADD COLUMN "meta_description_en" varchar;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD COLUMN "page_views_id" integer;
  CREATE UNIQUE INDEX "page_views_day_idx" ON "kingdom_cms"."page_views" USING btree ("day");
  CREATE INDEX "page_views_updated_at_idx" ON "kingdom_cms"."page_views" USING btree ("updated_at");
  CREATE INDEX "page_views_created_at_idx" ON "kingdom_cms"."page_views" USING btree ("created_at");
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_page_views_fk" FOREIGN KEY ("page_views_id") REFERENCES "kingdom_cms"."page_views"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_page_views_id_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("page_views_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "kingdom_cms"."page_views" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "kingdom_cms"."page_views" CASCADE;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_page_views_fk";
  
  DROP INDEX "kingdom_cms"."payload_locked_documents_rels_page_views_id_idx";
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "meta_title";
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "meta_description";
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "canonical_u_r_l";
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "no_index";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_meta_title";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_meta_description";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_canonical_u_r_l";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_no_index";
  ALTER TABLE "kingdom_cms"."authors" DROP COLUMN "meta_description_ar";
  ALTER TABLE "kingdom_cms"."authors" DROP COLUMN "meta_description_en";
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" DROP COLUMN "page_views_id";`)
}
