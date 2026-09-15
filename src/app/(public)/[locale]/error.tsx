'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { locale } = useParams();
  const ar = locale !== 'en';
  return <main id="main-content" className="container empty-state"><p className="eyebrow">{ar ? 'تعذّر تحميل المحتوى' : 'CONTENT UNAVAILABLE'}</p><h1>{ar ? 'نعتذر، حدث خطأ مؤقت' : 'Something went wrong'}</h1><p>{ar ? 'تعذّر الاتصال بمصدر المحتوى. لم يُستبدل المحتوى المنشور ببيانات تجريبية.' : 'The content service could not be reached. Published content has not been replaced with demo data.'}</p><button className="button" onClick={reset}>{ar ? 'إعادة المحاولة' : 'Try again'}</button><Link href={`/${ar ? 'ar' : 'en'}`}>{ar ? 'الرئيسية' : 'Home'}</Link></main>;
}