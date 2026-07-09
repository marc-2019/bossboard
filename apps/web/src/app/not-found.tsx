import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page Not Found',
  description: 'The page you are looking for does not exist.',
};

export default function NotFoundPage() {
  return (
    <div style={{ textAlign: 'center', marginTop: '20vh', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '72px', color: '#1a1a1a', margin: 0 }}>404</h1>
      <p style={{ fontSize: '18px', color: '#555', margin: '20px 0' }}>
        Oops — this page is missing.
      </p>
      <p style={{ fontSize: '16px', color: '#888' }}>
        Head back to the{' '}
        <Link href="/" style={{ color: '#0f766e', textDecoration: 'underline' }}>
          homepage
        </Link>
        .
      </p>
    </div>
  );
}
