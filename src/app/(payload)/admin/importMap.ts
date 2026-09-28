import type { ImportMap } from 'payload';
import { EditorialDashboard } from '../../../components/admin/editorial-dashboard';
import { LoginFooter, LoginIntro, LoginLogo } from '../../../components/admin/login-intro';
import { AnalyticsView } from '../../../components/admin/analytics-view';
import { AnalyticsNavLink } from '../../../components/admin/analytics-nav-link';
import { ArticleSEO, AuthorSEO } from '../../../components/admin/seo-guidance';
import { SectionPicker } from '../../../components/admin/section-picker';
import { CollectionCards } from '@payloadcms/next/rsc';
import { S3ClientUploadHandler } from '@payloadcms/storage-s3/client';
import { LexicalDiffComponent, RscEntryLexicalCell, RscEntryLexicalField } from '@payloadcms/richtext-lexical/rsc';
import {
	BlockquoteFeatureClient, BoldFeatureClient, FixedToolbarFeatureClient, HeadingFeatureClient, InlineToolbarFeatureClient, ItalicFeatureClient,
	LinkFeatureClient, OrderedListFeatureClient, ParagraphFeatureClient, UnderlineFeatureClient, UnorderedListFeatureClient,
} from '@payloadcms/richtext-lexical/client';

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
	// Registered by s3Storage as an admin provider even with clientUploads: false;
	// it then receives enabled: false and only renders its children.
	'@payloadcms/storage-s3/client#S3ClientUploadHandler': S3ClientUploadHandler,
	// Lexical editor for Articles.body.content; exactly the features enabled in src/collections/article-editor.ts.
	'@payloadcms/richtext-lexical/rsc#RscEntryLexicalCell': RscEntryLexicalCell,
	'@payloadcms/richtext-lexical/rsc#RscEntryLexicalField': RscEntryLexicalField,
	'@payloadcms/richtext-lexical/rsc#LexicalDiffComponent': LexicalDiffComponent,
	'@payloadcms/richtext-lexical/client#ParagraphFeatureClient': ParagraphFeatureClient,
	'@payloadcms/richtext-lexical/client#HeadingFeatureClient': HeadingFeatureClient,
	'@payloadcms/richtext-lexical/client#BoldFeatureClient': BoldFeatureClient,
	'@payloadcms/richtext-lexical/client#ItalicFeatureClient': ItalicFeatureClient,
	'@payloadcms/richtext-lexical/client#UnderlineFeatureClient': UnderlineFeatureClient,
	'@payloadcms/richtext-lexical/client#UnorderedListFeatureClient': UnorderedListFeatureClient,
	'@payloadcms/richtext-lexical/client#OrderedListFeatureClient': OrderedListFeatureClient,
	'@payloadcms/richtext-lexical/client#BlockquoteFeatureClient': BlockquoteFeatureClient,
	'@payloadcms/richtext-lexical/client#LinkFeatureClient': LinkFeatureClient,
	'@payloadcms/richtext-lexical/client#FixedToolbarFeatureClient': FixedToolbarFeatureClient,
	'@payloadcms/richtext-lexical/client#InlineToolbarFeatureClient': InlineToolbarFeatureClient,
};