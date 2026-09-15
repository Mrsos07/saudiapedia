import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_seo_title" varchar;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_seo_description" varchar;
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "meta_title";
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "meta_description";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_meta_title";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_meta_description";
  ALTER TABLE "kingdom_cms"."authors" DROP COLUMN "meta_description_ar";
  ALTER TABLE "kingdom_cms"."authors" DROP COLUMN "meta_description_en";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "meta_title" varchar;
  ALTER TABLE "kingdom_cms"."articles" ADD COLUMN "meta_description" varchar;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_meta_title" varchar;
  ALTER TABLE "kingdom_cms"."_articles_v" ADD COLUMN "version_meta_description" varchar;
  ALTER TABLE "kingdom_cms"."authors" ADD COLUMN "meta_description_ar" varchar;
  ALTER TABLE "kingdom_cms"."authors" ADD COLUMN "meta_description_en" varchar;
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "seo_title";
  ALTER TABLE "kingdom_cms"."articles" DROP COLUMN "seo_description";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_seo_title";
  ALTER TABLE "kingdom_cms"."_articles_v" DROP COLUMN "version_seo_description";`)
}
