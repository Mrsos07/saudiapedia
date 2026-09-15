import { randomUUID } from 'node:crypto';
import { APIError, type Access, type CollectionBeforeChangeHook, type CollectionBeforeOperationHook, type CollectionConfig } from 'payload';
import { canReview, hasRole, isAdmin, isStaff, nonEmpty, publishedArticleWhere, roles, validHTTPURL, validateURL } from './access';
import { decodePublicArticle, groupPublicArticles, matchingPublicPair, type PublicArticle } from './public-articles';
import { canonicalRelationshipID, canonicalRelationshipIDs, MAX_ARTICLE_AUTHORS, sameEditorialRelations, validateEditorialRelations, type EditorialRelations } from './editorial-relations';

export const readPairedArticles: Access = async ({ req }) => {
  if (hasRole(req, roles)) return true;
  const articles: PublicArticle[] = [];
  const editorial = new Map<string, EditorialRelations>();
  let page = 1;
  do {
    // Intentional, server-only adapter read: main documents, fixed publication
    // predicate, explicit projection, no client where/context override and no
    // relationship population. It cannot recurse into collection access/hooks.
    // Only eligible IDs escape this check, never the raw adapter documents.
    const result = await req.payload.db.find<unknown>({
      collection: 'articles', req, where: publishedArticleWhere,
      draftsEnabled: false, joins: false, pagination: true, limit: 100, page, sort: 'id',
      select: {
        id: true, _status: true, reviewStatus: true, locale: true, translationKey: true,
        section: true, slug: true, title: true, summary: true, category: true,
        period: true, kind: true, featured: true, image: true, imageAlt: true,
        facts: true, body: true, sources: true, categoryRef: true, authors: true,
      },
    });
    for (const doc of result.docs) {
      const article = decodePublicArticle(doc);
      if (!doc || typeof doc !== 'object') throw new Error('Invalid article document');
      const relations = { categoryRef: 'categoryRef' in doc ? doc.categoryRef : undefined, authors: 'authors' in doc ? doc.authors : undefined };
      canonicalRelationshipID(relations.categoryRef);
      canonicalRelationshipIDs(relations.authors);
      editorial.set(String(article.id), relations);
      articles.push(article);
    }
    if (!result.hasNextPage) break;
    page += 1;
  } while (true);
  const ids: (number | string)[] = [];
  for (const pair of groupPublicArticles(articles).values()) {
    const ar = pair.find((article) => article.locale === 'ar');
    const en = pair.find((article) => article.locale === 'en');
    if (pair.length === 2 && ar && en && matchingPublicPair(ar, en)
      && sameEditorialRelations(editorial.get(String(ar.id)) ?? {}, editorial.get(String(en.id)) ?? {})) ids.push(ar.id, en.id);
  }
  // Retain the status predicate on the actual read too. Never cache this result:
  // a later request must immediately notice either translation being unpublished.
  // An empty Where result means an empty public inventory, not a forbidden CMS.
  // Returning false would make Payload's default Local API throw a 403 here.
  return { and: [publishedArticleWhere, { id: { in: ids } }] };
};

// Historical constant retained only for the (unused) exhaustive-migration case;
// the actual set of valid sections is now the `sections` collection, resolved
// dynamically in enforceArticleWorkflow via req.payload. Do not reintroduce a
// second hardcoded list; that caused divergent validation before this change.
const reviewStates = ['draft', 'factual-review', 'translation-review', 'approved'];
const substantiveFields = [
  'locale', 'translationKey', 'section', 'slug', 'title', 'summary', 'category', 'period',
  'kind', 'featured', 'image', 'imageAlt', 'facts', 'body', 'sources', 'categoryRef', 'authors',
];
const approvalIntent = new WeakMap<object, boolean>();

