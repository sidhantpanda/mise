import type { Metadata, Viewport } from 'next';
import { Fraunces, Geist } from 'next/font/google';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { siteUrl } from '@/lib/site-url';
import './global.css';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-mise-sans',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-mise-display',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Mise — Your kitchen, organized',
    template: '%s · Mise',
  },
  description:
    'Mise is a self-hosted kitchen companion for recipes, meal plans, pantry, and shopping—with your data stored in an open format.',
  applicationName: 'Mise',
  authors: [{ name: 'Mise contributors', url: 'https://github.com/sidhantpanda/mise' }],
  keywords: ['self-hosted', 'recipes', 'meal planning', 'pantry', 'Docker', 'MCP'],
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Mise',
    title: 'Mise — Your kitchen, organized',
    description: 'A self-hosted kitchen companion built around open, portable data.',
    images: [{ url: '/og-mise.png', width: 1200, height: 630, alt: 'Mise — Your kitchen, properly organized' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mise — Your kitchen, organized',
    description: 'A self-hosted kitchen companion built around open, portable data.',
    images: ['/og-mise.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#f8f3e8',
  colorScheme: 'light dark',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
