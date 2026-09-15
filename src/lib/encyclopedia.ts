import kingBatch from '../../docs/editorial-batches/saudi-kings.json' with { type: 'json' };

/** Introductory editorial previews, not publication-approved encyclopedia articles. */
export type Locale = 'ar' | 'en';
// The fixed literal union below only describes this file's static seed data.
// Real (CMS) sections are administrator-managed and identified by their slug
// string; Entry.section therefore accepts any nonempty slug, not just these
// four. Do not reintroduce a compiled-in enum for section validation.
export type SeedSection = 'history' | 'regions' | 'people' | 'heritage';
export type Section = string;
export type Localized = { ar: string; en: string };
export type ImageCredit = { attribution?: string; license?: string };
export type ArticleSEO = {
  seoTitle?: string;
  seoDescription?: string;
  canonicalURL?: string;
  noIndex?: boolean;
};
export type Entry = {
  slug: string;
  section: Section;
  title: Localized;
  summary: Localized;
  category: Localized;
  period?: string;
  image: string;
  imageAlt: Localized;
  imageCredit?: ImageCredit;
  seo?: Partial<Record<Locale, ArticleSEO>>;
  featured?: boolean;
  kind?: 'ruler' | 'notable';
  facts: { label: Localized; value: Localized }[];
  body: { heading: Localized; text: Localized }[];
  sources: { title: Localized; url: string }[];
  status: 'editorial-preview' | 'published';
};

const l = (ar: string, en: string): Localized => ({ ar, en });
const fact = (label: Localized, value: Localized): Entry['facts'][number] => ({ label, value });
const paragraph = (heading: Localized, text: Localized): Entry['body'][number] => ({ heading, text });

// Labels for the four seed sections only; real (CMS-managed) sections carry
// their own nameAr/nameEn and must not be looked up here. Use
// resolveSectionLabel() below wherever a section might be CMS-managed.
export const seedSectionLabels: Record<SeedSection, Localized> = {
  history: l('التاريخ', 'History'),
  regions: l('المناطق', 'Regions'),
  people: l('شخصيات بارزة', 'Notable figures'),
  heritage: l('التراث', 'Heritage'),
};

/** Backward-compatible alias for existing seed-only call sites. */
export const sectionLabels = seedSectionLabels;

/** Safe fallback label when a section is not one of the four seed sections
 * (i.e. it is administrator-added). Callers that have the real CMS section
 * document (nameAr/nameEn) should prefer that over this fallback, which only
 * has the slug to work with. */
export function resolveSectionLabel(section: string, locale: Locale, known?: Localized): string {
  if (['people', 'rulers', 'notable-figures'].includes(section)) return seedSectionLabels.people[locale];
  if (known) return known[locale];
  const seedLabel = (seedSectionLabels as Record<string, Localized>)[section];
  return seedLabel ? seedLabel[locale] : section;
}

export function matchesSection(entry: Entry, section: string): boolean {
  if (['people', 'rulers', 'notable-figures'].includes(section)) {
    return ['people', 'rulers', 'notable-figures'].includes(entry.section) || entry.kind === 'ruler' || entry.kind === 'notable';
  }
  return entry.section === section;
}

export function saudiStateHistory(items: Entry[]): Entry[] {
  return ['first-saudi-state', 'second-saudi-state', 'third-saudi-state'].flatMap(slug => {
    const entry = items.find(item => item.section === 'history' && item.slug === slug);
    return entry ? [entry] : [];
  });
}

// Assets will be supplied separately. These are illustrative slots, not documentary
// photographs of a named person or site. Reassess alternative text with final assets.
const images = {
  desert: { image: '/images/desert.jpg', imageAlt: l('وادي العلا وجروفه الصخرية، صورة سياقية', 'AlUla valley and sandstone escarpments, contextual photograph') },
  diriyah: { image: '/images/diriyah.jpg', imageAlt: l('عمارة طينية في الدرعية، صورة سياقية وليست وثيقة تاريخية', 'Earthen architecture in Diriyah, contextual photograph rather than a historical document') },
  mountains: { image: '/images/mountains.jpg', imageAlt: l('منحدر صخري في عسير، صورة سياقية', 'A rocky slope in Asir, contextual photograph') },
  heritage: { image: '/images/heritage.jpg', imageAlt: l('واجهة مقبرة منحوتة في الحِجر، صورة سياقية', 'A rock-cut tomb facade at Hegra, contextual photograph') },
  riyadh: { image: '/images/riyadh.jpg', imageAlt: l('أفق الرياض في فبراير 2018، وليس صورة للشخصية', 'Riyadh skyline in February 2018, not a portrait of the person') },
} satisfies Record<string, Pick<Entry, 'image' | 'imageAlt'>>;

type Seed = Omit<Entry, 'status'>;
const preview = (seed: Seed): Entry => ({ ...seed, status: 'editorial-preview' });

// Only fetched, property-specific UNESCO pages are attached as references here.
// An empty sources array means sourcing remains outstanding, not that no sources exist.
const unesco = (id: string, title: Localized): Entry['sources'] => [{
  title: l(`اليونسكو: ${title.ar}`, `UNESCO: ${title.en}`),
  url: `https://whc.unesco.org/en/list/${id}/`,
}];

