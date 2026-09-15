/** Pure, client-safe editorial advice. No persistence, network calls or ranking score. */
export type SEOLanguage = 'ar' | 'en';
export type GuidanceStatus = 'error' | 'warning' | 'info' | 'ready' | 'optional';
export type GuidanceCheck = {
  field: string;
  status: GuidanceStatus;
  message: string;
  count?: number;
};

const en = {
  articleHeading: 'Article SEO guidance',
  authorHeading: 'Author editorial guidance',
  live: 'Live · read-only guidance',
  disclaimer: 'Approximate editorial guidelines, not a ranking score or a guarantee of search appearance. Search engines may rewrite or truncate snippets. Verify facts and translations; do not add unsupported claims.',
  articleNote: 'The preview uses SEO title and SEO description overrides when non-empty, otherwise the article title and summary. Edit the normal fields and save the document to persist changes; this helper writes nothing.',
  authorNote: 'Author records are private editorial records. There are currently no public author pages, author URLs or author SEO overrides. These previews check bilingual editorial completeness, not live search metadata.',
  preview: 'Illustrative snippet · unsaved form values',
  authorPreview: 'Editorial preview · not a public search snippet',
  emptyTitle: 'No title entered',
  emptyDescription: 'No description entered',
  emptyName: 'No name entered',
  emptyBio: 'No biography entered',
  characters: 'Unicode code points',
  title: 'Effective SEO title',
  description: 'Effective SEO description',
  slug: 'Slug (required)',
  imageAlt: 'Image alternative text',
  nameAr: 'Arabic name (required)',
  nameEn: 'English name (required)',
  bioAr: 'Arabic biography (optional)',
  bioEn: 'English biography (optional)',
  arabic: 'Arabic',
  english: 'English',
  titleMissing: 'Add an accurate title. About 30–65 characters is a useful starting point, not a requirement.',
  titleWithin: 'Within the approximate 30–65 character guideline. Review clarity and factual accuracy.',
  titleOutside: 'Consider about 30–65 characters when useful. Do not pad or remove essential meaning just to fit.',
  descriptionMissing: 'Add a factual description. About 70–170 characters is a useful starting point, not a requirement.',
  descriptionWithin: 'Within the approximate 70–170 character guideline. Check that it accurately summarizes the article.',
  descriptionOutside: 'Consider about 70–170 characters when useful. Preserve meaning and avoid keyword repetition.',
  slugMissing: 'Enter a slug: lowercase ASCII letters and numbers, separated by single hyphens.',
  slugInvalid: 'Use lowercase ASCII letters and numbers with single hyphens only; no spaces, slashes or leading/trailing hyphens.',
  slugValid: 'Slug format is valid. Uniqueness and matching translation routes still require the normal workflow.',
  altMissing: 'An image is selected. Add an accurate description in this article’s language; never substitute the title automatically.',
  altPresent: 'Alternative text is present. Verify that it describes the selected image and that the translation is also complete.',
  altOptional: 'No image is selected. Alternative text is optional; it is not used by this preview.',
  nameMissing: 'Enter the verified author name in this language; do not invent credentials or identities.',
  namePresent: 'Name is present. Verify spelling and that both language versions identify the same author.',
  bioMissing: 'A biography is optional. Consider adding a concise, verified biography in this language.',
  bioPresent: 'Biography is present. Verify claims and equivalent meaning in both languages; no search length target applies.',
  statuses: { error: 'Required', warning: 'Review', info: 'Guideline', ready: 'Present / checked', optional: 'Optional' },
};

type GuidanceCopy = { [Key in keyof typeof en]: (typeof en)[Key] };

