import type { CollectionConfig } from 'payload';
import { validAnalyticsDay } from '../lib/analytics';

/** Internal aggregate store. The endpoint uses a narrow atomic SQL upsert, not
 * Local API overrideAccess. Register and generate/review a migration separately. */
export const PageViews: CollectionConfig = {
  slug: 'page-views',
  dbName: 'page_views',
  labels: {
    singular: { ar: 'إجمالي المشاهدات اليومي', en: 'Daily page-view aggregate' },
    plural: { ar: 'إجماليات المشاهدات اليومية', en: 'Daily page-view aggregates' },
  },
  admin: { hidden: true },
  access: {
    admin: () => false,
    create: () => false,
    read: () => false,
    update: () => false,
    delete: () => false,
    readVersions: () => false,
    unlock: () => false,
  },
  timestamps: true,
  fields: [
    {
      name: 'day',
      label: { ar: 'اليوم بتوقيت الرياض', en: 'Day in Riyadh time' },
      type: 'text',
      required: true,
      unique: true,
      validate: (value: unknown) => validAnalyticsDay(value) || 'Use a valid YYYY-MM-DD date.',
    },
    {
      name: 'views',
      label: { ar: 'المشاهدات المسجلة', en: 'Recorded page views' },
      // Installed Postgres adapter generates numeric, not bigint. Do not change
      // its SQL type manually: preserve migration/schema-generator compatibility.
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
        || 'Use a nonnegative safe integer.',
    },
  ],
};