const historyEntries: Entry[] = [
  preview({
    slug: 'first-saudi-state', section: 'history',
    title: l('الدولة السعودية الأولى', 'The First Saudi State'),
    summary: l('نشأت في الدرعية عام 1727 بقيادة الإمام محمد بن سعود، وانتهت بسقوط الدرعية عام 1818.', 'Established in Diriyah in 1727 under Imam Muhammad bin Saud, the first state ended with the fall of Diriyah in 1818.'),
    category: l('الدول السعودية', 'Saudi states'), period: '1727–1818',
    ...images.diriyah, featured: true,
    facts: [
      fact(l('المركز السياسي', 'Political centre'), l('الدرعية', 'Diriyah')),
      fact(l('المؤسس', 'Founder'), l('الإمام محمد بن سعود', 'Imam Muhammad bin Saud')),
      fact(l('الفترة', 'Period'), l('1727–1818 م', '1727–1818 CE')),
    ],
    body: [
      paragraph(l('من الدرعية إلى دولة', 'From Diriyah to a state'), l(
        'تبدأ هذه المقدمة تاريخ الدولة السعودية الأولى بعام 1727، حين تولى الإمام محمد بن سعود الحكم في الدرعية. كانت الواحة الواقعة في وادي حنيفة مركزًا للاستقرار الزراعي والتجارة المحلية، ومنها توسع النفوذ السياسي للدولة في نجد ومناطق أخرى من الجزيرة العربية.',
        'This introduction dates the First Saudi State to 1727, when Imam Muhammad bin Saud assumed rule in Diriyah. The oasis in Wadi Hanifah supported agriculture and local trade, providing a base from which the state extended its political influence across Najd and other parts of the Arabian Peninsula.',
      )),
      paragraph(l('التحالف والنهاية', 'Alliance and the end of the state'), l(
        'أصبح التحالف بين محمد بن سعود والشيخ محمد بن عبدالوهاب عام 1744 عنصرًا مهمًا في تطور الدولة السياسي والديني؛ وهو حدث لاحق لتاريخ التأسيس المعتمد هنا. انتهت الدولة عام 1818 بعد حملة إبراهيم باشا التابعة للدولة العثمانية وسقوط الدرعية، وبقي تراثها حاضرًا في تاريخ الدول السعودية اللاحقة.',
        'The alliance between Muhammad bin Saud and Sheikh Muhammad bin Abd al-Wahhab in 1744 became important to the state’s political and religious development; it is distinct from the founding date used here. The state ended in 1818 after the Ottoman campaign led by Ibrahim Pasha and the fall of Diriyah, while its legacy remained part of the history of the later Saudi states.',
      )),
    ], sources: [],
  }),
  preview({
    slug: 'second-saudi-state', section: 'history',
    title: l('الدولة السعودية الثانية', 'The Second Saudi State'),
    summary: l('أعاد الإمام تركي بن عبدالله الحكم السعودي عام 1824، وجعل الرياض مركزًا للدولة التي انتهت عام 1891.', 'Imam Turki bin Abdullah restored Saudi rule in 1824, with Riyadh as the centre of a state that ended in 1891.'),
    category: l('الدول السعودية', 'Saudi states'), period: '1824–1891',
    ...images.riyadh, featured: true,
    facts: [
      fact(l('المركز السياسي', 'Political centre'), l('الرياض', 'Riyadh')),
      fact(l('المؤسس', 'Founder'), l('الإمام تركي بن عبدالله', 'Imam Turki bin Abdullah')),
      fact(l('الفترة', 'Period'), l('1824–1891 م', '1824–1891 CE')),
    ],
    body: [
      paragraph(l('عودة الحكم السعودي', 'The restoration of Saudi rule'), l(
        'تمكن الإمام تركي بن عبدالله من استعادة الرياض عام 1824، فبدأت مرحلة الدولة السعودية الثانية. أصبحت الرياض، بدلًا من الدرعية، مقر الحكم، وارتبطت الدولة بشبكات الواحات والبلدات والقبائل في نجد وشرق الجزيرة العربية.',
        'Imam Turki bin Abdullah recovered Riyadh in 1824, beginning the Second Saudi State. Riyadh replaced Diriyah as the seat of government, and the state drew on connections between oasis settlements, towns and tribes in Najd and eastern Arabia.',
      )),
      paragraph(l('فترات الاستقرار والتنافس', 'Stability and rivalry'), l(
        'شهدت الدولة في عهد الإمام فيصل بن تركي فترات من الاستقرار، لكنها واجهت أيضًا تدخلات خارجية وخلافات على الحكم. انتهت هذه المرحلة عام 1891 مع تفوق إمارة آل رشيد، وغادر الإمام عبدالرحمن بن فيصل وأسرته نجد ليستقروا لاحقًا في الكويت.',
        'The rule of Imam Faisal bin Turki included periods of stability, but the state also faced outside intervention and disputes over succession. This phase ended in 1891 with the ascendancy of the Al Rashid emirate; Imam Abdulrahman bin Faisal and his family left Najd and later settled in Kuwait.',
      )),
    ], sources: [],
  }),
  preview({
    slug: 'third-saudi-state', section: 'history',
    title: l('الدولة السعودية الثالثة', 'The Third Saudi State'),
    summary: l('بدأت باسترداد الملك عبدالعزيز الرياض عام 1902، وأُعلن اسم المملكة العربية السعودية عام 1932 بعد مسار توحيد البلاد.', 'Beginning with Abdulaziz’s recovery of Riyadh in 1902, this state took the name Kingdom of Saudi Arabia in 1932 after a process of unification.'),
    category: l('الدول السعودية', 'Saudi states'), period: '1902–',
    ...images.riyadh, featured: true,
    facts: [
      fact(l('بداية المرحلة', 'Beginning of the period'), l('استرداد الرياض عام 1902', 'Recovery of Riyadh in 1902')),
      fact(l('إعلان اسم المملكة', 'Proclamation of the Kingdom’s name'), l('23 سبتمبر 1932', '23 September 1932')),
      fact(l('الفترة', 'Period'), l('من 1902 إلى الوقت الحاضر', '1902 onward')),
    ],
    body: [
      paragraph(l('بداية من الرياض', 'A beginning in Riyadh'), l(
        'استرد عبدالعزيز بن عبدالرحمن آل سعود الرياض عام 1902، واتخذ منها قاعدة لإعادة بناء الحكم السعودي. امتد توحيد البلاد على مدى عقود، وشمل مناطق ذات تقاليد اجتماعية واقتصادية متنوعة؛ لذلك لا ينبغي اختزال هذه العملية في حدث واحد أو إسقاط حدود المملكة الحالية على كل مراحلها.',
        'Abdulaziz bin Abdulrahman Al Saud recovered Riyadh in 1902 and used it as a base for rebuilding Saudi rule. Unification unfolded over decades and brought together regions with different social and economic traditions; it should not be reduced to a single event or illustrated as though today’s borders applied throughout.',
      )),
      paragraph(l('المملكة منذ 1932', 'The Kingdom from 1932'), l(
        'أُعلن توحيد البلاد باسم المملكة العربية السعودية في 23 سبتمبر 1932، وهو تاريخ مختلف عن بداية الدولة الثالثة عام 1902. شهدت العقود اللاحقة بناء المؤسسات الحكومية وتوسع التعليم والصحة وتطور اقتصاد النفط، وتتابع على حكم المملكة سبعة ملوك من عبدالعزيز إلى سلمان.',
        'The country was proclaimed the Kingdom of Saudi Arabia on 23 September 1932, a milestone distinct from the third state’s beginning in 1902. Later decades saw the development of government institutions, wider education and healthcare, and the growth of an oil economy. Seven kings, from Abdulaziz to Salman, form the royal succession covered in this seed.',
      )),
    ], sources: [],
  }),
];

type RegionSeed = {
  slug: string;
  name: Localized;
  capital: Localized;
  setting: Localized;
  summary: Localized;
  image: keyof typeof images;
  body: Entry['body'];
};

const region = (seed: RegionSeed): Entry => preview({
  slug: seed.slug, section: 'regions', title: seed.name,
  summary: seed.summary, category: l('منطقة إدارية', 'Administrative region'),
  ...images[seed.image],
  facts: [
    fact(l('المقر الإداري', 'Administrative seat'), seed.capital),
    fact(l('الموقع العام', 'General location'), seed.setting),
  ],
  body: seed.body, sources: [],
});

