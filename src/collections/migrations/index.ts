import * as migration_20260910_160547_initial from './20260910_160547_initial';
import * as migration_20260910_171110_editorial_catalogs from './20260910_171110_editorial_catalogs';
import * as migration_20260910_174014_analytics_and_seo from './20260910_174014_analytics_and_seo';
import * as migration_20260910_174727_seo_field_naming from './20260910_174727_seo_field_naming';
import * as migration_20260911_135151_manageable_sections from './20260911_135151_manageable_sections';

export const migrations = [
  {
    up: migration_20260910_160547_initial.up,
    down: migration_20260910_160547_initial.down,
    name: '20260910_160547_initial',
  },
  {
    up: migration_20260910_171110_editorial_catalogs.up,
    down: migration_20260910_171110_editorial_catalogs.down,
    name: '20260910_171110_editorial_catalogs',
  },
  {
    up: migration_20260910_174014_analytics_and_seo.up,
    down: migration_20260910_174014_analytics_and_seo.down,
    name: '20260910_174014_analytics_and_seo',
  },
  {
    up: migration_20260910_174727_seo_field_naming.up,
    down: migration_20260910_174727_seo_field_naming.down,
    name: '20260910_174727_seo_field_naming',
  },
  {
    up: migration_20260911_135151_manageable_sections.up,
    down: migration_20260911_135151_manageable_sections.down,
    name: '20260911_135151_manageable_sections'
  },
];
