import type { ImportMap } from 'payload';
import { EditorialDashboard } from '../../../components/admin/editorial-dashboard';
import { LoginFooter, LoginIntro, LoginLogo } from '../../../components/admin/login-intro';
import { AnalyticsView } from '../../../components/admin/analytics-view';
import { AnalyticsNavLink } from '../../../components/admin/analytics-nav-link';
import { ArticleSEO, AuthorSEO } from '../../../components/admin/seo-guidance';
import { SectionPicker } from '../../../components/admin/section-picker';
import { CollectionCards } from '@payloadcms/next/rsc';

// Explicit map: automatic generation is disabled to keep registrations reviewed.
// `CollectionCards` is Payload's own built-in dashboard widget; sanitizeConfig
// always registers it under this key (src/config/sanitize.js), so it must be
// present here too even though this project never imported it directly.
export const importMap: ImportMap = {
	'/components/admin/editorial-dashboard#EditorialDashboard': EditorialDashboard,
	'/components/admin/login-intro#LoginIntro': LoginIntro,
	'/components/admin/login-intro#LoginFooter': LoginFooter,
	'/components/admin/login-intro#LoginLogo': LoginLogo,
	'/components/admin/analytics-view#AnalyticsView': AnalyticsView,
	'/components/admin/analytics-nav-link#AnalyticsNavLink': AnalyticsNavLink,
	'/components/admin/seo-guidance#ArticleSEO': ArticleSEO,
	'/components/admin/seo-guidance#AuthorSEO': AuthorSEO,
	'/components/admin/section-picker#SectionPicker': SectionPicker,
	'@payloadcms/next/rsc#CollectionCards': CollectionCards,
};