const regionEntries: Entry[] = [
  region({
    slug: 'riyadh', name: l('منطقة الرياض', 'Riyadh Region'), capital: l('الرياض', 'Riyadh'),
    setting: l('وسط المملكة', 'Central Saudi Arabia'), image: 'riyadh',
    summary: l('تضم العاصمة الوطنية وبلدات نجد وواحاتها، وتجمع بين الإدارة الحديثة وامتداد تاريخي في وادي حنيفة.', 'Home to the national capital and the towns and oases of Najd, this region links modern government with the history of Wadi Hanifah.'),
    body: [
      paragraph(l('العاصمة ومحيطها', 'The capital and its surroundings'), l(
        'تقع منطقة الرياض في وسط المملكة، وتتخذ من مدينة الرياض مقرًا إداريًا. تضم المنطقة الدرعية والخرج والمجمعة وغيرها من المحافظات، وتمتد خارج النطاق العمراني للعاصمة إلى بلدات زراعية وأراضٍ صحراوية واسعة.',
        'Riyadh Region lies in central Saudi Arabia and is administered from Riyadh city. It includes Diriyah, Al Kharj, Al Majmaah and other governorates, extending beyond the capital’s urban area into agricultural towns and broad desert landscapes.',
      )),
      paragraph(l('الوادي والعمران', 'Wadi and settlement'), l(
        'يربط وادي حنيفة بين مواقع الاستقرار التاريخية في الدرعية والرياض ومحيطهما. ويساعد النظر إلى الواحات والطرق والأسواق القديمة على فهم تطور المنطقة قبل التوسع العمراني الحديث، إلى جانب دور العاصمة في الإدارة والاقتصاد والتعليم.',
        'Wadi Hanifah connects historic settlement areas in Diriyah, Riyadh and their surroundings. Oases, routes and older markets help explain the region before modern urban expansion, alongside the capital’s present role in government, business and education.',
      )),
    ],
  }),
  region({
    slug: 'makkah', name: l('منطقة مكة المكرمة', 'Makkah Region'), capital: l('مكة المكرمة', 'Makkah'),
    setting: l('غرب المملكة على البحر الأحمر', 'Western Saudi Arabia on the Red Sea'), image: 'heritage',
    summary: l('تضم مكة المكرمة وجدة والطائف، وترتبط بالحج والتجارة البحرية وتنوع التضاريس بين الساحل والمرتفعات.', 'Including Makkah, Jeddah and Taif, the region connects pilgrimage, maritime trade and landscapes ranging from coast to highlands.'),
    body: [
      paragraph(l('مدن بأدوار متكاملة', 'Cities with complementary roles'), l(
        'مكة المكرمة هي المقر الإداري للمنطقة ووجهة الحج للمسلمين. تقع جدة على البحر الأحمر وتؤدي دورًا تجاريًا وبحريًا، بينما تقع الطائف في المرتفعات إلى الشرق، وترتبط بتاريخ الزراعة والأسواق وطرق الحركة في الحجاز.',
        'Makkah is the regional administrative seat and the destination of the Muslim Hajj. Jeddah, on the Red Sea, has a commercial and maritime role, while Taif lies in the highlands to the east and has a history connected to farming, markets and routes through the Hijaz.',
      )),
      paragraph(l('الحج والتبادل الثقافي', 'Pilgrimage and cultural exchange'), l(
        'جعلت رحلات الحج المنطقة ملتقى لزوار من أنحاء العالم الإسلامي. تظهر آثار هذا التواصل في تاريخ جدة وأحيائها وأسواقها، وفي الخدمات والطرق التي تربط الميناء بمكة، مع اختلاف البيئة بين سهل تهامة ومرتفعات الطائف.',
        'Pilgrimage made the region a meeting place for visitors from across the Muslim world. This exchange is visible in Jeddah’s neighbourhoods and markets and in the services and routes connecting the port with Makkah, across environments that differ markedly between the Tihamah plain and Taif’s uplands.',
      )),
    ],
  }),
  region({
    slug: 'madinah', name: l('منطقة المدينة المنورة', 'Madinah Region'), capital: l('المدينة المنورة', 'Madinah'),
    setting: l('غرب المملكة', 'Western Saudi Arabia'), image: 'desert',
    summary: l('منطقة تضم المدينة المنورة وينبع والعلا، وتتنوع فيها المعالم الإسلامية والواحات والمواقع الأثرية والساحل.', 'The region includes Madinah, Yanbu and AlUla, bringing together Islamic landmarks, oases, archaeological sites and a coastline.'),
    body: [
      paragraph(l('المدينة ومجالها الإقليمي', 'Madinah and its region'), l(
        'تتخذ المنطقة من المدينة المنورة مقرًا إداريًا، وهي مدينة ذات مكانة مركزية في التاريخ الإسلامي وتضم المسجد النبوي. لا تقتصر المنطقة على المدينة نفسها؛ إذ تشمل محافظات وقرى وواحات ومناطق بركانية وساحلًا على البحر الأحمر.',
        'The region is administered from Madinah, a city central to Islamic history and home to the Prophet’s Mosque. It extends well beyond the city to encompass governorates, villages, oases, volcanic landscapes and a stretch of Red Sea coast.',
      )),
      paragraph(l('من ينبع إلى العلا', 'From Yanbu to AlUla'), l(
        'ترتبط ينبع بالملاحة والصناعة على البحر الأحمر، بينما تتيح العلا دراسة تاريخ الواحات وطرق القوافل في شمال غرب الجزيرة العربية. يقع موقع الحِجر الأثري في نطاق العلا، ويقدم شاهدًا على الحضارة النبطية مختلفًا عن المعالم الإسلامية في المدينة المنورة.',
        'Yanbu is associated with Red Sea shipping and industry, while AlUla offers an introduction to oasis history and caravan routes in northwestern Arabia. Hegra, in the AlUla area, preserves evidence of Nabataean civilisation distinct from the Islamic landmarks of Madinah city.',
      )),
    ],
  }),
  region({
    slug: 'qassim', name: l('منطقة القصيم', 'Qassim Region'), capital: l('بريدة', 'Buraydah'),
    setting: l('وسط المملكة في نجد', 'Central Saudi Arabia, in Najd'), image: 'heritage',
    summary: l('منطقة نجدية مقرها بريدة، تشتهر بزراعة النخيل وأسواق التمور وتاريخ البلدات التجارية.', 'A Najdi region administered from Buraydah, known for date cultivation, date markets and the history of trading towns.'),
    body: [
      paragraph(l('واحات وبلدات نجدية', 'Oases and Najdi towns'), l(
        'تقع القصيم في نجد، ومقرها الإداري بريدة، ومن مدنها عنيزة والرس. أسهمت الزراعة وتوافر المياه في مواضع الاستقرار في نشوء بلدات وأسواق مترابطة، ويعد وادي الرمة من أبرز معالمها الجغرافية.',
        'Qassim lies in Najd, with Buraydah as its administrative seat and Unayzah and Ar Rass among its cities. Agriculture and local water resources helped sustain connected towns and markets; Wadi Al Rummah is one of the region’s major geographical features.',
      )),
      paragraph(l('النخيل والتجارة', 'Date palms and trade'), l(
        'تحتل زراعة النخيل وتجارة التمور مكانًا بارزًا في اقتصاد القصيم وهويتها المحلية. وتفتح الأسواق والمباني التقليدية بابًا لدراسة علاقات التجار وأهل المزارع، وصلات المنطقة بطرق التجارة التي ربطت نجد بأقاليم أخرى.',
        'Date cultivation and trade have a prominent place in Qassim’s economy and local identity. Markets and traditional buildings provide a way to explore relationships between merchants and farming communities, and the routes that connected Najd with other regions.',
      )),
    ],
  }),
  region({
    slug: 'eastern-province', name: l('المنطقة الشرقية', 'Eastern Province'), capital: l('الدمام', 'Dammam'),
    setting: l('شرق المملكة على الخليج العربي', 'Eastern Saudi Arabia on the Arabian Gulf'), image: 'desert',
    summary: l('تجمع بين مدن الخليج وواحات الأحساء والقطيف والصناعة النفطية وامتدادات صحراوية نحو الربع الخالي.', 'The province brings together Gulf cities, the oases of Al-Ahsa and Qatif, the petroleum industry and deserts extending toward the Empty Quarter.'),
    body: [
      paragraph(l('الساحل والداخل', 'Coast and interior'), l(
        'الدمام هي المقر الإداري للمنطقة الشرقية، وتجاورها الخبر والظهران ضمن تجمع حضري على الخليج العربي. تمتد المنطقة إلى الداخل لتضم الأحساء وأجزاء واسعة من الصحراء، فلا تمثل مدن الساحل وحدها كامل تنوعها الجغرافي.',
        'Dammam is the province’s administrative seat, with nearby Khobar and Dhahran forming part of an urban cluster on the Arabian Gulf. The province extends inland to Al-Ahsa and extensive desert areas, so its coastal cities represent only part of its geography.',
      )),
      paragraph(l('اقتصاد متعدد الجذور', 'An economy with several roots'), l(
        'سبقت زراعة الواحات وصيد الأسماك والتجارة البحرية تطور صناعة النفط الحديثة. وتتيح الأحساء والقطيف فهم هذا التاريخ الاجتماعي والاقتصادي، بينما تعكس الظهران والجبيل ومدن أخرى التحولات المرتبطة بالطاقة والصناعة والموانئ.',
        'Oasis farming, fishing and maritime trade preceded the modern petroleum industry. Al-Ahsa and Qatif illuminate those older social and economic histories, while Dhahran, Jubail and other cities reflect changes associated with energy, industry and ports.',
      )),
    ],
  }),
  region({
    slug: 'asir', name: l('منطقة عسير', 'Asir Region'), capital: l('أبها', 'Abha'),
    setting: l('جنوب غرب المملكة', 'Southwestern Saudi Arabia'), image: 'mountains',
    summary: l('منطقة مقرها أبها، تمتد بين المرتفعات وتهامة وتتميز بالمدرجات الزراعية والعمارة المحلية.', 'Administered from Abha, Asir spans highlands and Tihamah and is associated with agricultural terraces and local building traditions.'),
    body: [
      paragraph(l('بين المرتفعات وتهامة', 'Between the highlands and Tihamah'), l(
        'تقع عسير في جنوب غرب المملكة، وتتخذ من أبها مقرًا إداريًا. تشمل المنطقة مرتفعات السروات وأجزاء من تهامة، وتؤدي فروق الارتفاع إلى تنوع في المناخ والزراعة وأنماط الاستقرار بين الجبال والسهول.',
        'Asir lies in southwestern Saudi Arabia and is administered from Abha. It includes Sarawat highlands and parts of Tihamah, with differences in elevation shaping climate, agriculture and settlement between mountains and plains.',
      )),
      paragraph(l('القرية والبيت', 'Village and home'), l(
        'تعكس المدرجات الزراعية والقرى التقليدية طرق التكيف مع المنحدرات والموارد المحلية. ومن ملامح الثقافة العسيرية فن القط العسيري في تزيين الجدران الداخلية، بينما تمثل رجال ألمع مثالًا معروفًا للعمارة الحجرية في نطاق تهامة عسير.',
        'Terraced fields and traditional villages show how communities adapted to slopes and local resources. Al-Qatt Al-Asiri interior wall decoration is one expression of regional culture, while Rijal Almaa offers a well-known example of stone architecture in Asir’s Tihamah area.',
      )),
    ],
  }),
  region({
    slug: 'tabuk', name: l('منطقة تبوك', 'Tabuk Region'), capital: l('تبوك', 'Tabuk'),
    setting: l('شمال غرب المملكة', 'Northwestern Saudi Arabia'), image: 'mountains',
    summary: l('منطقة شمالية غربية تجمع ساحل البحر الأحمر وخليج العقبة والجبال والواحات التاريخية مثل تيماء.', 'A northwestern region combining Red Sea and Gulf of Aqaba coasts, mountains and historic oases such as Tayma.'),
    body: [
      paragraph(l('ممرات الشمال الغربي', 'Northwestern routes'), l(
        'تقع منطقة تبوك في شمال غرب المملكة ومقرها مدينة تبوك. عرفت المنطقة حركة القوافل والحجاج بين بلاد الشام والحجاز، وتبقى القلاع ومحطات سكة حديد الحجاز من الشواهد على مراحل مختلفة من تاريخ تلك الطرق.',
        'Tabuk Region occupies northwestern Saudi Arabia and is administered from Tabuk city. Caravans and pilgrims travelled through this area between the Levant and the Hijaz; forts and Hejaz Railway stations preserve traces of different phases in the history of those routes.',
      )),
      paragraph(l('السواحل والواحات', 'Coasts and oases'), l(
        'تضم المنطقة مدنًا ساحلية مثل ضباء والوجه وأملج، وتمتد شمالًا إلى خليج العقبة. وفي الداخل تقدم تيماء مثالًا على تاريخ الاستقرار في الواحات، بينما تضيف السلاسل الجبلية تنوعًا إلى مشهد لا يقتصر على الصحراء الرملية.',
        'The region includes coastal towns such as Duba, Al Wajh and Umluj and reaches north to the Gulf of Aqaba. Inland, Tayma offers evidence of longstanding oasis settlement, while mountain ranges add variety to a landscape that is not simply sandy desert.',
      )),
    ],
  }),
  region({
    slug: 'hail', name: l('منطقة حائل', 'Hail Region'), capital: l('حائل', 'Hail'),
    setting: l('شمال وسط المملكة', 'North-central Saudi Arabia'), image: 'mountains',
    summary: l('تضم مدينة حائل وجبلي أجا وسلمى ومواقع الرسوم الصخرية في جبة والشويمس.', 'The region includes Hail city, the Aja and Salma mountains, and the rock-art sites of Jubbah and Shuwaymis.'),
    body: [
      paragraph(l('الجبال والصحراء', 'Mountains and desert'), l(
        'تقع منطقة حائل في شمال وسط المملكة، ومقرها مدينة حائل بالقرب من جبلي أجا وسلمى. تتصل جغرافيتها بصحراء النفود، وتجمع بين كتل صخرية وبلدات زراعية وطرق عبرتها القوافل في أزمنة مختلفة.',
        'Hail Region lies in north-central Saudi Arabia, with its administrative seat near the Aja and Salma mountains. Its geography connects with the Nafud desert and includes rocky massifs, farming settlements and routes used by caravans at different times.',
      )),
      paragraph(l('آثار الإنسان في الصخر', 'Human traces on rock'), l(
        'تضم جبة والشويمس رسومًا ونقوشًا صخرية تساعد على دراسة علاقة الإنسان بالحيوان والبيئة في الماضي. وهذه المواقع ليست مجرد زخارف منفصلة عن محيطها؛ فمواضع المياه القديمة والتضاريس المحيطة جزء من تفسير الاستقرار والحركة في المنطقة.',
        'Jubbah and Shuwaymis preserve rock images and inscriptions that help explore past relationships between people, animals and the environment. These markings are not isolated decorations: former water sources and the surrounding terrain are part of understanding settlement and movement in the region.',
      )),
    ],
  }),
  region({
    slug: 'northern-borders', name: l('منطقة الحدود الشمالية', 'Northern Borders Region'), capital: l('عرعر', 'Arar'),
    setting: l('شمال المملكة', 'Northern Saudi Arabia'), image: 'desert',
    summary: l('منطقة مقرها عرعر وتضم رفحاء وطريف، ويرتبط تاريخها الحديث بالطرق وخط التابلاين والتعدين.', 'Administered from Arar and including Rafha and Turaif, the region’s modern history is connected with roads, the Tapline pipeline and mining.'),
    body: [
      paragraph(l('مدن على امتداد الشمال', 'Towns across the north'), l(
        'تقع منطقة الحدود الشمالية بمحاذاة الحدود السعودية مع العراق، وتتخذ من عرعر مقرًا إداريًا. من مدنها رفحاء وطريف، وتضم أراضي صحراوية ومراعٍ موسمية ارتبطت بحركة السكان والرعي والتواصل عبر شمال الجزيرة العربية.',
        'Northern Borders Region runs along Saudi Arabia’s border with Iraq and is administered from Arar. Rafha and Turaif are among its towns, set within desert terrain and seasonal grazing lands linked to pastoral life and movement across northern Arabia.',
      )),
      paragraph(l('النقل والموارد', 'Transport and resources'), l(
        'أسهم خط أنابيب التابلاين ومحطاته في نمو عدد من مدن المنطقة خلال القرن العشرين. وتضيف أنشطة الفوسفات في نطاق وعد الشمال جانبًا صناعيًا إلى تاريخها، إلى جانب مواقع مثل لينة وزبالا المرتبطة بطرق السفر والحج القديمة.',
        'The Trans-Arabian Pipeline, known as Tapline, and its stations contributed to the growth of several regional towns during the twentieth century. Phosphate-related activity around Waad Al Shamal adds an industrial dimension, alongside older places such as Linah and Zubala associated with travel and pilgrimage routes.',
      )),
    ],
  }),
  region({
    slug: 'jazan', name: l('منطقة جازان', 'Jazan Region'), capital: l('جازان', 'Jazan'),
    setting: l('جنوب غرب المملكة على البحر الأحمر', 'Southwestern Saudi Arabia on the Red Sea'), image: 'mountains',
    summary: l('تجمع جازان بين السهل الساحلي وجزر فرسان والمرتفعات الزراعية في جنوب غرب المملكة.', 'Jazan combines a coastal plain, the Farasan Islands and agricultural highlands in southwestern Saudi Arabia.'),
    body: [
      paragraph(l('ساحل وجزر وجبال', 'Coast, islands and mountains'), l(
        'مدينة جازان هي المقر الإداري للمنطقة، وتقع على البحر الأحمر قرب الطرف الجنوبي الغربي للمملكة. وتشمل المنطقة جزر فرسان في البحر ومرتفعات داخلية مثل فيفاء، فتتباين فيها البيئات البحرية والسهلية والجبلية.',
        'Jazan city, on the Red Sea near the kingdom’s southwestern end, is the regional administrative seat. The region includes the offshore Farasan Islands and inland highlands such as Fayfa, bringing marine, lowland and mountain environments together.',
      )),
      paragraph(l('الزراعة والبحر', 'Agriculture and the sea'), l(
        'تظهر الزراعة في السهول والمدرجات الجبلية بأشكال تختلف باختلاف المياه والارتفاع. وترتبط أجزاء من المرتفعات بزراعة البن، بينما يشكل الصيد والملاحة وتاريخ جزر فرسان جوانب أخرى من الحياة المحلية لا تختزلها صورة واحدة عن المنطقة.',
        'Farming on the plains and mountain terraces takes different forms according to water availability and elevation. Coffee cultivation is associated with parts of the highlands, while fishing, seafaring and the history of the Farasan Islands represent other aspects of local life.',
      )),
    ],
  }),
  region({
    slug: 'najran', name: l('منطقة نجران', 'Najran Region'), capital: l('نجران', 'Najran'),
    setting: l('جنوب المملكة', 'Southern Saudi Arabia'), image: 'heritage',
    summary: l('منطقة جنوبية حول وادي نجران، تتميز بالعمارة الطينية وموقع الأخدود وامتدادها نحو الربع الخالي.', 'A southern region around Wadi Najran, associated with earthen architecture, the Al-Ukhdud site and landscapes extending toward the Empty Quarter.'),
    body: [
      paragraph(l('الوادي والاستقرار', 'The wadi and settlement'), l(
        'تقع منطقة نجران في جنوب المملكة، ومقرها مدينة نجران. أسهم الوادي في دعم الزراعة والاستقرار، وتظهر البيوت التقليدية متعددة الطوابق استخدام الطين ومواد محلية في عمارة تلائم المجتمع والبيئة.',
        'Najran Region lies in southern Saudi Arabia and is administered from Najran city. The wadi helped sustain farming and settlement, while traditional multistorey houses demonstrate the use of earth and other local materials in architecture shaped by community life and environment.',
      )),
      paragraph(l('مواقع وطرق قديمة', 'Ancient sites and routes'), l(
        'يعد الأخدود من أبرز المواقع الأثرية في نجران، ويربط المنطقة بتاريخ مدن جنوب الجزيرة العربية. وتضم المنطقة أيضًا نطاق حِمى الثقافي بما فيه من نقوش ورسوم صخرية، بينما تمتد أراضيها شرقًا نحو البيئات الصحراوية للربع الخالي.',
        'Al-Ukhdud is a major archaeological site connecting Najran with the history of southern Arabian towns. The region also includes the Hima cultural area with its inscriptions and rock art, while its lands extend eastward toward the desert environments of the Empty Quarter.',
      )),
    ],
  }),
  region({
    slug: 'bahah', name: l('منطقة الباحة', 'Bahah Region'), capital: l('الباحة', 'Al Bahah'),
    setting: l('جنوب غرب المملكة', 'Southwestern Saudi Arabia'), image: 'mountains',
    summary: l('منطقة بين السراة وتهامة، تضم قرى حجرية ومدرجات زراعية ومناظر جبلية حول مدينة الباحة.', 'A region spanning Sarah highlands and Tihamah, with stone villages, agricultural terraces and mountain landscapes around Al Bahah city.'),
    body: [
      paragraph(l('تدرج الارتفاع', 'A landscape of changing elevation'), l(
        'تتخذ منطقة الباحة من مدينة الباحة مقرًا إداريًا، وتمتد بين مرتفعات السراة وأجزاء من تهامة. يفسر اختلاف الارتفاع جانبًا من تنوع الطقس والنبات والزراعة، فلا تتشابه قرى المرتفعات والسفوح في جميع خصائصها.',
        'Bahah Region is administered from Al Bahah city and spans the Sarah highlands and parts of Tihamah. Differences in elevation help explain variations in weather, vegetation and farming, so highland and foothill villages do not share a single uniform environment.',
      )),
      paragraph(l('الحجر والمدرجات', 'Stone and terraces'), l(
        'تقدم القرى الحجرية والمدرجات الزراعية شواهد على تنظيم العمل واستخدام الأرض في المنطقة. ومن أمثلتها قرية ذي عين في نطاق المخواة، حيث يجتمع البناء الحجري والزراعة ومصدر المياه في مشهد يساعد على فهم علاقة القرية بموضعها.',
        'Stone villages and agricultural terraces illustrate ways of organising work and using land. Dhee Ayn, in the Al Makhwah area, is one example: its stone buildings, cultivated land and water source help explain the close relationship between a village and its setting.',
      )),
    ],
  }),
  region({
    slug: 'jawf', name: l('منطقة الجوف', 'Jawf Region'), capital: l('سكاكا', 'Sakaka'),
    setting: l('شمال المملكة', 'Northern Saudi Arabia'), image: 'heritage',
    summary: l('منطقة مقرها سكاكا، تضم دومة الجندل والقريات وتجمع بين آثار الواحات وزراعة النخيل والزيتون.', 'Administered from Sakaka, Jawf includes Dumat Al Jandal and Qurayyat and combines oasis archaeology with date and olive cultivation.'),
    body: [
      paragraph(l('واحات الشمال', 'Northern oases'), l(
        'تقع الجوف في شمال المملكة وتتخذ من سكاكا مقرًا إداريًا. تضم دومة الجندل والقريات، وترتبط جغرافيتها بواحات وطرق تصل شمال الجزيرة العربية ببلاد الشام؛ وهي منطقة إدارية مستقلة عن منطقة الحدود الشمالية.',
        'Jawf lies in northern Saudi Arabia and is administered from Sakaka. It includes Dumat Al Jandal and Qurayyat, with oases and routes connecting northern Arabia to the Levant. It is a separate administrative region from Northern Borders.',
      )),
      paragraph(l('الآثار والزراعة', 'Archaeology and agriculture'), l(
        'تتيح قلعة مارد في دومة الجندل وأعمدة الرجاجيل قرب سكاكا مداخل إلى فترات مختلفة من تاريخ المنطقة، ولا تنتمي جميع آثار الجوف إلى عصر واحد. وتشكل زراعة النخيل والزيتون جانبًا مهمًا من مشهدها الزراعي المعاصر.',
        'Marid Castle in Dumat Al Jandal and the Rajajil standing stones near Sakaka offer introductions to different periods of regional history; Jawf’s monuments do not all belong to one era. Date palms and olive cultivation are important features of its contemporary agricultural landscape.',
      )),
    ],
  }),
];

