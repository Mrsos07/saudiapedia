import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "kingdom_cms"."sections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"name_ar" varchar NOT NULL,
  	"name_en" varchar NOT NULL,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "kingdom_cms"."articles" ALTER COLUMN "section" SET DATA TYPE varchar;
  ALTER TABLE "kingdom_cms"."articles" ALTER COLUMN "section" DROP DEFAULT;
  ALTER TABLE "kingdom_cms"."_articles_v" ALTER COLUMN "version_section" SET DATA TYPE varchar;
  ALTER TABLE "kingdom_cms"."_articles_v" ALTER COLUMN "version_section" DROP DEFAULT;
  ALTER TABLE "kingdom_cms"."categories" ALTER COLUMN "section" SET DATA TYPE varchar;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD COLUMN "sections_id" integer;
  CREATE UNIQUE INDEX "sections_slug_idx" ON "kingdom_cms"."sections" USING btree ("slug");
  CREATE INDEX "sections_updated_at_idx" ON "kingdom_cms"."sections" USING btree ("updated_at");
  CREATE INDEX "sections_created_at_idx" ON "kingdom_cms"."sections" USING btree ("created_at");
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "kingdom_cms"."sections"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_sections_id_idx" ON "kingdom_cms"."payload_locked_documents_rels" USING btree ("sections_id");
  DROP TYPE "kingdom_cms"."enum_articles_section";
  DROP TYPE "kingdom_cms"."enum__articles_v_version_section";
  DROP TYPE "kingdom_cms"."enum_categories_section";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "kingdom_cms"."enum_articles_section" AS ENUM('history', 'regions', 'people', 'heritage');
  CREATE TYPE "kingdom_cms"."enum__articles_v_version_section" AS ENUM('history', 'regions', 'people', 'heritage');
  CREATE TYPE "kingdom_cms"."enum_categories_section" AS ENUM('history', 'regions', 'people', 'heritage');
  ALTER TABLE "kingdom_cms"."sections" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "kingdom_cms"."sections" CASCADE;
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sections_fk";
  
  DROP INDEX "kingdom_cms"."payload_locked_documents_rels_sections_id_idx";
  ALTER TABLE "kingdom_cms"."articles" ALTER COLUMN "section" SET DEFAULT 'history'::"kingdom_cms"."enum_articles_section";
  ALTER TABLE "kingdom_cms"."articles" ALTER COLUMN "section" SET DATA TYPE "kingdom_cms"."enum_articles_section" USING "section"::"kingdom_cms"."enum_articles_section";
  ALTER TABLE "kingdom_cms"."_articles_v" ALTER COLUMN "version_section" SET DEFAULT 'history'::"kingdom_cms"."enum__articles_v_version_section";
  ALTER TABLE "kingdom_cms"."_articles_v" ALTER COLUMN "version_section" SET DATA TYPE "kingdom_cms"."enum__articles_v_version_section" USING "version_section"::"kingdom_cms"."enum__articles_v_version_section";
  ALTER TABLE "kingdom_cms"."categories" ALTER COLUMN "section" SET DATA TYPE "kingdom_cms"."enum_categories_section" USING "section"::"kingdom_cms"."enum_categories_section";
  ALTER TABLE "kingdom_cms"."payload_locked_documents_rels" DROP COLUMN "sections_id";`)
}