export const seoGuidanceCopy: Record<SEOLanguage, GuidanceCopy> = {
  en,
  ar: {
    articleHeading: 'إرشادات تحسين ظهور المقال',
    authorHeading: 'إرشادات تحرير ملف المؤلف',
    live: 'تحديث مباشر · إرشادات للقراءة فقط',
    disclaimer: 'إرشادات تحريرية تقريبية، وليست درجة ترتيب أو ضمانًا للظهور في البحث. قد تعيد محركات البحث صياغة المقتطفات أو تختصرها. تحقّق من المعلومات والترجمات، ولا تضف ادعاءات غير موثّقة.',
    articleNote: 'تستخدم المعاينة عنوان ووصف تحسين الظهور إن لم يكونا فارغين، وإلا تستخدم عنوان المقال وملخصه. عدّل الحقول المعتادة واحفظ الوثيقة لتثبيت التغييرات؛ لا تكتب هذه الأداة أي بيانات.',
    authorNote: 'ملفات المؤلفين سجلات تحريرية خاصة. لا توجد حاليًا صفحات عامة للمؤلفين أو روابط لهم أو حقول مخصصة لبيانات ظهورهم في البحث. تفحص هذه المعاينات اكتمال المحتوى باللغتين، وليست بيانات بحث منشورة.',
    preview: 'معاينة توضيحية للمقتطف · قيم النموذج غير المحفوظة',
    authorPreview: 'معاينة تحريرية · ليست مقتطف بحث عامًا',
    emptyTitle: 'لم يُدخل عنوان',
    emptyDescription: 'لم يُدخل وصف',
    emptyName: 'لم يُدخل اسم',
    emptyBio: 'لم تُدخل نبذة',
    characters: 'نقاط ترميز يونيكود',
    title: 'عنوان تحسين الظهور المستخدم',
    description: 'وصف تحسين الظهور المستخدم',
    slug: 'الرابط المختصر (مطلوب)',
    imageAlt: 'النص البديل للصورة',
    nameAr: 'الاسم بالعربية (مطلوب)',
    nameEn: 'الاسم بالإنجليزية (مطلوب)',
    bioAr: 'النبذة بالعربية (اختيارية)',
    bioEn: 'النبذة بالإنجليزية (اختيارية)',
    arabic: 'العربية',
    english: 'الإنجليزية',
    titleMissing: 'أضف عنوانًا دقيقًا. نحو 30–65 حرفًا نقطة بداية مفيدة وليست شرطًا.',
    titleWithin: 'ضمن الإرشاد التقريبي من 30 إلى 65 حرفًا. راجع الوضوح ودقة المعلومات.',
    titleOutside: 'فكّر في نحو 30–65 حرفًا عند الحاجة. لا تحشُ النص أو تحذف معنى أساسيًا لمجرد ملاءمة الطول.',
    descriptionMissing: 'أضف وصفًا موثوقًا. نحو 70–170 حرفًا نقطة بداية مفيدة وليست شرطًا.',
    descriptionWithin: 'ضمن الإرشاد التقريبي من 70 إلى 170 حرفًا. تحقّق من أنه يلخص المقال بدقة.',
    descriptionOutside: 'فكّر في نحو 70–170 حرفًا عند الحاجة. حافظ على المعنى وتجنب تكرار الكلمات المفتاحية.',
    slugMissing: 'أدخل رابطًا مختصرًا من أحرف لاتينية صغيرة وأرقام بصيغة ASCII تفصل بينها شرطات مفردة.',
    slugInvalid: 'استخدم أحرفًا لاتينية صغيرة وأرقامًا بصيغة ASCII وشرطات مفردة فقط؛ دون مسافات أو شرطات مائلة أو شرطة في البداية أو النهاية.',
    slugValid: 'صيغة الرابط المختصر صحيحة. يظل التفرّد وتطابق روابط الترجمتين خاضعين لمسار العمل المعتاد.',
    altMissing: 'تم اختيار صورة. أضف وصفًا دقيقًا بلغة المقال، ولا تستبدله تلقائيًا بعنوان المقال.',
    altPresent: 'النص البديل موجود. تحقّق من وصفه للصورة المختارة ومن اكتمال الترجمة أيضًا.',
    altOptional: 'لم تُختر صورة. النص البديل اختياري ولا تستخدمه هذه المعاينة.',
    nameMissing: 'أدخل اسم المؤلف المتحقق منه بهذه اللغة؛ لا تختلق مؤهلات أو هويات.',
    namePresent: 'الاسم موجود. تحقّق من الإملاء ومن أن النسختين تحددان المؤلف نفسه.',
    bioMissing: 'النبذة اختيارية. فكّر في إضافة نبذة موجزة ومتحقق منها بهذه اللغة.',
    bioPresent: 'النبذة موجودة. تحقّق من الادعاءات وتكافؤ المعنى باللغتين؛ لا يوجد طول مستهدف للبحث.',
    statuses: { error: 'مطلوب', warning: 'للمراجعة', info: 'إرشاد', ready: 'موجود / مفحوص', optional: 'اختياري' },
  },
};