// Payload normally saves draft=true only into versions, leaving the old public
// document live. This encyclopedia intentionally persists every edit to the main
// document too, so unpublishing and unique constraints take effect immediately.
export const persistEditorialDraft: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if ((operation === 'create' || operation === 'update') && 'data' in args) {
    // beforeValidate later merges omitted fields from the original document.
    // Capture intent before that happens: an inherited approved value is not approval.
    approvalIntent.set(req, args.data?.reviewStatus === 'approved');
    if (args.draft && args.data && args.data._status !== 'published') args.data._status = 'draft';
    args.draft = false;
  }
  if (operation === 'restoreVersion') {
    approvalIntent.set(req, false);
    if (!canReview(req)) throw new APIError('Only reviewers and administrators may restore versions.', 403);
    if ('draft' in args && args.draft) {
      throw new APIError('Draft-only version restore is disabled. Use normal restore; editorial validation still applies.', 400);
    }
  }
  return args;
};

// Ignore Payload row IDs and populated relationship shapes when comparing content.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id')
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function contentChanged(data: Record<string, unknown>, original: Record<string, unknown>): boolean {
  return substantiveFields.some((key) => {
    if (!(key in data)) return false;
    const normalize = (value: unknown) => key === 'categoryRef' ? canonicalRelationshipID(value)
      : key === 'authors' ? canonicalRelationshipIDs(value)
      : key === 'image' && value && typeof value === 'object' && 'id' in value
      ? value.id : canonical(value);
    return JSON.stringify(normalize(data[key])) !== JSON.stringify(normalize(original[key]));
  });
}

function requirePublishable(doc: Record<string, unknown>) {
  for (const field of ['title', 'summary', 'category', 'slug', 'translationKey']) {
    if (!nonEmpty(doc[field])) throw new APIError(`${field} is required for approval.`, 400);
  }
  if (!Array.isArray(doc.body) || !doc.body.length || doc.body.some((row) => !nonEmpty(row?.heading) || !nonEmpty(row?.text))) {
    throw new APIError('Approval requires at least one complete body section (heading and text).', 400);
  }
  if (!Array.isArray(doc.sources) || !doc.sources.length || doc.sources.some((row) => !nonEmpty(row?.title) || !validHTTPURL(row?.url))) {
    throw new APIError('Approval requires at least one source with a title and HTTP(S) URL.', 400);
  }
  if (Array.isArray(doc.facts) && doc.facts.some((row) => !nonEmpty(row?.label) || !nonEmpty(row?.value))) {
    throw new APIError('Complete or remove empty fact rows before approval.', 400);
  }
}

export const enforceArticleWorkflow: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (!hasRole(req, roles)) throw new APIError('An editorial account is required.', 403);
  const original = originalDoc ?? {};
  const merged = { ...original, ...data };
  if (!['ar', 'en'].includes(merged.locale)) throw new APIError('Locale must be ar or en.', 400);
  if (data.section !== undefined && data.section !== original.section) {
    if (!nonEmpty(data.section)) throw new APIError('Invalid section.', 400);
    const match = await req.payload.count({
      collection: 'sections', overrideAccess: false, user: req.user, req, where: { slug: { equals: data.section } },
    });
    if (match.totalDocs !== 1) throw new APIError('Invalid section. Choose an existing encyclopedia section.', 400);
  } else if (!nonEmpty(merged.section)) {
    throw new APIError('Invalid section.', 400);
  }
  if (!nonEmpty(merged.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(merged.slug)) {
    throw new APIError('Use a lowercase ASCII slug with single hyphens.', 400);
  }
  if (!nonEmpty(merged.translationKey) || merged.translationKey.length > 160) {
    throw new APIError('A translation key of 1–160 characters is required.', 400);
  }
  if (original.translationKey && data.translationKey !== undefined && data.translationKey !== original.translationKey) {
    throw new APIError('Translation keys are stable and cannot be changed after creation.', 400);
  }
  if (!reviewStates.includes(merged.reviewStatus)) throw new APIError('Invalid review status.', 400);
  if (!['draft', 'published'].includes(merged._status ?? 'draft')) throw new APIError('Invalid publication status.', 400);

  const reviewer = canReview(req);
  const changed = Boolean(originalDoc) && contentChanged(data, original);
  const wasReviewed = original.reviewStatus === 'approved' || original._status === 'published';
  const explicitApproval = data.reviewStatus === 'approved' && reviewer && approvalIntent.get(req) === true;

  if (data.reviewStatus === 'approved' && !reviewer && original.reviewStatus !== 'approved') {
    throw new APIError('Only a reviewer or administrator can approve an article.', 403);
  }
  // A save from a published document's editor UI can carry the old status.
  // Such edits must unpublish, never silently preserve approval.
  if (changed && wasReviewed && !explicitApproval) {
    data.reviewStatus = 'draft';
    data._status = 'draft';
  } else if (data._status === 'published' && !reviewer && original._status !== 'published') {
    throw new APIError('Only a reviewer or administrator can publish an article.', 403);
  }

  const next = { ...original, ...data };
  if (next.reviewStatus !== 'approved') {
    data.reviewedBy = null;
    data.reviewedAt = null;
    if (next._status === 'published') {
      if (data._status === 'published' && reviewer) throw new APIError('Approve the article before publishing.', 400);
      data._status = 'draft';
    }
  } else if (explicitApproval) {
    requirePublishable(next);
    data.reviewedBy = req.user!.id;
    data.reviewedAt = new Date().toISOString();
  } else {
    // Audit fields can never be supplied by a client or preserved from a forged version.
    data.reviewedBy = original.reviewedBy;
    data.reviewedAt = original.reviewedAt;
  }
  if ((data._status ?? original._status) === 'published') {
    requirePublishable({ ...next, ...data });
    if (!(data.reviewedBy ?? original.reviewedBy) || !(data.reviewedAt ?? original.reviewedAt)) {
      throw new APIError('Explicit reviewer approval is required before publishing.', 400);
    }
  }
  return data;
};

