export const loginCopy = {
  ar: {
    brand: 'موسوعة المملكة',
    eyebrow: 'مساحة فريق التحرير',
    title: 'تسجيل الدخول إلى لوحة التحكم',
    description: 'أهلًا بك مجددًا. سجّل الدخول بحساب فريق التحرير لإدارة محتوى الموسوعة.',
    help: 'تحتاج إلى حساب أو مساعدة في الدخول؟ تواصل مع مسؤول لوحة التحكم. استعادة كلمة المرور بالبريد غير مفعّلة حاليًا.',
    back: 'العودة إلى الموسوعة',
    setupTitle: 'لوحة التحكم بانتظار التهيئة',
    setupDescription: 'يلزم إعداد اتصال قاعدة البيانات وسر الجلسات في بيئة الخادم قبل إتاحة تسجيل الدخول.',
    setupHelp: 'راجع docs/cms.md لإكمال الترحيلات وإعداد حساب المسؤول الأول. لا تُدخل كلمات المرور أو مفاتيح الاتصال في هذه الصفحة.',
  },
  en: {
    brand: 'Kingdom Encyclopedia',
    eyebrow: 'Editorial workspace',
    title: 'Sign in to the dashboard',
    description: 'Welcome back. Sign in with your editorial team account to manage encyclopedia content.',
    help: 'Need an account or help signing in? Contact your dashboard administrator. Email password recovery is not configured yet.',
    back: 'Back to the encyclopedia',
    setupTitle: 'Dashboard setup required',
    setupDescription: 'Configure the database connection and session secret in the server environment before sign-in is available.',
    setupHelp: 'See docs/cms.md to complete migrations and set up the first administrator. Do not enter passwords or connection keys on this page.',
  },
} as const;

export function loginLanguage(language: string | undefined): 'ar' | 'en' {
  return language === 'en' ? 'en' : 'ar';
}