# نتائج التحقق / Verification

Applied `20260910_171110_editorial_catalogs` to Supabase project
`vexushpbyvaoangxyqcm`, schema `kingdom_cms`. The latest snapshot matched 22
tables and 27 foreign keys. Runtime SQL checks and Payload anonymous access
checks passed, including denial of private categories and authors. Existing
accounts were preserved; no authors, categories, or articles were invented.

TypeScript passed and all 54 unit tests passed. ESLint reported no errors and
eight unused-argument warnings in generated migrations. Browser verification
confirmed that `/admin/login` loads after migration and switches to Arabic using
Payload's language action. The shared browser is logged out, so the authenticated
dashboard and real editorial relationship saves have not been browser-tested.
Production build, S3 delivery, and deployment are not claimed.

# لوحة التحرير / Editorial dashboard

## الواجهة الحالية / Existing interface

لوحة `EditorialDashboard` مسجلة حاليًا عبر `admin.components.beforeDashboard` في `src/payload.config.ts`؛ ليست بديلًا لواجهة Payload الافتراضية. تعرض روابط إدارة المحتوى وأعداد السجلات وفق صلاحيات الحساب عند التحميل. تُحسب وثيقة كل لغة على حدة، بما فيها المسودات والمنشور؛ وليست هذه أعداد الموضوعات المكتملة. تعذّر الاستعلام يظهر «غير متاح»، لا صفرًا.

`EditorialDashboard` is already registered through `admin.components.beforeDashboard` in `src/payload.config.ts`; it does not replace Payload’s default dashboard. It provides content-management links and permission-scoped record counts at load time. Each language document is counted separately, including drafts and published records, not completed topics. Failed queries display “Unavailable”, not zero.

## الأقسام والتصنيفات / Sections and categories

- الأقسام ثابتة: التاريخ (`history`)، المناطق (`regions`)، الشخصيات (`people`)، التراث (`heritage`). روابط الأقسام تصفّي قائمة المقالات؛ لا تنشئ أقسامًا جديدة.
- التصنيفات سجلات تحريرية مستقلة بأسماء عربية وإنجليزية. يجب أن ينتمي `categoryRef` إلى قسم المقال. قسم التصنيف غير قابل للتغيير بعد الإنشاء، وحذف التصنيفات معطّل.
- حقل `category` نص عام مراجع بلغة المقال، محفوظ بصورة مستقلة عن العلاقة الخاصة `categoryRef`. تعديل مكتبة التصنيفات لا يستبدل هذا النص تلقائيًا؛ راجعه داخل المقال عند الحاجة.

- Sections are fixed: History (`history`), Regions (`regions`), People (`people`), and Heritage (`heritage`). Section links filter articles; they do not create sections.
- Categories are separate editorial records with Arabic and English names. `categoryRef` must belong to the article’s section. A category’s section is immutable after creation, and category deletion is disabled.
- `category` is the reviewed public text snapshot in the article’s language, separate from private `categoryRef`. Category-library edits preserve this snapshot rather than automatically replacing it; review it in the article when needed.

## المؤلفون والحسابات / Authors and accounts

ملفات `authors` سجلات تحريرية خاصة وليست حسابات دخول ولا تمنح صلاحيات. حسابات الدخول والأدوار في `users`، ويتولى المسؤول إدارتها. حذف ملفات المؤلفين وحسابات المستخدمين معطّل. لا تختلق مؤلفين أو سيرًا أو نسبًا للمحتوى؛ أضف فقط معلومات متحققًا منها وإسنادًا تحريريًا صحيحًا.

`authors` are private editorial profiles, not login accounts, and grant no permissions. Login accounts and roles belong to `users` and are managed by administrators. Author-profile and user-account deletion is disabled. Do not invent authors, biographies, or credits; add only verified information and accurate editorial attribution.

## الترجمة والاعتماد / Translation and approval

- طابق مفتاح الترجمة والقسم والرابط المختصر بين وثيقتي `ar` و`en`. يجب أن تتطابق علاقة التصنيف الخاصة وقائمة المؤلفين الخاصة، بما فيها ترتيب المؤلفين. لا يكفي تطابق أسمائهم المعروضة. يمكن أن تخلو الوثيقتان من العلاقات، لكن الإسناد في لغة واحدة فقط لا يطابق الأخرى.
- هذه العلاقات خاصة بالتحرير وليست حقولًا عامة. انسخ الاستشهادات المتحقق منها إلى `sources` العامة وحافظ على ترتيب روابط المصادر نفسه في الترجمتين.
- تغيير `categoryRef` أو `authors`، بما فيه ترتيب المؤلفين، تعديل جوهري: يعيد المقال المعتمد أو المنشور إلى المسودة ويلغي نشره ما لم يُعِد مراجع أو مسؤول اعتماده صراحةً في الحفظ نفسه. تُمسح بيانات الاعتماد عندما لا يبقى المقال معتمدًا. لا يحافظ تعديل العلاقات على الاعتماد تلقائيًا.
- النشر العام يتطلب زوجًا مكتملًا ومتطابقًا ومعتمدًا ومنشورًا، وليس مجرد إسناد التصنيف والمؤلفين. اعتماد الوسائط العامة مستقل عن اعتماد المقال.

- Match translation key, section, and slug between `ar` and `en`. Private category references and author lists must match, including author order; matching display names is insufficient. Both documents may omit associations, but one-sided assignments do not match.
- These relationships are private editorial fields, not public fields. Copy verified citations into public `sources` and keep source URLs in the same order across translations.
- Changing `categoryRef` or `authors`, including author order, is substantive: an approved or published article returns to draft and is unpublished unless a reviewer or administrator explicitly reapproves it in that save. Approval audit fields are cleared when the article is no longer approved. Relationship edits never automatically retain approval.
- Public publication requires a complete, matching, approved, published pair, not merely assigned categories and authors. Public media approval is separate from article approval.

## نطاق هذا التحديث / Scope of this update

هذا التحديث يقتصر على تسميات الحقول وخيارات الأدوار والنصوص الإرشادية ورسالة تحقق الرابط المختصر وهذه الوثيقة. لا يغيّر الخطافات أو قواعد الوصول أو أنواع الحقول أو قيم الخيارات. لم تُشغّل أوامر أو اختبارات أو فحوص بيئة لهذا التحديث؛ ولا تدّعي هذه الوثيقة تحققًا تشغيليًا أو تحققًا من قاعدة البيانات أو التخزين أو النشر.

This update is limited to field and role-option labels, help text, the slug validation message, and this document. It does not change hooks, access rules, field types, or option values. No commands, tests, or environment checks were run for this update; this document makes no runtime, database, storage, or deployment verification claim.