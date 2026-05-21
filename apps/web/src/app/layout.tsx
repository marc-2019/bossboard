import type { Metadata } from 'next';
import Script from 'next/script';
import { AuthProvider } from '@/providers/auth-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'BossBoard',
  description: 'Your whole business. One screen.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/klaro/klaro.min.css" />
      </head>
      <body className="antialiased">
        <Script src="/klaro/analytics.js" strategy="beforeInteractive" />
        <Script src="/klaro/klaro-no-css.js" strategy="afterInteractive" />
        <AuthProvider>{children}</AuthProvider>
        <div id="klaro" />
      </body>
    </html>
  );
}
