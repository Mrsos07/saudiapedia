'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
export default function NotFound() {
  const { locale } = useParams();
  const ar = locale !== 'en';
  return <main id="main-content" className="container empty-state"><p className="eyebrow">404</p><h1>{ar ? 'هذه الصفحة غير متاحة' : 'This page is not available'}</h1><p>{ar ? 'قد يكون الرابط غير صحيح أو لم يُنشر المقال بعد.' : 'The address may be incorrect, or the article is not published yet.'}</p><Link className="button" href={`/${ar ? 'ar' : 'en'}`}>{ar ? 'العودة إلى الموسوعة' : 'Back to the encyclopedia'}</Link></main>;
}