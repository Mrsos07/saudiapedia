import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "kingdom_cms"."enum_articles_body_role" AS ENUM('overview', 'administration', 'geography', 'history', 'antiquities', 'heritage', 'religious', 'culture', 'economy', 'nature', 'tourism', 'services');
  CREATE TYPE "kingdom_cms"."enum_articles_entity_type" AS ENUM('region', 'governorate', 'city', 'site', 'person', 'event', 'topic');
  CREATE TYPE "kingdom_cms"."enum_articles_site_type" AS ENUM('historical', 'religious', 'tourism', 'nature', 'museum');
  CREATE TYPE "kingdom_cms"."enum__articles_v_version_body_role" AS ENUM('overview', 'administration', 'geography', 'history', 'antiquities', 'heritage', 'religious', 'culture', 'economy', 'nature', 'tourism', 'services');
  CREATE TYPE "kingdom_cms"."enum__articles_v_version_entity_type" AS ENUM('region', 'governorate', 'city', 'site', 'person', 'event', 'topic');
  CREATE TYPE "kingdom_cms"."enum__articles_v_version_site_type" AS ENUM('historical', 'religious', 'tourism', 'nature', 'museum');
  ALTER TABLE "kingdom_cms"."articles_body" ADD COLUMN "role" "kingdom_cms"."enum_articles_body_role";
  ALTER TABLE "kingdom_cms"."articles_body" ADD COLUMN "content" jsonb;
  ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "entity_type" "kingdom_cms"."enum_articles_entity_type";
  ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "site_type" "kingdom_cms"."enum_articles_site_type";
  ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "parent_id" integer;
  ALTER TABLE "kingdom_cms"."articles_rels" ADD COLUMN "articles_id" integer;
  ALTER TABLE "kingdom_cms"."_articles_v_version_body" ADD COLUMN "role" "kingdom_cms"."enum__articles_v_version_body_role";
  ALTER TABLE "kingdom_cms"."_articles_v_version_body" ADD COLUMN "content" jsonb;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_entity_type" "kingdom_cms"."enum__articles_v_version_entity_type";
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_site_type" "kingdom_cms"."enum__articles_v_version_site_type";
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_parent_id" integer;
  ALTER TABLE "kingdom_cms"."_articles_v_rels" ADD COLUMN "articles_id" integer;
  ALTER TABLE "kingdom_cms"."articles" ADD CONSTRAINT "articles_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "kingdom_cms"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."articles_rels" ADD CONSTRAINT "articles_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "kingdom_cms"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD CONSTRAINT "_articles_v_version_parent_id_articles_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "kingdom_cms"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kingdom_cms"."_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "kingdom_cms"."articles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_entity_type_idx" ON "kingdom_cms"."articles" USING btree ("entity_type");
  CREATE INDEX "articles_parent_idx" ON "kingdom_cms"."articles" USING btree ("parent_id");
  CREATE INDEX "articles_rels_articles_id_idx" ON "kingdom_cms"."articles_rels" USING btree ("articles_id");
  CREATE INDEX "_articles_v_version_version_entity_type_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_entity_type");
  CREATE INDEX "_articles_v_version_version_parent_idx" ON "kingdom_cms"."_articles_v" USING btree ("version_parent_id");
  CREATE INDEX "_articles_v_rels_articles_id_idx" ON "kingdom_cms"."_articles_v_rels" USING btree ("articles_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "kingdom_cms"."articles" DROP CONSTRAINT "articles_parent_id_articles_id_fk";
  
  ALTER TABLE "kingdom_cms"."articles_rels" DROP CONSTRAINT "articles_rels_articles_fk";
  
  ALTER TABLE "kingdom_cms"."_articles_v" DROP CONSTRAINT "_articles_v_version_parent_id_articles_id_fk";
  
  ALTER TABLE "kingdom_cms"."_articles_v_rels" DROP CONSTRAINT "_articles_v_rels_articles_fk";
  
  DROP INDEX "kingdom_cms"."articles_entity_type_idx";
  DROP INDEX "kingdom_cms"."articles_parent_idx";
  DROP INDEX "kingdom_cms"."articles_rels_articles_id_idx";
  DROP INDEX "kingdom_cms"."_articles_v_version_version_entity_type_idx";
  DROP INDEX "kingdom_cms"."_articles_v_version_version_parent_idx";
  DROP INDEX "kingdom_cms"."_articles_v_rels_articles_id_idx";
  ALTER TABLE "kingdom_cms"."articles_body" DROP COLUMN "role";
  ALTER TABLE "kingdom_cms"."articles_body" DROP COLUMN "content";
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "entity_type";
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "site_type";
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "parent_id";
  ALTER TABLE "kingdom_cms"."articles_rels" DROP COLUMN "articles_id";
  ALTER TABLE "kingdom_cms"."_articles_v_version_body" DROP COLUMN "role";
  ALTER TABLE "kingdom_cms"."_articles_v_version_body" DROP COLUMN "content";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_entity_type";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_site_type";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_parent_id";
  ALTER TABLE "kingdom_cms"."_articles_v_rels" DROP COLUMN "articles_id";
  DROP TYPE "kingdom_cms"."enum_articles_body_role";
  DROP TYPE "kingdom_cms"."enum_articles_entity_type";
  DROP TYPE "kingdom_cms"."enum_articles_site_type";
  DROP TYPE "kingdom_cms"."enum__articles_v_version_body_role";
  DROP TYPE "kingdom_cms"."enum__articles_v_version_entity_type";
  DROP TYPE "kingdom_cms"."enum__articles_v_version_site_type";`)
}
