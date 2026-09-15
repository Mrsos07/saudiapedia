# Saudi encyclopedia: editorial seed status

## What is actually provided

`src/lib/encyclopedia.ts` contains **30 distinct topics in Arabic and English**
(60 localized introductions, not 60 distinct topics). Every entry has
`status: 'editorial-preview'`. There are **zero publication-approved entries**
in this seed. Each topic has a localized title, summary, category, image-slot
alternative text, facts, and two original introductory body paragraphs with
localized headings. These are short starting points for research, not extensive
completed encyclopedia articles. No author, reviewer, review date, or approval
has been invented.

| Coverage | Topics | Included |
| --- | ---: | --- |
| Saudi states | 3 | First, second, and third states as separate articles |
| Administrative regions | 13 | All thirteen regions, listed below |
| Kings of the Kingdom | 7 | Abdulaziz, Saud, Faisal, Khalid, Fahd, Abdullah, Salman |
| Other biographies | 2 | Ghazi Al Gosaibi and biotechnology scientist Hayat Sindi |
| Heritage | 5 | At-Turaif, Hegra, Historic Jeddah, Hail rock art, Al-Ahsa Oasis |
| **Total** | **30** | **All editorial previews** |

The thirteen regions are Riyadh, Makkah, Madinah, Qassim, Eastern Province,
Asir, Tabuk, Hail, Northern Borders, Jazan, Najran, Bahah, and Jawf. Their seats
are respectively Riyadh, Makkah, Madinah, Buraydah, Dammam, Abha, Tabuk, Hail,
Arar, Jazan, Najran, Al Bahah, and Sakaka. Regional profiles are not exhaustive
city or governorate inventories. Hayat Sindi is included instead of Ghalia
Al Bogammiah; no Ghalia biography has been drafted or counted.

The earlier planning idea of 150 topics is **not delivered coverage**. This seed
does not claim that 150 topics, 300 reviewed pages, or any completed launch
inventory exist. The five heritage topics are a selection, not a complete list
of Saudi World Heritage properties or intangible heritage traditions.

## Chronology and scope

- `first-saudi-state`: **1727–1818**. The 1744 alliance is a later milestone,
  not silently substituted for the founding date used by this project.
  A full article must explain differing historiographical periodizations.
- `second-saudi-state`: **1824–1891**, with Riyadh as its political centre.
- `third-saudi-state`: **1902 onward**. The recovery of Riyadh in 1902 is
  distinguished from the proclamation of the name Kingdom of Saudi Arabia
  and unification milestone on **23 September 1932**.
- Modern kings are not confused with the imams of the first and second states.
  Abdulaziz's `period` is **1932–1953 as king of the named Kingdom**, not his
  whole period of rule beginning in 1902.
- Closed periods use Gregorian years. A trailing en dash (`1902–`, `2015–`)
  indicates an open-ended period in this static seed, not an automated check of
  current officeholding. Ghazi Al Gosaibi's period is a lifespan; kings' periods
  are reigns. Do not present every `period` field with the same date label.
- No population, area, visitor totals, economic rankings, or claimed programme
  success rates are supplied. This is not a source of current statistics.

## Source evidence and its limits

The following **specific official UNESCO property pages were retrieved and
consulted while drafting**. Their property identities, descriptions and
inscription years support the corresponding heritage introductions. This is a
limited source check, **not human editorial approval, UNESCO endorsement, a
line-by-line citation audit, or verification of every claim in the module**.
The prose is original paraphrase; no UNESCO images or descriptive passages have
been copied into the repository.