const kingEntries: Entry[] = kingBatch.topics.map(topic => preview({
  slug: topic.slug, section: topic.section, kind: 'ruler', period: topic.period, featured: topic.featured ?? false,
  title: l(topic.ar.title, topic.en.title), summary: l(topic.ar.summary, topic.en.summary),
  category: l(topic.ar.category, topic.en.category),
  image: `/images/kings/${topic.slug}.webp`, imageAlt: l(topic.ar.imageAlt, topic.en.imageAlt),
  imageCredit: {
    attribution: `${topic.image.attribution} Local preview: converted to WebP at quality 85 and proportionally resized within 1000 × 1200 without enlargement. No additional crop or retouching. / المعاينة المحلية: تحويل إلى WebP وتصغير تناسبي دون تكبير أو قص إضافي أو تنقيح.`,
    license: `${topic.image.license} — ${topic.image.licenseUrl}`,
  },
  seo: {
    ar: { seoTitle: topic.ar.seoTitle, seoDescription: topic.ar.seoDescription, noIndex: true },
    en: { seoTitle: topic.en.seoTitle, seoDescription: topic.en.seoDescription, noIndex: true },
  },
  facts: topic.ar.facts.map((row, index) => fact(l(row.label, topic.en.facts[index].label), l(row.value, topic.en.facts[index].value))),
  body: topic.ar.body.map((row, index) => paragraph(l(row.heading, topic.en.body[index].heading), l(row.text, topic.en.body[index].text))),
  sources: topic.ar.sources.map((source, index) => ({ title: l(source.title, topic.en.sources[index].title), url: source.url })),
}));