export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: { singular: { ar: 'مقال', en: 'Article' }, plural: { ar: 'المقالات', en: 'Articles' } },
  admin: {
    group: { ar: 'المحتوى', en: 'Content' },
    useAsTitle: 'title',
    defaultColumns: ['title', 'locale', 'section', 'reviewStatus', '_status'],
    description: { ar: 'وثيقة لكل لغة. اربط الترجمتين بمفتاح ترجمة وقسم ورابط واحد، وبالتصنيف والكتّاب أنفسهم.', en: 'One document per language. Match translation key, section, slug, category reference and authors between translations.' },
  },
  access: {
    create: isStaff, update: isStaff, delete: isAdmin,
    read: readPairedArticles,
    readVersions: isStaff,
  },
  versions: { drafts: true, maxPerDoc: 50 },
  indexes: [
    { fields: ['slug', 'locale', 'section'], unique: true },
    { fields: ['translationKey', 'locale'], unique: true },
  ],
  hooks: { beforeOperation: [persistEditorialDraft], beforeValidate: [validateEditorialRelations], beforeChange: [enforceArticleWorkflow] },
  fields: [
    { name: 'title', label: { ar: 'عنوان المقال', en: 'Article title' }, type: 'text', required: true },
    { name: 'locale', label: { ar: 'لغة المقال', en: 'Article language' }, type: 'select', required: true, defaultValue: 'ar', options: [{ value: 'ar', label: { ar: 'العربية', en: 'Arabic' } }, { value: 'en', label: { ar: 'الإنجليزية', en: 'English' } }], index: true },
    {
      name: 'translationKey', label: { ar: 'مفتاح ربط الترجمة', en: 'Translation key' }, type: 'text', required: true, defaultValue: () => randomUUID(), maxLength: 160,
      admin: { description: { ar: 'يُولّد تلقائيًا. انسخ مفتاح المقال الأصلي عند إنشاء ترجمته؛ لا يتغير بعد الحفظ.', en: 'Generated automatically. Copy the original key when creating its translation; immutable after saving.' } },
    },
    {
      // A plain text field storing the section's stable slug — not a select
      // enum and not a relationship. This keeps every public read path
      // (decodePublicArticle, mergePair, JSON-LD, entryPath) working with a
      // simple string, while enforceArticleWorkflow validates it dynamically
      // against the sections collection below. Converting this to a Postgres
      // enum or a relationship column is a separate, riskier structural
      // migration that was deliberately not done here.
      name: 'section', label: { ar: 'القسم', en: 'Section' }, type: 'text', required: true, index: true,
      admin: {
        description: { ar: 'أدخل رابط القسم (slug) كما هو مسجَّل في «أقسام الموسوعة». يحدّد مسار المقال في الموقع العام.', en: 'Enter the section’s slug exactly as registered under Encyclopedia sections. Determines the article’s public URL path.' },
        components: { Field: '/components/admin/section-picker#SectionPicker' },
      },
    },
    { name: 'categoryRef', label: { ar: 'التصنيف المرتبط', en: 'Linked category' }, type: 'relationship', relationTo: 'categories', maxDepth: 0,
      access: { read: ({ req }) => hasRole(req, roles) },
      admin: { description: { ar: 'اختر تصنيفًا من قسم المقال. العلاقة خاصة بالتحرير ويجب أن تتطابق في الترجمتين.', en: 'Choose a category from this section. This private editorial association must match both translations.' } } },
    { name: 'authors', label: { ar: 'الكتّاب', en: 'Authors' }, type: 'relationship', relationTo: 'authors', hasMany: true, maxRows: MAX_ARTICLE_AUTHORS, maxDepth: 0,
      access: { read: ({ req }) => hasRole(req, roles) }, admin: { description: { ar: 'ملفات الكتّاب مستقلة عن حسابات الدخول. حافظ على ترتيبهم نفسه في الترجمتين.', en: 'Author profiles are separate from login accounts. Keep the same order in both translations.' } } },
    {
      name: 'slug', label: { ar: 'الرابط المختصر', en: 'Slug' }, type: 'text', required: true,
      validate: (value: unknown) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
        || 'استخدم أحرفًا لاتينية صغيرة وأرقامًا بصيغة ASCII، تفصل بينها شرطات مفردة. / Use lowercase ASCII letters/numbers separated by single hyphens.',
    },
    { name: 'summary', label: { ar: 'الملخص', en: 'Summary' }, type: 'textarea' },
    { name: 'category', label: { ar: 'اسم التصنيف المعروض للزائر', en: 'Public category label' }, type: 'text', admin: { description: { ar: 'نص مراجع بلغة المقال. تعديل مكتبة التصنيفات لا يغيّره تلقائيًا.', en: 'Reviewed text in the article language. Category library edits do not automatically change it.' } } },
    { name: 'period', label: { ar: 'الفترة الزمنية', en: 'Period' }, type: 'text' },
    { name: 'kind', label: { ar: 'نوع الشخصية', en: 'Person type' }, type: 'select', options: [{ value: 'ruler', label: { ar: 'حاكم', en: 'Ruler' } }, { value: 'notable', label: { ar: 'شخصية بارزة', en: 'Notable person' } }] },
    { name: 'featured', label: { ar: 'مقال مميز', en: 'Featured article' }, type: 'checkbox', defaultValue: false },
    { name: 'image', label: { ar: 'الصورة', en: 'Image' }, type: 'relationship', relationTo: 'media' },
    { name: 'imageAlt', label: { ar: 'النص البديل للصورة', en: 'Image alternative text' }, type: 'text', admin: { description: { ar: 'صِف الصورة نفسها بكل لغة. إذا لم يتوفر الوصفان، يستخدم الموقع العام صورة سياقية موضّحة بصفتها هذه، ولا يستخدم عنوان المقال مطلقًا كنص بديل.', en: 'Describe the same image in each language. Without both descriptions, the public site uses a labeled contextual photograph, never the article title as alt text.' } } },
    { name: 'facts', label: { ar: 'معلومات موجزة', en: 'Facts' }, type: 'array', fields: [{ name: 'label', label: { ar: 'عنوان المعلومة', en: 'Fact label' }, type: 'text' }, { name: 'value', label: { ar: 'قيمة المعلومة', en: 'Fact value' }, type: 'text' }] },
    { name: 'body', label: { ar: 'محتوى المقال', en: 'Article body' }, type: 'array', fields: [{ name: 'heading', label: { ar: 'العنوان الفرعي', en: 'Heading' }, type: 'text' }, { name: 'text', label: { ar: 'النص', en: 'Text' }, type: 'textarea' }] },
    {
      name: 'sources', label: { ar: 'المصادر', en: 'Sources' }, type: 'array',
      admin: { description: { ar: 'استشهادات عامة؛ انسخ المراجع المتحقق منها من مكتبة المصادر الخاصة. حافظ على ترتيب الروابط نفسه في الترجمتين.', en: 'Public citations; copy verified references from the private source library. Match URL order between translations.' } },
      fields: [{ name: 'title', label: { ar: 'عنوان المصدر', en: 'Source title' }, type: 'text' }, { name: 'url', label: { ar: 'رابط المصدر', en: 'Source URL' }, type: 'text', validate: (value: unknown) => !value || validateURL(value) }],
    },
    { name: 'reviewStatus', label: { ar: 'مرحلة المراجعة', en: 'Review stage' }, type: 'select', defaultValue: 'draft', required: true, options: [
      { value: 'draft', label: { ar: 'مسودة', en: 'Draft' } }, { value: 'factual-review', label: { ar: 'مراجعة المعلومات', en: 'Factual review' } },
      { value: 'translation-review', label: { ar: 'مراجعة الترجمة', en: 'Translation review' } }, { value: 'approved', label: { ar: 'معتمد', en: 'Approved' } },
    ], index: true },
    { name: 'reviewedBy', label: { ar: 'اعتمده', en: 'Reviewed by' }, type: 'relationship', relationTo: 'users', admin: { readOnly: true }, access: { create: () => false, update: () => false, read: ({ req }) => hasRole(req, roles) } },
    { name: 'reviewedAt', label: { ar: 'تاريخ الاعتماد', en: 'Reviewed at' }, type: 'date', admin: { readOnly: true }, access: { create: () => false, update: () => false } },
    {
      type: 'collapsible', label: { ar: 'تحسين محركات البحث (SEO)', en: 'Search engine optimization (SEO)' },
      admin: { description: { ar: 'حقول اختيارية لا تؤثر على سير المراجعة أو النشر. اتركها فارغة لاستخدام العنوان والملخص تلقائيًا.', en: 'Optional fields; they do not affect the review or publication workflow. Leave blank to fall back to the title and summary.' } },
      fields: [
        { name: 'seoGuidance', type: 'ui', admin: { components: { Field: '/components/admin/seo-guidance#ArticleSEO' } } },
        {
          name: 'seoTitle', label: { ar: 'عنوان تحسين الظهور (SEO)', en: 'SEO title' }, type: 'text', maxLength: 70,
          admin: { description: { ar: 'يظهر في نتائج البحث وعلامة تبويب المتصفح. اتركه فارغًا لاستخدام عنوان المقال. الطول المثالي أقل من 60 حرفًا.', en: 'Shown in search results and the browser tab. Leave blank to use the article title. Aim for under 60 characters.' } },
        },
        {
          name: 'seoDescription', label: { ar: 'وصف تحسين الظهور (SEO)', en: 'SEO description' }, type: 'textarea', maxLength: 160,
          admin: { description: { ar: 'ملخص قصير يظهر تحت العنوان في نتائج البحث. اتركه فارغًا لاستخدام الملخص. الطول المثالي أقل من 155 حرفًا.', en: 'A short summary shown under the title in search results. Leave blank to use the summary. Aim for under 155 characters.' } },
        },
        {
          name: 'canonicalURL', label: { ar: 'الرابط الأساسي (Canonical)', en: 'Canonical URL' }, type: 'text',
          validate: (value: unknown) => !value || validateURL(value),
          admin: { description: { ar: 'اتركه فارغًا في العادة. استخدمه فقط عند وجود نسخة مطابقة للمحتوى على رابط آخر ينبغي أن يتصدّرها هذا الرابط في الفهرسة.', en: 'Leave blank in most cases. Use only when an equivalent copy exists elsewhere and this URL should be treated as authoritative for indexing.' } },
        },
        {
          name: 'noIndex', label: { ar: 'استثناء من الفهرسة', en: 'Exclude from indexing' }, type: 'checkbox', defaultValue: false,
          admin: { description: { ar: 'فعّله لمنع محركات البحث من فهرسة هذا المقال دون إخفائه عن الزوار.', en: 'Enable to prevent search engines from indexing this article without hiding it from visitors.' } },
        },
      ],
    },
  ],
};