export function seoLanguage(value: unknown): SEOLanguage {
  return value === 'en' ? 'en' : 'ar';
}

/** Never coerce objects, numbers or booleans into preview text. */
export function seoFieldString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function seoText(value: unknown): string {
  return seoFieldString(value).trim();
}

/** Code points, not UTF-16 code units or grapheme clusters. */
export function unicodeLength(value: unknown): number {
  return Array.from(seoText(value)).length;
}

export function hasSelectedImage(value: unknown): boolean {
  const id: unknown = value && typeof value === 'object' && 'id' in value ? value.id : value;
  return (typeof id === 'string' && id.trim().length > 0)
    || (typeof id === 'number' && Number.isFinite(id));
}

export function validSEOSlug(value: unknown): boolean {
  // Explicit whitespace check also rejects the final newline allowed by JS `$`.
  return typeof value === 'string' && value === value.trim() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export type ArticleSEOInput = {
  title?: unknown;
  summary?: unknown;
  seoTitle?: unknown;
  seoDescription?: unknown;
  slug?: unknown;
  image?: unknown;
  imageAlt?: unknown;
};

export function articleSEOGuidance(input: ArticleSEOInput, language: SEOLanguage = 'ar') {
  const copy = seoGuidanceCopy[language];
  const title = seoText(input.seoTitle) || seoText(input.title);
  const description = seoText(input.seoDescription) || seoText(input.summary);
  const titleCount = unicodeLength(title);
  const descriptionCount = unicodeLength(description);
  const slug = seoFieldString(input.slug);
  const imageSelected = hasSelectedImage(input.image);
  const alt = seoText(input.imageAlt);
  const checks: GuidanceCheck[] = [
    { field: 'title', status: 'info', count: titleCount, message: !title ? copy.titleMissing
      : titleCount >= 30 && titleCount <= 65 ? copy.titleWithin : copy.titleOutside },
    { field: 'description', status: 'info', count: descriptionCount, message: !description ? copy.descriptionMissing
      : descriptionCount >= 70 && descriptionCount <= 170 ? copy.descriptionWithin : copy.descriptionOutside },
    { field: 'slug', status: validSEOSlug(slug) ? 'ready' : 'error', message: !slug.trim() ? copy.slugMissing
      : validSEOSlug(slug) ? copy.slugValid : copy.slugInvalid },
    { field: 'imageAlt', status: !imageSelected ? 'optional' : alt ? 'ready' : 'warning',
      message: !imageSelected ? copy.altOptional : alt ? copy.altPresent : copy.altMissing },
  ];
  return { preview: { title, description, slug }, checks };
}

export type AuthorSEOInput = { nameAr?: unknown; nameEn?: unknown; bioAr?: unknown; bioEn?: unknown };

export function authorSEOGuidance(input: AuthorSEOInput, language: SEOLanguage = 'ar') {
  const copy = seoGuidanceCopy[language];
  const preview = { nameAr: seoText(input.nameAr), nameEn: seoText(input.nameEn), bioAr: seoText(input.bioAr), bioEn: seoText(input.bioEn) };
  const checks: GuidanceCheck[] = (['nameAr', 'nameEn', 'bioAr', 'bioEn'] as const).map((field) => {
    const isName = field === 'nameAr' || field === 'nameEn';
    const present = Boolean(preview[field]);
    return { field, count: unicodeLength(preview[field]), status: present ? 'ready' : isName ? 'error' : 'warning',
      message: isName ? present ? copy.namePresent : copy.nameMissing : present ? copy.bioPresent : copy.bioMissing };
  });
  return { preview, checks };
}