const notableEntries: Entry[] = [
  preview({
    slug: 'ghazi-al-gosaibi', section: 'people', kind: 'notable',
    title: l('غازي القصيبي', 'Ghazi Al Gosaibi'),
    summary: l('كاتب وشاعر ودبلوماسي ووزير سعودي جمع بين العمل العام والإنتاج الأدبي في الشعر والرواية والسيرة.', 'A Saudi writer, poet, diplomat and minister whose public career accompanied work in poetry, fiction and memoir.'),
    category: l('الأدب والإدارة', 'Literature and public administration'), period: '1940–2010',
    ...images.heritage,
    facts: [
      fact(l('المجالات', 'Fields'), l('الأدب والدبلوماسية والإدارة العامة', 'Literature, diplomacy and public administration')),
      fact(l('عمل معروف', 'Selected work'), l('حياة في الإدارة', 'A Life in Administration (Hayat fi al-Idarah)')),
    ],
    body: [
      paragraph(l('خدمة عامة وكتابة', 'Public service and writing'), l(
        'ولد غازي القصيبي عام 1940 وتوفي عام 2010، وعمل في التدريس الجامعي والوزارات والدبلوماسية. تولى حقائب من بينها الصناعة والكهرباء والصحة والعمل، ومثّل المملكة سفيرًا في البحرين ثم بريطانيا، فامتدت تجربته بين الإدارة المحلية والعلاقات الخارجية.',
        'Ghazi Al Gosaibi lived from 1940 to 2010 and worked in university teaching, government and diplomacy. His ministerial responsibilities included industry and electricity, health, and labour; he also represented Saudi Arabia as ambassador to Bahrain and later Britain, connecting domestic administration with foreign relations.',
      )),
      paragraph(l('صوت أدبي متعدد الأشكال', 'A literary voice in several forms'), l(
        'كتب القصيبي الشعر والرواية والنصوص التي تتناول تجربته الشخصية والمهنية، ومن أعماله «حياة في الإدارة» ورواية «شقة الحرية». وتتيح قراءة هذه الأعمال مع سياقها فهم تداخل الأدب والعمل العام، مع التمييز بين السرد الروائي والشهادة الشخصية والمعلومة التاريخية الموثقة.',
        'Al Gosaibi wrote poetry, fiction and reflections on his personal and professional experience, including Hayat fi al-Idarah and the novel Shaqqat al-Hurriyah. Reading these works in context helps explore the overlap of literature and public service while distinguishing fiction, personal testimony and independently documented history.',
      )),
    ], sources: [],
  }),
  preview({
    slug: 'hayat-sindi', section: 'people', kind: 'notable',
    title: l('حياة سندي', 'Hayat Sindi'),
    summary: l('عالمة سعودية في التقنية الحيوية، ارتبط عملها بالتشخيص الطبي الميسر وتشجيع الابتكار العلمي وريادة الأعمال.', 'A Saudi biotechnology scientist whose work is associated with accessible medical diagnostics and support for scientific innovation and entrepreneurship.'),
    category: l('العلوم والابتكار', 'Science and innovation'),
    ...images.heritage,
    facts: [
      fact(l('مجال العمل', 'Field'), l('التقنية الحيوية والتشخيص الطبي', 'Biotechnology and medical diagnostics')),
      fact(l('الدراسة البحثية', 'Research training'), l('دكتوراه في التقنية الحيوية من جامعة كامبريدج', 'PhD in biotechnology from the University of Cambridge')),
    ],
    body: [
      paragraph(l('العلم والتطبيق الطبي', 'Science and medical applications'), l(
        'حياة سندي باحثة سعودية تلقت تدريبًا علميًا في بريطانيا وحصلت على الدكتوراه في التقنية الحيوية من جامعة كامبريدج. ارتبط عملها بمشروعات تسعى إلى جعل أدوات التشخيص الطبي أبسط وأقل تكلفة، بما يوسع إمكان استخدامها خارج المختبرات المجهزة تجهيزًا كاملًا.',
        'Hayat Sindi is a Saudi researcher who trained in Britain and earned a doctorate in biotechnology at the University of Cambridge. Her work has been associated with efforts to make medical diagnostic tools simpler and less costly, with the aim of extending their use beyond fully equipped laboratories.',
      )),
      paragraph(l('الابتكار وإتاحة الفرص', 'Innovation and opportunity'), l(
        'شاركت سندي في تأسيس مبادرات تربط البحث العلمي بالتطبيق وريادة الأعمال، ومنها «التشخيص للجميع» ومؤسسة i2. وتقدم تجربتها مدخلًا لمناقشة دور الفرق العلمية والتمويل والتدريب في تحويل الأفكار إلى أدوات نافعة، دون نسبة إنجازات العمل الجماعي إلى شخص واحد أو افتراض اعتماد طبي لكل نموذج بحثي.',
        'Sindi helped establish initiatives linking scientific research with practical application and entrepreneurship, including Diagnostics For All and the i2 institute. Her career offers a starting point for examining the roles of scientific teams, funding and training in turning ideas into useful tools, without attributing collaborative achievements to one person or assuming that every research prototype has clinical approval.',
      )),
    ], sources: [],
  }),
];

