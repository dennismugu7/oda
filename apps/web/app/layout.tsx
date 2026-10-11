import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Inter } from 'next/font/google';
import { connection } from 'next/server';
import { colors } from '@oda/ui-tokens';
import './globals.css';

// Inter for text, Bricolage Grotesque for headings (decision #102); both self-hosted by Next.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bricolage',
});

export const metadata: Metadata = {
  // Absolute URLs for link previews (og:image) use the configured shop base URL.
  metadataBase: new URL(process.env.PUBLIC_SHOP_BASE_URL ?? 'http://localhost:3000'),
  title: 'oda · Your free shop link',
  description: 'A free shop link for Kenyan social sellers. Buyers pay you directly on M-Pesa.',
};

export const viewport: Viewport = {
  themeColor: colors.navy,
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders per request so Next.js can put this request's CSP nonce on its
  // scripts (proxy.ts, decision #81 c); a prerendered page would carry none and be blocked.
  await connection();
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