| Seed slug | Official reference | Inscription year |
| --- | --- | ---: |
| `at-turaif` | [At-Turaif District in ad-Dir'iyah](https://whc.unesco.org/en/list/1329/) | 2010 |
| `hegra` | [Hegra Archaeological Site](https://whc.unesco.org/en/list/1293/) | 2008 |
| `historic-jeddah` | [Historic Jeddah, the Gate to Makkah](https://whc.unesco.org/en/list/1361/) | 2014 |
| `hail-rock-art` | [Rock Art in the Hail Region of Saudi Arabia](https://whc.unesco.org/en/list/1472/) | 2015 |
| `al-ahsa-oasis` | [Al-Ahsa Oasis, an Evolving Cultural Landscape](https://whc.unesco.org/en/list/1563/) | 2018 |

Only those five heritage entries have populated `sources` arrays. The other
**25 entries have empty `sources` arrays** because suitable article-level
references were not verified in this task. Empty arrays must not render as
“verified”, “fully sourced”, or imply that sources do not exist. UNESCO
references attached to heritage articles do not automatically source the
separate regional or state articles. Older conservation and management text
on UNESCO pages must not be presented as a current operational report.

Attempts to retrieve the Saudi Embassy history page and a UNESCO Hayat Sindi
profile did not return usable content. They are not attached as verified
citations, and no biographical claims are represented as verified by those
attempts.

### Suggested further reading — research leads, not verified citations

- Saudi-state history: King Abdulaziz Foundation (Darah), its documentary
  collections and historical scholarship; relevant National Center for Archives
  and Records materials; independent academic histories with identified editions
  and page references. Verify 1727, 1744, state transitions, and succession
  narratives against the appropriate sources.
- Regions: official regional emirate and municipal publications, GASTAT
  administrative geography, and Heritage Commission archaeological publications.
  Distinguish administrative regions from historical and physical regions.
- Kings: documentary royal biographies, official texts of the 1992 laws,
  university institutional histories, GCC founding records, and scholarly
  political and social histories. Compare official accounts with independent
  scholarship where interpretation or contested events are involved.
- Ghazi Al Gosaibi: bibliographic catalogues, published editions of
  `حياة في الإدارة` and `شقة الحرية`, and documentary records of his offices.
  Book names in the entry identify works; they are not invented editions or
  page-specific citations. Memoir is personal testimony, not independent proof.
- Hayat Sindi: authenticated university and institutional biographies,
  peer-reviewed research, and founding records for Diagnostics For All and i2.
  Verify roles and contributions; do not infer clinical approval, sole
  inventorship, or current appointments from publicity or old profiles.

## Media limitations

The module references only `/images/desert.jpg`, `/images/diriyah.jpg`,
`/images/mountains.jpg`, `/images/heritage.jpg`, and `/images/riyadh.jpg`.
This task does not supply or inspect those assets, confirm their existence,
or clear their rights. Alternative text currently identifies illustrative
slots, not authenticated site photography or portraits. Before launch, inspect
the final images, correct alternative text and captions, label generated
illustrations, and record creator, provenance, license and required attribution.
Do not present a generic landscape as photographic evidence of an article's
subject. No unverified regional map coordinates are supplied.

## Code contract and integration boundaries

- Exported types: `Locale`, `Section`, `Localized`, `Entry`, matching the requested
  contract. Exported data: `entries: Entry[]` and
  `sectionLabels: Record<Section, Localized>`.
- `isLocale` accepts exactly `ar` or `en`; uppercase, regional tags and other
  values are rejected. `localize` selects the requested locale without fallback.
- `entryPath` returns `/{locale}/{section}/{slug}` for the supplied entry.
  Seed slugs are stable ASCII path segments; validate externally supplied slugs
  before constructing routes. This helper creates strings, not actual routes.
- `normalizeSearch` performs Unicode compatibility decomposition, removes
  combining marks and tatweel, folds alef variants and alef maqsura, lowercases,
  folds Arabic-Indic and Eastern Arabic-Indic digits, and collapses punctuation
  and whitespace. Stored display text is unchanged. This is not linguistic
  stemming, fuzzy matching, translation, or transliteration search.
- `searchEntries` searches the selected locale's title, category and summary,
  plus the shared period. Every normalized query token must be a substring of
  that combined text, in any order. Body text, facts, sources and the other
  locale are intentionally excluded. Empty, whitespace-only, or mark-only queries
  return a shallow copy of all supplied items; input order is preserved and the
  input array is not mutated.
- Search does **not** enforce publication status or authorization. Production
  callers must supply only permitted, published entries; preview callers must
  visibly label previews. Static exported seeds are not a protected CMS draft
  store. `featured` is a display choice, not evidence of review or approval.
- No imports, packages, CMS migrations, routes, UI changes or other files are
  required by this standalone data module. No terminal commands, build or
  runtime tests were run for this task; editor diagnostics are not a substitute
  for integration testing.

## Work remaining before publication

1. Assign accountable researchers, Arabic and English editors, factual
   reviewers and a publisher. Keep every seed in preview until the appropriate
   reviews are actually complete; record real approvals and review dates only.
2. Audit every factual statement and date against identified sources, with
   editions, pages or stable URLs and claim-level references. Resolve contested
   history and distinguish evidence, attributed interpretation and uncertainty.
3. Expand the introductions into the agreed article scope without repeated
   filler. Approve a realistic launch inventory rather than treating a planning
   target as completed work. Source omitted cities, figures and heritage topics
   separately if they are added.
4. Review translation equivalence, Arabic spelling, personal names, royal titles,
   transliteration and Gregorian/Hijri handling. Confirm the spelling policy for
   Hail, Jawf, Bahah, Al Gosaibi and other variant English forms.
5. Supply rights-cleared media and inspect its actual content. Review captions,
   alternative text, attribution and any historical or geographical diagrams.
6. Integrate workflow and access controls outside this module. Exclude preview
   entries from production sitemaps, structured publication claims and ordinary
   published-only search; keep staging previews visibly identified and noindex.
   Noindex is not access control when drafts require privacy.
7. Add automated checks for the 30-topic count, all 13 distinct region slugs,
   seven ruler and two notable entries, locale completeness, unique paths,
   allowed image paths, two nonempty body paragraphs per locale, preview status,
   and reference URLs. Test Arabic marks, tatweel, alef variants, digit folding,
   punctuation-only queries, mixed case, multi-token matching, absent periods,
   order preservation and input immutability.
8. Test locale route resolution, language switching, RTL/LTR rendering, source
   labels, missing-image handling and accessible search in the consuming app.
   Recheck links and time-sensitive statements immediately before launch and
   establish a corrections and maintenance process.

## موجز الحالة بالعربية

تتضمن البيانات 30 موضوعًا بالعربية والإنجليزية: ثلاث دول سعودية، و13 منطقة
إدارية، وسبعة ملوك، وشخصيتين أخريين، وخمسة موضوعات تراثية. جميعها مقدمات
تحريرية أولية بحالة `editorial-preview`، وليست مقالات موسوعية مكتملة أو مواد
معتمدة للنشر. جرى الاطلاع على صفحات اليونسكو المحددة للموضوعات التراثية
الخمسة فقط؛ أما المداخل الأخرى فتحتاج إلى استكمال المصادر والتحقق من كل
ادعاء. تبقى المراجعة البشرية والترجمة والتوسع التحريري وحقوق الصور واختبارات
التكامل من متطلبات الإطلاق، ولا توجد هنا دعوى بإنجاز 150 موضوعًا.