const heritageEntries: Entry[] = [
  preview({
    slug: 'at-turaif', section: 'heritage',
    title: l('حي الطريف في الدرعية', 'At-Turaif District in Diriyah'),
    summary: l('حي تاريخي في الدرعية يضم قصورًا وعمارة نجدية طينية، ويرتبط بالمركز السياسي للدولة السعودية الأولى.', 'A historic district in Diriyah with palaces and Najdi earthen architecture, associated with the political centre of the First Saudi State.'),
    category: l('مواقع التراث العالمي', 'World Heritage sites'),
    ...images.diriyah, featured: true,
    facts: [
      fact(l('المنطقة', 'Region'), l('الرياض', 'Riyadh')),
      fact(l('سنة الإدراج في قائمة التراث العالمي', 'World Heritage inscription year'), l('2010', '2010')),
    ],
    body: [
      paragraph(l('العمارة والحكم', 'Architecture and government'), l(
        'يقع حي الطريف في الدرعية قرب وادي حنيفة، وكان مركزًا للحكم في الدولة السعودية الأولى. يضم بقايا قصور ومبانٍ وشبكة من الممرات، وتظهر فيه خصائص العمارة النجدية التي تعتمد على الطين وتكيف الكتل والفراغات مع البيئة المحلية.',
        'At-Turaif lies in Diriyah near Wadi Hanifah and served as a centre of government in the First Saudi State. Palace remains, buildings and passageways preserve features of Najdi architecture, including earthen construction and arrangements of built space adapted to local conditions.',
      )),
      paragraph(l('قراءة الموقع وصونه', 'Interpreting and conserving the site'), l(
        'أُدرج الطريف في قائمة التراث العالمي عام 2010. وتكمن أهمية زيارته ودراسته في قراءة العلاقة بين الحكم والواحة والعمران، مع التمييز بين الأجزاء التاريخية وأعمال الترميم والتفسير المتحفي الحديثة؛ فالموقع الأثري ليس صورة ثابتة مكتملة للحياة في الماضي.',
        'At-Turaif was inscribed on the World Heritage List in 2010. Studying the site connects government, oasis life and urban form, while requiring a distinction between historic fabric, restoration and modern museum interpretation. An archaeological site is not a complete, unchanging picture of past life.',
      )),
    ], sources: unesco('1329', l('حي الطريف في الدرعية', "At-Turaif District in ad-Dir'iyah")),
  }),
  preview({
    slug: 'hegra', section: 'heritage',
    title: l('الحِجر: مدائن صالح', 'Hegra: Al-Hijr / Madain Salih'),
    summary: l('موقع أثري في العلا معروف بالمقابر النبطية المنحوتة في الصخر والنقوش والآبار، وأول موقع سعودي أُدرج في قائمة التراث العالمي.', 'An archaeological site in AlUla known for Nabataean rock-cut tombs, inscriptions and wells, and the first Saudi property inscribed on the World Heritage List.'),
    category: l('مواقع التراث العالمي', 'World Heritage sites'),
    ...images.desert, featured: true,
    facts: [
      fact(l('المنطقة', 'Region'), l('المدينة المنورة، نطاق العلا', 'Madinah Region, AlUla area')),
      fact(l('سنة الإدراج في قائمة التراث العالمي', 'World Heritage inscription year'), l('2008', '2008')),
    ],
    body: [
      paragraph(l('مدينة في شبكة القوافل', 'A town within caravan networks'), l(
        'يقع الحِجر في نطاق العلا شمال غرب المملكة، ويحفظ شواهد بارزة على الحضارة النبطية جنوب البتراء. تربط المقابر المنحوتة وواجهاتها المزخرفة بين المهارة المعمارية وتقاليد الدفن، بينما تساعد النقوش على دراسة اللغة والملكية والعلاقات الاجتماعية.',
        'Hegra lies in the AlUla area of northwestern Saudi Arabia and preserves important evidence of Nabataean civilisation south of Petra. Rock-cut tombs and their decorated façades connect architectural skill with funerary traditions, while inscriptions help researchers investigate language, ownership and social relationships.',
      )),
      paragraph(l('ما وراء واجهات المقابر', 'Beyond the tomb façades'), l(
        'تشمل دلالة الموقع الآبار وتدبير المياه وصلاته بتجارة القوافل، ولا تقتصر على المقابر التي تشتهر بها صوره. أُدرج الحِجر في قائمة التراث العالمي عام 2008، ويخص الإدراج موقعًا محددًا، لا جميع المواقع الأثرية والطبيعية في العلا.',
        'The site’s significance also includes wells, water management and connections to caravan trade, not only the tombs prominent in photographs. Hegra was inscribed on the World Heritage List in 2008; the inscription concerns a defined property, not every archaeological or natural site in AlUla.',
      )),
    ], sources: unesco('1293', l('موقع الحِجر الأثري', 'Hegra Archaeological Site (al-Hijr / Madain Salih)')),
  }),
  preview({
    slug: 'historic-jeddah', section: 'heritage',
    title: l('جدة التاريخية: بوابة مكة', 'Historic Jeddah, the Gate to Makkah'),
    summary: l('نسيج عمراني على البحر الأحمر شكلته التجارة ورحلات الحج، وتتميز بيوته بالرواشين الخشبية والعمارة الساحلية.', 'A Red Sea urban landscape shaped by trade and pilgrimage, with wooden roshan windows and distinctive coastal building traditions.'),
    category: l('مواقع التراث العالمي', 'World Heritage sites'),
    ...images.heritage, featured: true,
    facts: [
      fact(l('المنطقة', 'Region'), l('مكة المكرمة', 'Makkah')),
      fact(l('سنة الإدراج في قائمة التراث العالمي', 'World Heritage inscription year'), l('2014', '2014')),
    ],
    body: [
      paragraph(l('مدينة الميناء والحجاج', 'A port and pilgrimage city'), l(
        'نمت جدة التاريخية بوصفها ميناءً للتجارة وبوابة بحرية للحجاج القادمين إلى مكة. حمل التواصل عبر البحر الأحمر والمحيط الهندي أشخاصًا وبضائع ومهارات، وترك أثره في الأسواق والأحياء والبيوت التي تعبر عن تاريخ المدينة المتعدد الروابط.',
        'Historic Jeddah developed as a trading port and a maritime gateway for pilgrims travelling to Makkah. Connections across the Red Sea and Indian Ocean brought people, goods and skills, shaping markets, neighbourhoods and houses that reflect the city’s many relationships.',
      )),
      paragraph(l('الرواشين والنسيج الحي', 'Roshan windows and a living urban fabric'), l(
        'من سمات بيوتها الرواشين الخشبية البارزة والبناء بالحجر المرجاني، مع حلول للتهوية والظل تلائم المناخ الساحلي. أُدرجت جدة التاريخية في قائمة التراث العالمي عام 2014؛ وتتعلق قيمتها أيضًا بتجاور البيوت والمساجد والأسواق واستمرار الحياة الاجتماعية، لا بالمباني المنفردة وحدها.',
        'Projecting wooden roshan windows and coral-stone construction are characteristic features, with ventilation and shade responding to the coastal climate. Historic Jeddah was inscribed on the World Heritage List in 2014. Its significance includes the relationships between homes, mosques and markets and the continuation of social life, not just individual buildings.',
      )),
    ], sources: unesco('1361', l('جدة التاريخية، بوابة مكة', 'Historic Jeddah, the Gate to Makkah')),
  }),
  preview({
    slug: 'hail-rock-art', section: 'heritage',
    title: l('الفنون الصخرية في منطقة حائل', 'Rock Art in the Hail Region'),
    summary: l('مجموعات من الرسوم والنقوش في جبة والشويمس تسجل جوانب من حياة الإنسان والحيوان وتغير البيئة عبر فترات طويلة.', 'Groups of rock images and inscriptions at Jubbah and Shuwaymis record aspects of human and animal life and long-term environmental change.'),
    category: l('مواقع التراث العالمي', 'World Heritage sites'),
    ...images.mountains,
    facts: [
      fact(l('المكونات', 'Components'), l('جبل أم سنمان في جبة، وجبلا المنجور وراط في الشويمس', 'Jabal Umm Sinman at Jubbah; Jabal Al-Manjor and Raat at Shuwaymis')),
      fact(l('سنة الإدراج في قائمة التراث العالمي', 'World Heritage inscription year'), l('2015', '2015')),
    ],
    body: [
      paragraph(l('الرسوم في بيئتها', 'Rock art in its setting'), l(
        'يشمل موقع التراث العالمي جبل أم سنمان في جبة وجبلي المنجور وراط في الشويمس. تظهر على الصخور أشكال بشرية وحيوانية ونقوش من فترات مختلفة، وتساعد قراءتها مع آثار المياه القديمة على فهم تغير البيئات وأنماط الحركة والاستقرار.',
        'The World Heritage property includes Jabal Umm Sinman at Jubbah and Jabal Al-Manjor and Raat at Shuwaymis. Human and animal figures and inscriptions belong to different periods. Reading them alongside evidence of former water sources helps explain changes in environment, movement and settlement.',
      )),
      paragraph(l('التوثيق والحماية', 'Documentation and protection'), l(
        'أُدرج الموقع في قائمة التراث العالمي عام 2015. تتطلب دراسة الرسوم مقارنة الأساليب والتراكب والسياق الأثري؛ ولا يمكن استنتاج تاريخ دقيق لكل رسم من مظهره وحده. وتبقى حماية الأسطح الصخرية من الخدش والعبث ضرورية للحفاظ على المعلومات التي تحملها.',
        'The property was inscribed on the World Heritage List in 2015. Studying its images requires comparison of styles, overlapping marks and archaeological context; appearance alone cannot establish an exact date for every figure. Protecting rock surfaces from scratching and other damage preserves the evidence they carry.',
      )),
    ], sources: unesco('1472', l('الفنون الصخرية في منطقة حائل في المملكة العربية السعودية', 'Rock Art in the Hail Region of Saudi Arabia')),
  }),
  preview({
    slug: 'al-ahsa-oasis', section: 'heritage',
    title: l('واحة الأحساء: منظر ثقافي متطور', 'Al-Ahsa Oasis, an Evolving Cultural Landscape'),
    summary: l('منظر ثقافي في شرق المملكة يجمع بساتين النخيل ومصادر المياه وقنوات الري والمباني التاريخية في بيئة استقرار وزراعة.', 'A cultural landscape in eastern Saudi Arabia combining palm gardens, water sources, irrigation channels and historic buildings within a setting of settlement and agriculture.'),
    category: l('مواقع التراث العالمي', 'World Heritage sites'),
    ...images.heritage,
    facts: [
      fact(l('المنطقة', 'Region'), l('المنطقة الشرقية', 'Eastern Province')),
      fact(l('سنة الإدراج في قائمة التراث العالمي', 'World Heritage inscription year'), l('2018', '2018')),
    ],
    body: [
      paragraph(l('الماء يصنع الواحة', 'Water and the making of an oasis'), l(
        'تقوم واحة الأحساء على علاقة طويلة بين المياه والزراعة والاستقرار في شرق الجزيرة العربية. يشمل موقع التراث العالمي بساتين وقنوات وعيونًا وآبارًا ومباني تاريخية ومواقع أثرية، لذلك فهو منظر ثقافي متعدد المكونات وليس بستان نخيل واحدًا.',
        'Al-Ahsa Oasis reflects a long relationship between water, farming and settlement in eastern Arabia. The World Heritage property includes gardens, channels, springs, wells, historic buildings and archaeological sites. It is therefore a cultural landscape with several components rather than a single palm grove.',
      )),
      paragraph(l('تراث زراعي وعمراني', 'Agricultural and urban heritage'), l(
        'تربط زراعة النخيل وأسواق الهفوف والمباني التاريخية بين الحياة الريفية والحضرية في الأحساء. أُدرجت الواحة في قائمة التراث العالمي عام 2018، وتساعد دراستها على فهم تنظيم الري واستخدام الأرض واستمرار العمل الزراعي، مع ضرورة متابعة الضغوط العمرانية والبيئية بمعلومات حديثة.',
        'Date cultivation, the markets of Al Hofuf and historic buildings connect rural and urban life in Al-Ahsa. The oasis was inscribed on the World Heritage List in 2018. Its study offers insight into irrigation, land use and continuing agricultural work, while urban and environmental pressures require up-to-date evidence.',
      )),
    ], sources: unesco('1563', l('واحة الأحساء، منظر ثقافي متطور', 'Al-Ahsa Oasis, an Evolving Cultural Landscape')),
  }),
];

/** 30 distinct bilingual topics; every seed is explicitly an editorial preview. */
export const entries: Entry[] = [
  ...historyEntries,
  ...regionEntries,
  ...kingEntries,
  ...notableEntries,
  ...heritageEntries,
];

export function isLocale(v: string): v is Locale {
  return v === 'ar' || v === 'en';
}

export function localize(value: Localized, locale: Locale): string {
  return value[locale];
}

export function entryPath(entry: Pick<Entry, 'section' | 'slug'>, locale: Locale): string {
  return `/${locale}/${entry.section}/${entry.slug}`;
}

/** Search-only folding; display text is never changed. Not Arabic stemming. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '') // Arabic vocalisation, Quranic marks, Latin accents.
    .replace(/\u0640/g, '') // Tatweel (kashida).
    .replace(/[آأإٱٲٳٵ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * All query tokens must occur in the selected locale's title/category/summary
 * or the shared period. Preserves input order; returns a new array, even when
 * the query folds to empty. Publication/access filtering belongs to the caller.
 */
export function searchEntries(items: Entry[], query: string, locale: Locale): Entry[] {
  const normalized = normalizeSearch(query);
  if (!normalized) return items.slice();

  const tokens = normalized.split(' ');
  return items.filter((entry) => {
    const searchable = normalizeSearch([
      localize(entry.title, locale),
      localize(entry.category, locale),
      localize(entry.summary, locale),
      entry.period ?? '',
    ].join(' '));
    return tokens.every((token) => searchable.includes(token));
  });
}